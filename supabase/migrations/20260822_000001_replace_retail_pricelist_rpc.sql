-- Replace the retail pricelist in one database transaction.
-- The backend calls this with the service-role client after validating the upload.
drop function if exists public.replace_retail_pricelist(jsonb, date);

create or replace function public.replace_retail_pricelist(
  p_items jsonb,
  p_effective_from date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, catalog
as $function$
declare
  v_received_count integer := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  v_unique_count integer;
  v_new_products_count integer := 0;
  v_stock_rows_created integer := 0;
  v_archived_products_count integer := 0;
  v_changed_count integer := 0;
  v_unchanged_count integer := 0;
  v_price_changes jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or v_received_count = 0 then
    raise exception using message = 'Provide at least one valid part number and price.', errcode = '22023';
  end if;

  create temporary table _retail_pricelist_raw (
    source_line_number integer not null,
    sku text not null,
    name text,
    model_name text,
    price numeric(12, 2) not null,
    category text,
    source_category text
  ) on commit drop;

  insert into _retail_pricelist_raw (source_line_number, sku, name, model_name, price, category, source_category)
  select
    entry.ordinality::integer,
    upper(trim(entry.value ->> 'sku')),
    nullif(trim(entry.value ->> 'name'), ''),
    nullif(trim(coalesce(entry.value ->> 'model', entry.value ->> 'application')), ''),
    round((entry.value ->> 'price')::numeric, 2),
    nullif(trim(entry.value ->> 'category'), ''),
    nullif(trim(coalesce(entry.value ->> 'sourceCategory', entry.value ->> 'category')), '')
  from jsonb_array_elements(p_items) with ordinality as entry(value, ordinality)
  where nullif(trim(entry.value ->> 'sku'), '') is not null
    and (entry.value ->> 'price') ~ '^([0-9]+(\.[0-9]+)?|\.[0-9]+)$';

  create temporary table _retail_pricelist_items (
    source_line_number integer not null,
    sku text primary key,
    name text,
    model_name text,
    price numeric(12, 2) not null,
    category text,
    source_category text
  ) on commit drop;

  insert into _retail_pricelist_items (source_line_number, sku, name, model_name, price, category, source_category)
  select distinct on (sku)
    source_line_number, sku, name, model_name, price, category, source_category
  from _retail_pricelist_raw
  order by sku, source_line_number desc;

  select count(*) into v_unique_count from _retail_pricelist_items;

  if v_unique_count = 0 then
    raise exception using message = 'Provide at least one valid part number and price.', errcode = '22023';
  end if;

  create temporary table _retail_pricelist_previous_prices on commit drop as
  select
    p.id as product_id,
    p.sku,
    current_price.amount
  from catalog.products p
  join _retail_pricelist_items i on i.sku = p.sku
  left join lateral (
    select pp.amount
    from catalog.product_prices pp
    where pp.product_id = p.id
      and pp.price_type = 'retail'
      and pp.is_current = true
    order by pp.effective_from desc, pp.created_at desc
    limit 1
  ) current_price on true;

  select count(*)
  into v_new_products_count
  from _retail_pricelist_items i
  left join catalog.products p on p.sku = i.sku
  where p.id is null;

  -- The staging table is the public pricelist source, so replace it atomically.
  delete from catalog.pricelist_import_staging;

  insert into catalog.pricelist_import_staging (
    source_sheet, source_line_number, sku, name, model_name, uom, pcc, price,
    status, category, source_category, classification_version,
    classification_confidence, classification_strategy, classification_rule_key,
    classification_tokens, imported_at
  )
  select
    'upload', source_line_number, sku, coalesce(name, sku), model_name, 'PC', null, price,
    'out_of_stock', coalesce(category, 'General Parts & Accessories'), source_category,
    null, null, null, null, '[]'::jsonb, now()
  from _retail_pricelist_items;

  insert into catalog.products (
    sku, name, model_name, category, brand, uom, status, is_active,
    metadata, business_date, updated_at, source_category
  )
  select
    i.sku,
    coalesce(i.name, i.sku),
    i.model_name,
    coalesce(i.category, 'General Parts & Accessories'),
    'Mitsubishi',
    'PC',
    'out_of_stock',
    true,
    jsonb_build_object(
      'priceListUpload', jsonb_build_object(
        'source', 'bulk-replace-file',
        'effectiveFrom', p_effective_from,
        'uploadedAt', now()
      )
    ),
    p_effective_from,
    now(),
    i.source_category
  from _retail_pricelist_items i
  on conflict (sku) do update
  set name = coalesce(nullif(excluded.name, ''), catalog.products.name, excluded.sku),
      model_name = coalesce(nullif(excluded.model_name, ''), catalog.products.model_name),
      category = coalesce(nullif(excluded.category, ''), catalog.products.category, 'General Parts & Accessories'),
      uom = coalesce(nullif(excluded.uom, ''), catalog.products.uom, 'PC'),
      is_active = true,
      metadata = coalesce(catalog.products.metadata, '{}'::jsonb) || excluded.metadata,
      business_date = excluded.business_date,
      updated_at = now(),
      source_category = coalesce(excluded.source_category, catalog.products.source_category)
  where catalog.products.name is distinct from excluded.name
     or catalog.products.model_name is distinct from excluded.model_name
     or catalog.products.category is distinct from excluded.category
     or catalog.products.uom is distinct from excluded.uom
     or catalog.products.is_active is distinct from true
     or catalog.products.source_category is distinct from excluded.source_category;

  -- Parts removed from the upload remain available for audit and restoration.
  update catalog.products p
  set is_active = false,
      status = 'discontinued',
      updated_at = now()
  where p.is_active = true
    and not exists (
    select 1 from _retail_pricelist_items i where i.sku = p.sku
  );
  get diagnostics v_archived_products_count = row_count;

  select count(*)
  into v_stock_rows_created
  from _retail_pricelist_items i
  join catalog.products p on p.sku = i.sku
  where not exists (
    select 1 from catalog.inventory_balances b where b.product_id = p.id
  );

  create temporary table _retail_pricelist_changes on commit drop as
  select
    i.sku,
    coalesce(i.name, p.name, i.sku) as name,
    previous.amount as previous_price,
    i.price as new_price,
    case
      when previous.product_id is null then 'new_part'
      when previous.amount is null then 'new_price'
      when previous.amount = i.price then 'unchanged'
      else 'changed'
    end as status
  from _retail_pricelist_items i
  join catalog.products p on p.sku = i.sku
  left join _retail_pricelist_previous_prices previous on previous.sku = i.sku;

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date
  )
  select p.id, 0, 0, 0, 0, '{}'::jsonb, p_effective_from, p_effective_from
  from _retail_pricelist_items i
  join catalog.products p on p.sku = i.sku
  where not exists (
    select 1 from catalog.inventory_balances b where b.product_id = p.id
  )
  on conflict (product_id) do nothing;

  update catalog.product_prices
  set is_current = false,
      effective_to = p_effective_from - 1,
      updated_at = now()
  where price_type = 'retail'
    and is_current = true
    and exists (
      select 1
      from _retail_pricelist_changes changes
      join catalog.products p on p.sku = changes.sku
      where p.id = catalog.product_prices.product_id
        and changes.status <> 'unchanged'
    );

  insert into catalog.product_prices (
    product_id, price_type, amount, currency, effective_from,
    effective_to, is_current, business_date
  )
  select p.id, 'retail', changes.new_price, 'PHP', p_effective_from, null, true, p_effective_from
  from _retail_pricelist_changes changes
  join catalog.products p on p.sku = changes.sku
  where changes.status <> 'unchanged';

  select count(*) filter (where status <> 'unchanged'), count(*) filter (where status = 'unchanged')
  into v_changed_count, v_unchanged_count
  from _retail_pricelist_changes;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku', sku,
        'name', name,
        'previousPrice', previous_price,
        'newPrice', new_price,
        'difference', case when previous_price is null then null else round(new_price - previous_price, 2) end,
        'status', status
      ) order by sku
    ) filter (where row_number <= 500),
    '[]'::jsonb
  )
  into v_price_changes
  from (
    select changes.*, row_number() over (order by sku) as row_number
    from _retail_pricelist_changes changes
  ) preview;

  return jsonb_build_object(
    'updatedCount', v_unique_count,
    'changedCount', v_changed_count,
    'unchangedCount', v_unchanged_count,
    'skippedCount', 0,
    'skippedItems', '[]'::jsonb,
    'priceChanges', v_price_changes,
    'priceChangesPreviewLimit', 500,
    'priceChangesTotalCount', v_unique_count,
    'createdOrUpdatedProducts', v_unique_count,
    'newProductsCount', v_new_products_count,
    'archivedProductsCount', v_archived_products_count,
    'stockRowsCreated', v_stock_rows_created,
    'receivedCount', v_received_count,
    'uniqueCount', v_unique_count,
    'effectiveFrom', p_effective_from
  );
end;
$function$;

revoke all on function public.replace_retail_pricelist(jsonb, date) from public, anon, authenticated;
grant execute on function public.replace_retail_pricelist(jsonb, date) to service_role;
