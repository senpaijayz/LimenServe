-- Keep original pricelist workbooks in private Storage and make draft imports
-- independent from live product, stock, and selling-price records.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pricelist-files',
  'pricelist-files',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists catalog.pricelist_uploads (
  id uuid primary key default gen_random_uuid(),
  original_filename text not null,
  storage_bucket text not null default 'pricelist-files',
  storage_path text not null unique,
  file_extension text not null check (file_extension in ('xlsx', 'csv')),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  file_checksum text not null check (file_checksum ~ '^[0-9a-f]{64}$'),
  effective_date date,
  pricelist_year integer check (pricelist_year between 2000 and 2200),
  revision integer check (revision > 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  selected_worksheet text,
  pricing_category text,
  import_status text not null default 'uploaded'
    check (import_status in ('uploaded', 'analyzed', 'previewed', 'imported', 'published', 'failed')),
  imported_record_count integer not null default 0 check (imported_record_count >= 0),
  updated_record_count integer not null default 0 check (updated_record_count >= 0),
  new_product_count integer not null default 0 check (new_product_count >= 0),
  rejected_record_count integer not null default 0 check (rejected_record_count >= 0),
  pricelist_version_id uuid references catalog.pricelist_versions(id) on delete set null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pricelist_uploads_version_unique unique (pricelist_version_id)
);

create index if not exists pricelist_uploads_checksum_idx
  on catalog.pricelist_uploads (file_checksum, uploaded_at desc);
create index if not exists pricelist_uploads_version_idx
  on catalog.pricelist_uploads (pricelist_version_id);

alter table catalog.pricelist_uploads enable row level security;
revoke all on catalog.pricelist_uploads from public, anon, authenticated;
grant select, insert, update on catalog.pricelist_uploads to service_role;
drop policy if exists service_role_pricelist_uploads_all on catalog.pricelist_uploads;
create policy service_role_pricelist_uploads_all
  on catalog.pricelist_uploads for all to service_role
  using (true) with check (true);

create table if not exists catalog.pricelist_activation_events (
  id bigint generated always as identity primary key,
  previous_version_id uuid references catalog.pricelist_versions(id) on delete set null,
  activated_version_id uuid not null references catalog.pricelist_versions(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('activate', 'restore')),
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists pricelist_activation_events_created_idx
  on catalog.pricelist_activation_events (created_at desc);
alter table catalog.pricelist_activation_events enable row level security;
revoke all on catalog.pricelist_activation_events from public, anon, authenticated;
grant select, insert on catalog.pricelist_activation_events to service_role;
grant usage, select on sequence catalog.pricelist_activation_events_id_seq to service_role;
drop policy if exists service_role_pricelist_activation_events_all on catalog.pricelist_activation_events;
create policy service_role_pricelist_activation_events_all
  on catalog.pricelist_activation_events for all to service_role
  using (true) with check (true);

create or replace function public.create_pricelist_version_from_upload(
  p_upload_id uuid,
  p_items jsonb,
  p_version_year integer,
  p_effective_from date,
  p_source_sheet text,
  p_pricing_category text,
  p_file_checksum text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $function$
declare
  v_upload catalog.pricelist_uploads%rowtype;
  v_version_id uuid;
  v_revision integer;
  v_item_count integer;
  v_new_product_count integer;
  v_updated_record_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);

  select * into v_upload from catalog.pricelist_uploads
   where id = p_upload_id for update;
  if not found or v_upload.file_checksum <> p_file_checksum then
    raise exception using errcode = '22023', message = 'The saved workbook could not be verified. Upload it again.';
  end if;
  if v_upload.pricelist_version_id is not null or v_upload.import_status not in ('uploaded', 'analyzed', 'previewed') then
    raise exception using errcode = '22023', message = 'This workbook has already been imported or cannot be imported again.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'No validated pricelist rows were supplied.';
  end if;
  if p_version_year < 2000 or p_version_year > 2200 or p_effective_from is null
     or nullif(pg_catalog.btrim(p_source_sheet), '') is null then
    raise exception using errcode = '22023', message = 'Provide a valid year, effective date, and selected worksheet.';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_items) e
     where nullif(pg_catalog.btrim(e.value ->> 'sku'), '') is null
        or nullif(pg_catalog.btrim(e.value ->> 'price'), '') is null
        or (e.value ->> 'price')::numeric < 0
  ) then
    raise exception using errcode = '22023', message = 'The draft contains a missing or invalid part number or price.';
  end if;
  if exists (
    select pg_catalog.upper(pg_catalog.btrim(e.value ->> 'sku'))
      from pg_catalog.jsonb_array_elements(p_items) e
     group by 1 having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Duplicate part numbers must be resolved before importing.';
  end if;

  select coalesce(max(revision), 0) + 1 into v_revision
    from catalog.pricelist_versions
   where price_type = 'retail' and version_year = p_version_year and effective_from = p_effective_from;

  insert into catalog.pricelist_versions (
    price_type, version_year, effective_from, revision, status, is_active,
    source_filename, source_checksum, row_count, created_by, updated_at
  ) values (
    'retail', p_version_year, p_effective_from, v_revision, 'draft', false,
    v_upload.original_filename, v_upload.file_checksum, jsonb_array_length(p_items), p_actor_id,
    pg_catalog.timezone('utc', now())
  ) returning id into v_version_id;

  select count(*)::integer into v_new_product_count
    from pg_catalog.jsonb_array_elements(p_items) e
    left join catalog.products p on p.sku = pg_catalog.upper(pg_catalog.btrim(e.value ->> 'sku'))
   where p.id is null;
  v_updated_record_count := jsonb_array_length(p_items) - v_new_product_count;

  insert into catalog.pricelist_version_items (
    pricelist_version_id, product_id, source_sheet, source_line_number,
    sku, name, model_name, uom, pcc, price, status, category, source_category,
    classification_version, classification_confidence, classification_strategy,
    classification_rule_key, classification_tokens, updated_at
  )
  select v_version_id, p.id,
    coalesce(nullif(pg_catalog.btrim(e.value ->> 'sourceSheet'), ''), p_source_sheet),
    greatest(1, coalesce(nullif(e.value ->> 'sourceLineNumber', '')::integer, e.ordinality::integer)),
    pg_catalog.upper(pg_catalog.btrim(e.value ->> 'sku')),
    coalesce(nullif(pg_catalog.btrim(e.value ->> 'name'), ''), pg_catalog.upper(pg_catalog.btrim(e.value ->> 'sku'))),
    nullif(pg_catalog.btrim(e.value ->> 'model'), ''),
    coalesce(nullif(pg_catalog.btrim(e.value ->> 'uom'), ''), 'PC'),
    nullif(pg_catalog.btrim(e.value ->> 'pcc'), ''),
    round((e.value ->> 'price')::numeric, 2),
    nullif(pg_catalog.btrim(e.value ->> 'status'), ''),
    nullif(pg_catalog.btrim(e.value ->> 'category'), ''),
    nullif(pg_catalog.btrim(e.value ->> 'sourceCategory'), ''),
    nullif(pg_catalog.btrim(e.value ->> 'classificationVersion'), ''),
    nullif(pg_catalog.btrim(e.value ->> 'classificationConfidence'), ''),
    nullif(pg_catalog.btrim(e.value ->> 'classificationStrategy'), ''),
    nullif(pg_catalog.btrim(e.value ->> 'classificationRuleKey'), ''),
    case when jsonb_typeof(e.value -> 'classificationTokens') = 'array'
      then e.value -> 'classificationTokens' else '[]'::jsonb end,
    pg_catalog.timezone('utc', now())
  from pg_catalog.jsonb_array_elements(p_items) with ordinality e(value, ordinality)
  left join catalog.products p on p.sku = pg_catalog.upper(pg_catalog.btrim(e.value ->> 'sku'));

  get diagnostics v_item_count = row_count;
  if v_item_count <> jsonb_array_length(p_items) then
    raise exception using errcode = '23514', message = 'The draft item count did not match the validated upload.';
  end if;

  update catalog.pricelist_uploads set
    effective_date = p_effective_from,
    pricelist_year = p_version_year,
    revision = v_revision,
    uploaded_by = coalesce(uploaded_by, p_actor_id),
    selected_worksheet = p_source_sheet,
    pricing_category = p_pricing_category,
    import_status = 'imported',
    imported_record_count = v_item_count,
    new_product_count = v_new_product_count,
    updated_record_count = v_updated_record_count,
    pricelist_version_id = v_version_id,
    updated_at = pg_catalog.timezone('utc', now())
  where id = p_upload_id;

  return pg_catalog.jsonb_build_object(
    'versionId', v_version_id, 'revision', v_revision,
    'versionYear', p_version_year, 'effectiveFrom', p_effective_from,
    'status', 'draft', 'isActive', false, 'itemCount', v_item_count,
    'uniqueCount', v_item_count, 'newProductsCount', v_new_product_count
  );
end;
$function$;

create or replace function public.activate_pricelist_version_audited(
  p_version_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $function$
declare
  v_version catalog.pricelist_versions%rowtype;
  v_previous_version_id uuid;
  v_count integer;
  v_action text;
  v_result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);
  select * into v_version from catalog.pricelist_versions
   where id = p_version_id and price_type = 'retail' for update;
  if not found then
    raise exception using errcode = '22023', message = 'Price list version was not found.';
  end if;

  select count(*)::integer into v_count from catalog.pricelist_version_items
   where pricelist_version_id = p_version_id;
  if v_count < 1 or v_count <> v_version.row_count then
    raise exception using errcode = '23514', message = 'This revision is incomplete and cannot be activated.';
  end if;

  if exists (select 1 from catalog.pricelist_uploads u
      where u.pricelist_version_id = p_version_id
        and (u.import_status not in ('imported', 'published')
          or u.file_checksum <> v_version.source_checksum
          or u.storage_bucket <> 'pricelist-files')) then
    raise exception using errcode = '23514', message = 'The original workbook for this revision could not be verified.';
  end if;

  insert into catalog.products (
    sku, name, model_name, category, brand, uom, status, is_active,
    source_category, metadata, business_date, updated_at
  )
  select item.sku, item.name, item.model_name,
    coalesce(item.category, 'General Parts & Accessories'), 'Mitsubishi',
    coalesce(item.uom, 'PC'), 'out_of_stock', true, item.source_category,
    jsonb_build_object('priceListVersionYear', v_version.version_year),
    v_version.effective_from, pg_catalog.timezone('utc', now())
  from catalog.pricelist_version_items item
  where item.pricelist_version_id = p_version_id and item.product_id is null
  on conflict (sku) do nothing;

  update catalog.pricelist_version_items item
     set product_id = product.id, updated_at = pg_catalog.timezone('utc', now())
    from catalog.products product
   where item.pricelist_version_id = p_version_id
     and item.product_id is null and product.sku = item.sku;

  if exists (select 1 from catalog.pricelist_version_items
      where pricelist_version_id = p_version_id and product_id is null) then
    raise exception using errcode = '23514', message = 'One or more parts could not be linked to the catalog. No prices were activated.';
  end if;

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date, business_date
  )
  select product.id, 0, 0, 0, 0, '{}'::jsonb, v_version.effective_from, v_version.effective_from
    from catalog.pricelist_version_items item
    join catalog.products product on product.id = item.product_id
   where item.pricelist_version_id = p_version_id
     and not exists (select 1 from catalog.inventory_balances b where b.product_id = product.id)
  on conflict (product_id) do nothing;

  select id into v_previous_version_id from catalog.pricelist_versions
   where price_type = 'retail' and is_active and id <> p_version_id
   order by activated_at desc nulls last, updated_at desc limit 1;
  v_action := case when v_version.status = 'published' or v_version.activated_at is not null then 'restore' else 'activate' end;

  v_result := public.activate_retail_pricelist_version(p_version_id, p_actor_id);

  insert into catalog.pricelist_activation_events(previous_version_id, activated_version_id, actor_id, action)
  values (v_previous_version_id, p_version_id, p_actor_id, v_action);

  update catalog.pricelist_uploads set import_status = 'published', updated_at = pg_catalog.timezone('utc', now())
   where pricelist_version_id = p_version_id;

  return v_result || pg_catalog.jsonb_build_object(
    'previousVersionId', v_previous_version_id, 'action', v_action
  );
end;
$function$;

revoke all on function public.create_pricelist_version_from_upload(uuid,jsonb,integer,date,text,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.activate_pricelist_version_audited(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.create_pricelist_version_from_upload(uuid,jsonb,integer,date,text,text,text,uuid)
  to service_role;
grant execute on function public.activate_pricelist_version_audited(uuid,uuid)
  to service_role;

notify pgrst, 'reload schema';
