alter table catalog.product_supplier_links add column lead_time_days integer
  check (lead_time_days between 0 and 3650);

create table catalog.inventory_supply_plan_changes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references catalog.products(id) on delete set null,
  original_product_id uuid not null,
  part_number text not null,
  actor_id uuid references auth.users(id) on delete set null,
  previous_plan jsonb not null,
  saved_plan jsonb not null,
  created_at timestamptz not null default now()
);
create index inventory_supply_changes_product_idx on catalog.inventory_supply_plan_changes(product_id,created_at desc);
create index inventory_supply_changes_actor_idx on catalog.inventory_supply_plan_changes(actor_id) where actor_id is not null;
alter table catalog.inventory_supply_plan_changes enable row level security;
revoke all on catalog.inventory_supply_plan_changes from public,anon,authenticated,service_role;
grant select,insert on catalog.inventory_supply_plan_changes to service_role;
create policy backend_read on catalog.inventory_supply_plan_changes for select to service_role using(true);
create policy backend_insert on catalog.inventory_supply_plan_changes for insert to service_role with check(true);

-- Reuse the existing one-supplier-per-product relation. No duplicate supplier model.
create function catalog.apply_supply_plan(p_product uuid,p_supplier uuid,p_days integer,p_actor uuid,p_keep_existing_days boolean default false)
returns boolean language plpgsql security invoker set search_path=''
as $body$
declare previous catalog.product_supplier_links%rowtype; part_sku text; days_value integer:=p_days; previous_name text; next_name text;
begin
  perform operations.assert_assignment_admin(p_actor);
  select sku into part_sku from catalog.products where id=p_product for update;
  if not found then raise exception using errcode='22023',message='This product is no longer available.'; end if;
  select * into previous from catalog.product_supplier_links where product_id=p_product for update;
  if p_keep_existing_days and previous.supplier_id is not distinct from p_supplier then days_value:=previous.lead_time_days; end if;
  if p_supplier is null and days_value is not null then raise exception using errcode='22023',message='Choose a supplier before entering delivery days.'; end if;
  if days_value is not null and days_value not between 0 and 3650 then raise exception using errcode='22023',message='Delivery days must be a whole number from 0 to 3,650, or left unknown.'; end if;
  if p_supplier is not null then
    select name into next_name from catalog.suppliers where id=p_supplier for key share;
    if not found then raise exception using errcode='22023',message='That supplier is no longer available. Reload the supplier list.'; end if;
  end if;
  if previous.supplier_id is not distinct from p_supplier and previous.lead_time_days is not distinct from days_value then return false; end if;
  select name into previous_name from catalog.suppliers where id=previous.supplier_id;
  if p_supplier is null then
    delete from catalog.product_supplier_links where product_id=p_product;
  else
    insert into catalog.product_supplier_links(product_id,supplier_id,lead_time_days)
      values(p_product,p_supplier,days_value)
      on conflict(product_id) do update set supplier_id=excluded.supplier_id,lead_time_days=excluded.lead_time_days;
  end if;
  insert into catalog.inventory_supply_plan_changes(product_id,original_product_id,part_number,actor_id,previous_plan,saved_plan)
    values(p_product,p_product,coalesce(part_sku,''),p_actor,
      jsonb_build_object('supplierId',previous.supplier_id,'supplierName',previous_name,'leadTimeDays',previous.lead_time_days),
      jsonb_build_object('supplierId',p_supplier,'supplierName',next_name,'leadTimeDays',days_value));
  return true;
end;
$body$;
revoke all on function catalog.apply_supply_plan(uuid,uuid,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function catalog.apply_supply_plan(uuid,uuid,integer,uuid,boolean) to service_role;

-- Existing product edits keep the delivery estimate when the supplier is unchanged.
create function public.limen_link_product_supplier(p_product uuid,p_supplier uuid,p_actor uuid)
returns boolean language sql security invoker set search_path=''
as $body$ select catalog.apply_supply_plan(p_product,p_supplier,null,p_actor,true); $body$;
revoke all on function public.limen_link_product_supplier(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.limen_link_product_supplier(uuid,uuid,uuid) to service_role;

create function public.limen_save_replenishment_plan(p_items jsonb,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $body$
declare item jsonb; previous catalog.product_supplier_links%rowtype; supplier_value uuid; days_value numeric; supply_changed integer:=0; reorder_result jsonb;
begin
  perform operations.assert_assignment_admin(p_actor);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='22023',message='Choose between 1 and 100 parts.';
  end if;
  -- Lock products before balances/links, in the same order for every batch.
  for item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    perform 1 from catalog.products where id=(item->>'productId')::uuid and is_active for update;
    if not found then raise exception using errcode='22023',message='A selected product is inactive or no longer available.'; end if;
  end loop;
  reorder_result:=public.limen_save_reorder_settings(p_items,p_actor);
  for item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    if not (item ?& array['supplierId','leadTimeDays','expectedSupplierId','expectedLeadTimeDays']) then
      raise exception using errcode='22023',message='Reload the planning list before saving.';
    end if;
    supplier_value:=(item->>'supplierId')::uuid;
    days_value:=(item->>'leadTimeDays')::numeric;
    if days_value is not null and (days_value<0 or days_value>3650 or days_value<>trunc(days_value)) then
      raise exception using errcode='22023',message='Use whole delivery days from 0 to 3,650, or leave unknown.';
    end if;
    if supplier_value is null and days_value is not null then raise exception using errcode='22023',message='Choose a supplier before entering delivery days.'; end if;
    select * into previous from catalog.product_supplier_links where product_id=(item->>'productId')::uuid for update;
    if previous.supplier_id is not distinct from supplier_value and previous.lead_time_days is not distinct from days_value then continue; end if;
    if previous.supplier_id is distinct from (item->>'expectedSupplierId')::uuid or previous.lead_time_days is distinct from (item->>'expectedLeadTimeDays')::numeric then
      raise exception using errcode='40001',message='A supplier or delivery estimate changed. Reload before saving. No settings in this batch were saved.';
    end if;
    if catalog.apply_supply_plan((item->>'productId')::uuid,supplier_value,days_value::integer,p_actor,false) then supply_changed:=supply_changed+1; end if;
  end loop;
  return reorder_result || jsonb_build_object('supplyChanged',supply_changed);
end;
$body$;
revoke all on function public.limen_save_replenishment_plan(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.limen_save_replenishment_plan(jsonb,uuid) to service_role;

create or replace function public.limen_replenishment_page(p_filter text,p_search text,p_page integer,p_size integer)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with filtered as materialized (
  select p.id,p.sku,p.name,b.on_hand,b.reserved,b.reorder_point,b.reorder_quantity,
    l.supplier_id,s.name as supplier_name,l.lead_time_days,
    greatest(b.on_hand-b.reserved,0) as available,
    case when b.reorder_point>0 and greatest(b.on_hand-b.reserved,0)<=b.reorder_point then b.reorder_quantity else 0 end as suggested_quantity
  from catalog.products p join catalog.inventory_balances b on b.product_id=p.id
    left join catalog.product_supplier_links l on l.product_id=p.id
    left join catalog.suppliers s on s.id=l.supplier_id
  where p.is_active and (coalesce(p_search,'')='' or strpos(lower(coalesce(p.sku,'')||' '||coalesce(p.name,'')),lower(left(p_search,120)))>0)
    and case p_filter
      when 'low' then b.reorder_point>0 and greatest(b.on_hand-b.reserved,0)<=b.reorder_point
      when 'out' then greatest(b.on_hand-b.reserved,0)<=0
      when 'missing' then coalesce(b.reorder_point,0)<=0
      when 'nosupplier' then l.supplier_id is null
      when 'all' then true else false end
), page_rows as (
  select * from filtered order by sku,id limit greatest(1,least(coalesce(p_size,24),50))
    offset (greatest(coalesce(p_page,1),1)-1)*greatest(1,least(coalesce(p_size,24),50))
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by sku,id) from page_rows r),'[]'::jsonb),'total',(select count(*) from filtered));
$body$;
revoke all on function public.limen_replenishment_page(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.limen_replenishment_page(text,text,integer,integer) to service_role;

create function public.limen_replenishment_history(p_product uuid,p_page integer)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with events as (
  select 'reorder-'||id::text as id,'Reorder settings' as kind,created_at,
    jsonb_build_object('reorderPoint',previous_point,'reorderQuantity',previous_quantity) as previous,
    jsonb_build_object('reorderPoint',reorder_point,'reorderQuantity',reorder_quantity) as saved
    from catalog.inventory_reorder_changes where product_id=p_product
  union all
  select 'supply-'||id::text,'Supplier plan',created_at,previous_plan,saved_plan
    from catalog.inventory_supply_plan_changes where product_id=p_product
), page_rows as (
  select * from events order by created_at desc,id limit 10 offset (greatest(coalesce(p_page,1),1)-1)*10
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from page_rows r),'[]'::jsonb),'total',(select count(*) from events));
$body$;
revoke all on function public.limen_replenishment_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.limen_replenishment_history(uuid,integer) to service_role;
