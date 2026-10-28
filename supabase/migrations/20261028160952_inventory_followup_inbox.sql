-- Read-only stock follow-ups. No business rows, thresholds, locations or balances are changed.
create function public.limen_inventory_followups(p_filter text,p_search text,p_page integer,p_summary boolean)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with clock as (select (now() at time zone 'Asia/Manila')::date as today),
current_layout as materialized (
  select id,name from stockroom.layouts where status='published' order by version_number desc,id limit 1
), located as materialized (
  select distinct loc.item_id from stockroom.item_locations loc
  join current_layout c on c.id=loc.layout_id
  join stockroom.floors f on f.id=loc.floor_id and f.layout_id=c.id
  join stockroom.shelves s on s.id=loc.shelf_id and s.layout_id=c.id and s.floor_id=f.id
  join stockroom.shelf_levels lev on lev.id=loc.shelf_level_id and lev.shelf_id=s.id
  join stockroom.shelf_slots slot on slot.id=loc.shelf_slot_id and slot.shelf_level_id=lev.id
  where loc.is_active
), parts as materialized (
  select p.id,p.sku,p.name,b.on_hand,greatest(b.on_hand-b.reserved,0) as available,b.reorder_point,b.reorder_priority,
    l.supplier_id,s.name as supplier_name,l.lead_time_days,v.item_id as located_id
  from catalog.products p join catalog.inventory_balances b on b.product_id=p.id
  left join catalog.product_supplier_links l on l.product_id=p.id left join catalog.suppliers s on s.id=l.supplier_id
  left join located v on v.item_id=p.id
  where p.is_active
), outstanding as materialized (
  select o.id,o.code,o.supplier_name,o.expected_date,sum(i.quantity-i.received_quantity) as remaining
  from catalog.supplier_orders o join catalog.supplier_order_items i on i.order_id=o.id
  where o.stage='ordered' and i.quantity>i.received_quantity
  group by o.id
), issues as materialized (
  select k.kind||':'||p.id::text as id,k.kind,p.id as product_id,null::uuid as order_id,p.sku,p.name,p.on_hand,p.available,p.reorder_point,p.reorder_priority,
    p.supplier_name,null::date as expected_date,null::numeric as remaining,p.reorder_point<=0 as missing_threshold,p.supplier_id is null as missing_supplier,
    p.supplier_id is not null and p.lead_time_days is null as missing_lead_time,k.rank
  from parts p cross join lateral (values
    ('reorder',3,p.reorder_point>0 and p.available<=p.reorder_point),
    ('location',2,p.on_hand>0 and p.located_id is null),
    ('planning',5,p.on_hand>0 and (p.reorder_point<=0 or p.supplier_id is null or p.lead_time_days is null))
  ) k(kind,rank,needed) where k.needed
  union all
  select (case when o.expected_date is null then 'undated' else 'overdue' end)||':'||o.id::text,
    case when o.expected_date is null then 'undated' else 'overdue' end,null::uuid,o.id,o.code,'Supplier delivery',null::numeric,null::numeric,null::numeric,null::text,
    o.supplier_name,o.expected_date,o.remaining,false,false,false,case when o.expected_date is null then 4 else 1 end
  from outstanding o cross join clock c where o.expected_date<c.today or o.expected_date is null
), filtered as materialized (
  select * from issues where
    (p_filter='all' or (p_filter='work' and kind in ('reorder','location','overdue')) or kind=p_filter)
    and (coalesce(p_search,'')='' or strpos(lower(coalesce(sku,'')||' '||coalesce(name,'')||' '||coalesce(supplier_name,'')),lower(left(p_search,120)))>0)
), page_rows as (
  select * from filtered order by rank,expected_date nulls last,
    case reorder_priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end desc,sku,id
  limit (case when p_summary then 0 else 24 end) offset (greatest(coalesce(p_page,1),1)-1)*24
)
select jsonb_build_object(
  'items',coalesce((select jsonb_agg(to_jsonb(r) order by rank,expected_date nulls last,
    case reorder_priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end desc,sku,id) from page_rows r),'[]'),
  'total',(select count(*) from filtered),
  'counts',(select jsonb_build_object('work',count(*) filter(where kind in ('reorder','location','overdue')),
    'reorder',count(*) filter(where kind='reorder'),'location',count(*) filter(where kind='location'),
    'overdue',count(*) filter(where kind='overdue'),'undated',count(*) filter(where kind='undated'),'planning',count(*) filter(where kind='planning'),'all',count(*)) from issues),
  'layout',(select jsonb_build_object('id',id,'name',name) from current_layout),
  'checkedAt',now(),'today',(select today from clock));
$body$;
revoke all on function public.limen_inventory_followups(text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.limen_inventory_followups(text,text,integer,boolean) to service_role;
