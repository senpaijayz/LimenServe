create table catalog.inventory_reorder_changes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references catalog.products(id) on delete set null,
  original_product_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  previous_point numeric not null, previous_quantity numeric not null,
  reorder_point numeric not null, reorder_quantity numeric not null,
  created_at timestamptz not null default now()
);
create index inventory_reorder_changes_product_idx on catalog.inventory_reorder_changes(product_id,created_at desc);
create index inventory_reorder_changes_actor_idx on catalog.inventory_reorder_changes(actor_id) where actor_id is not null;
alter table catalog.inventory_reorder_changes enable row level security;
revoke all on catalog.inventory_reorder_changes from public,anon,authenticated,service_role;
grant select,insert on catalog.inventory_reorder_changes to service_role;
create policy backend_read on catalog.inventory_reorder_changes for select to service_role using(true);
create policy backend_insert on catalog.inventory_reorder_changes for insert to service_role with check(true);

create function public.limen_replenishment_page(p_filter text,p_search text,p_page integer,p_size integer)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with filtered as materialized (
  select p.id,p.sku,p.name,b.on_hand,b.reserved,b.reorder_point,b.reorder_quantity,
    greatest(b.on_hand-b.reserved,0) as available,
    case when b.reorder_point>0 and greatest(b.on_hand-b.reserved,0)<=b.reorder_point then b.reorder_quantity else 0 end as suggested_quantity
  from catalog.products p join catalog.inventory_balances b on b.product_id=p.id
  where p.is_active and (coalesce(p_search,'')='' or strpos(lower(coalesce(p.sku,'')||' '||coalesce(p.name,'')),lower(left(p_search,120)))>0)
    and case p_filter
      when 'low' then b.reorder_point>0 and greatest(b.on_hand-b.reserved,0)<=b.reorder_point
      when 'out' then greatest(b.on_hand-b.reserved,0)<=0
      when 'missing' then coalesce(b.reorder_point,0)<=0
      when 'all' then true else false end
), page_rows as (
  select * from filtered order by sku,id limit greatest(1,least(coalesce(p_size,24),50))
    offset (greatest(coalesce(p_page,1),1)-1)*greatest(1,least(coalesce(p_size,24),50))
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by sku,id) from page_rows r),'[]'::jsonb),'total',(select count(*) from filtered));
$body$;
revoke all on function public.limen_replenishment_page(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.limen_replenishment_page(text,text,integer,integer) to service_role;

create function public.limen_save_reorder_settings(p_items jsonb,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $body$
declare item jsonb; balance catalog.inventory_balances%rowtype; point_value numeric; quantity_value numeric; changed integer:=0;
begin
  perform operations.assert_assignment_admin(p_actor);
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='22023',message='Choose between 1 and 100 inventory settings to save.';
  end if;
  if (select count(distinct value->>'productId') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then
    raise exception using errcode='22023',message='Each product may appear only once.';
  end if;
  for item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    point_value:=(item->>'reorderPoint')::numeric;
    quantity_value:=(item->>'reorderQuantity')::numeric;
    if point_value is null or quantity_value is null or point_value<0 or point_value>1000000 or quantity_value<0 or quantity_value>1000000
      or point_value<>trunc(point_value) or quantity_value<>trunc(quantity_value) then
      raise exception using errcode='22023',message='Use whole numbers from 0 to 1,000,000.';
    end if;
    perform 1 from catalog.products where id=(item->>'productId')::uuid and is_active;
    if not found then raise exception using errcode='22023',message='A selected product is inactive or no longer available.'; end if;
    select * into balance from catalog.inventory_balances where product_id=(item->>'productId')::uuid for update;
    if not found then raise exception using errcode='22023',message='Inventory settings are missing. Open the product in Inventory first.'; end if;
    if balance.reorder_point=point_value and balance.reorder_quantity=quantity_value then continue; end if;
    if balance.reorder_point is distinct from (item->>'expectedPoint')::numeric or balance.reorder_quantity is distinct from (item->>'expectedQuantity')::numeric then
      raise exception using errcode='40001',message='A reorder setting changed. Reload the list before saving. No settings in this batch were saved.';
    end if;
    insert into catalog.inventory_reorder_changes(product_id,original_product_id,actor_id,previous_point,previous_quantity,reorder_point,reorder_quantity)
      values(balance.product_id,balance.product_id,p_actor,coalesce(balance.reorder_point,0),coalesce(balance.reorder_quantity,0),point_value,quantity_value);
    update catalog.inventory_balances set reorder_point=point_value,reorder_quantity=quantity_value,updated_at=now() where product_id=balance.product_id;
    changed:=changed+1;
  end loop;
  return jsonb_build_object('saved',true,'changed',changed);
end;
$body$;
revoke all on function public.limen_save_reorder_settings(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.limen_save_reorder_settings(jsonb,uuid) to service_role;
