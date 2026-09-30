-- Keep every uploaded replacement, even when its year/effective date repeats.
alter table catalog.pricelist_versions add column revision integer not null default 1 check (revision > 0);
alter table catalog.pricelist_versions drop constraint pricelist_versions_price_type_version_year_effective_from_key;
alter table catalog.pricelist_versions add constraint pricelist_versions_date_revision_key
  unique (price_type, version_year, effective_from, revision);

-- Preserve the installed import's stock, classification, locking and grants.
do $migration$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)'::regprocedure);
  revised := replace(original,
    'price_type, version_year, effective_from, status, is_active,',
    'price_type, version_year, effective_from, revision, status, is_active,');
  revised := replace(revised, '''retail'', p_version_year, p_effective_from,',
    '''retail'', p_version_year, p_effective_from,
    (select coalesce(max(revision), 0) + 1 from catalog.pricelist_versions
      where price_type = ''retail'' and version_year = p_version_year and effective_from = p_effective_from),');
  revised := regexp_replace(revised,
    '  on conflict \(price_type, version_year, effective_from\) do update set.*?  returning id into v_version_id;',
    '  returning id into v_version_id;', 's');
  if revised = original or position('on conflict (price_type, version_year, effective_from)' in revised) > 0
    or position('max(revision)' in revised) = 0 then
    raise exception 'Unexpected pricelist import definition; migration stopped safely';
  end if;
  execute revised;
end $migration$;

-- Small, indexed per-product reads; only the authenticated backend can call it.
create or replace function public.limen_product_price_history(p_product_id uuid)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, catalog
as $function$
with product as (
  select id, sku, name, created_at from catalog.products where id = p_product_id
), versions as (
  select v.*, i.price,
    (select prior.price from catalog.pricelist_version_items prior
      join catalog.pricelist_versions pv on pv.id = prior.pricelist_version_id
      where prior.sku = p.sku and pv.price_type = 'retail'
        and (pv.version_year, pv.effective_from, pv.revision) < (v.version_year, v.effective_from, v.revision)
      order by pv.version_year desc, pv.effective_from desc, pv.revision desc limit 1) previous_price
  from product p cross join catalog.pricelist_versions v
  left join catalog.pricelist_version_items i on i.pricelist_version_id = v.id and i.sku = p.sku
  where v.price_type = 'retail' and (i.id is not null or v.is_active or exists (
    select 1 from catalog.pricelist_version_items first_item
    join catalog.pricelist_versions fv on fv.id = first_item.pricelist_version_id
    where first_item.sku = p.sku and (fv.version_year, fv.effective_from, fv.revision)
      < (v.version_year, v.effective_from, v.revision)))
), current_price as (
  select * from catalog.product_prices where product_id = p_product_id and price_type = 'retail' and is_current
  order by created_at desc, id desc limit 1
), selling as (
  select *, lag(amount) over (order by created_at, id) previous_price
  from catalog.product_prices where product_id = p_product_id and price_type = 'retail'
)
select jsonb_build_object(
  'productId', p.id, 'sku', p.sku, 'name', p.name, 'addedAt', p.created_at,
  'currentPrice', (select amount from current_price),
  'currentPriceChangedAt', (select created_at from current_price),
  'activeList', (select jsonb_build_object('year',version_year,'revision',revision,'effectiveFrom',effective_from,
    'listed',price is not null,'price',price,'activatedAt',activated_at) from versions where is_active limit 1),
  'firstListedYear', (select min(version_year) from versions where price is not null),
  'totalVersions', (select count(*) from versions),
  'versions', coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'year',version_year,'revision',revision,'effectiveFrom',effective_from,
    'uploadedAt',created_at,'activatedAt',activated_at,'sourceFilename',source_filename,
    'isActive',is_active,'status',status,'listed',price is not null,'price',price,
    'previousPrice',previous_price,'difference',price - previous_price,
    'change',case when price is null then 'not_listed' when previous_price is null then 'new_part'
      when price > previous_price then 'increase' when price < previous_price then 'decrease' else 'unchanged' end
    ) order by version_year desc,effective_from desc,revision desc)
    from (select * from versions order by version_year desc,effective_from desc,revision desc limit 200) bounded), '[]'::jsonb),
  'sellingPrices', coalesce((select jsonb_agg(jsonb_build_object('id',id,'price',amount,'previousPrice',previous_price,
    'changedAt',created_at,'effectiveFrom',effective_from,'isCurrent',is_current,'difference',amount-previous_price)
    order by created_at desc,id desc) from (select * from selling order by created_at desc,id desc limit 100) bounded), '[]'::jsonb)
) from product p;
$function$;
revoke all on function public.limen_product_price_history(uuid) from public, anon, authenticated;
grant execute on function public.limen_product_price_history(uuid) to service_role;

-- POS preflight reads only current retail prices, not the entire history.
create or replace function public.limen_current_retail_prices(p_product_ids uuid[])
returns jsonb language sql stable security invoker
set search_path = pg_catalog, catalog
as $function$
select coalesce(jsonb_agg(jsonb_build_object('productId',p.id,'sku',p.sku,'name',p.name,
  'price',cp.amount,'available',p.is_active and cp.id is not null)), '[]'::jsonb)
from catalog.products p
left join catalog.product_prices cp on cp.product_id=p.id and cp.price_type='retail' and cp.is_current
where p.id = any(p_product_ids);
$function$;
revoke all on function public.limen_current_retail_prices(uuid[]) from public, anon, authenticated;
grant execute on function public.limen_current_retail_prices(uuid[]) to service_role;


-- Check prices in the sale transaction, serializing with pricelist activation.
-- Existing stock checks, receipts and service-line behavior stay in the internal RPC.
create or replace function public.create_pos_sale(payload jsonb, p_operator_id uuid default null)
returns uuid language plpgsql security definer
set search_path = pg_catalog, operations, catalog
as $function$
begin
  perform pg_advisory_xact_lock(73841590214631::bigint);
  if exists (
    select 1 from jsonb_array_elements(payload->'items') line
    left join catalog.products p on p.id=(line->>'productId')::uuid
    left join catalog.product_prices cp on cp.product_id=p.id and cp.price_type='retail' and cp.is_current
    where coalesce(line->>'lineType','product')='product'
      and (p.id is null or not p.is_active or cp.id is null
        or round((line->>'unitPrice')::numeric,2) is distinct from cp.amount)
  ) then
    raise exception using errcode='PT409', message='Selling prices changed or a product has no current selling price. Review current prices before confirming the sale.';
  end if;
  return operations.create_pos_sale_internal(payload, p_operator_id);
end;
$function$;
revoke all on function public.create_pos_sale(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_pos_sale(jsonb,uuid) to service_role;
