alter table catalog.inventory_balances add column reorder_priority text check(reorder_priority in ('low','normal','high','urgent'));
alter table catalog.inventory_reorder_changes add column previous_priority text, add column reorder_priority text;

create or replace function public.limen_save_reorder_settings(p_items jsonb,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $body$
declare item jsonb; balance catalog.inventory_balances%rowtype; point_value numeric; quantity_value numeric; priority_value text; has_priority boolean; changed integer:=0;
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
    has_priority:=item ? 'reorderPriority';
    if has_priority and (not (item ? 'expectedPriority') or (item->>'reorderPriority' is not null and item->>'reorderPriority' not in ('low','normal','high','urgent')) or (item->>'expectedPriority' is not null and item->>'expectedPriority' not in ('low','normal','high','urgent'))) then
      raise exception using errcode='22023',message='Choose a valid priority and reload the current settings before saving.';
    end if;
    if point_value is null or quantity_value is null or point_value<0 or point_value>1000000 or quantity_value<0 or quantity_value>1000000
      or point_value<>trunc(point_value) or quantity_value<>trunc(quantity_value) then
      raise exception using errcode='22023',message='Use whole numbers from 0 to 1,000,000.';
    end if;
    perform 1 from catalog.products where id=(item->>'productId')::uuid and is_active;
    if not found then raise exception using errcode='22023',message='A selected product is inactive or no longer available.'; end if;
    select * into balance from catalog.inventory_balances where product_id=(item->>'productId')::uuid for update;
    if not found then raise exception using errcode='22023',message='Inventory settings are missing. Open the product in Inventory first.'; end if;
    priority_value:=case when has_priority then item->>'reorderPriority' else balance.reorder_priority end;
    if balance.reorder_point=point_value and balance.reorder_quantity=quantity_value and balance.reorder_priority is not distinct from priority_value then continue; end if;
    if balance.reorder_point is distinct from (item->>'expectedPoint')::numeric or balance.reorder_quantity is distinct from (item->>'expectedQuantity')::numeric
      or (has_priority and balance.reorder_priority is distinct from item->>'expectedPriority') then
      raise exception using errcode='40001',message='A reorder setting or priority changed. Reload before saving. No settings in this batch were saved.';
    end if;
    insert into catalog.inventory_reorder_changes(product_id,original_product_id,actor_id,previous_point,previous_quantity,reorder_point,reorder_quantity,previous_priority,reorder_priority)
      values(balance.product_id,balance.product_id,p_actor,balance.reorder_point,balance.reorder_quantity,point_value,quantity_value,balance.reorder_priority,priority_value);
    update catalog.inventory_balances set reorder_point=point_value,reorder_quantity=quantity_value,reorder_priority=priority_value,updated_at=now() where product_id=balance.product_id;
    changed:=changed+1;
  end loop;
  return jsonb_build_object('saved',true,'changed',changed);
end;
$body$;
revoke all on function public.limen_save_reorder_settings(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.limen_save_reorder_settings(jsonb,uuid) to service_role;

create function public.limen_replenishment_review(p_filter text,p_search text,p_page integer,p_sort text)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with clock as (select (now() at time zone 'Asia/Manila')::date as today),
filtered as materialized (
 select p.id,p.sku,p.name,b.on_hand,b.reserved,b.reorder_point,b.reorder_quantity,b.reorder_priority,
   l.supplier_id,s.name as supplier_name,l.lead_time_days,greatest(b.on_hand-b.reserved,0) as available,
   case b.reorder_priority when 'urgent' then 4 when 'high' then 3 when 'normal' then 2 when 'low' then 1 else 0 end as priority_rank
 from catalog.products p join catalog.inventory_balances b on b.product_id=p.id
 left join catalog.product_supplier_links l on l.product_id=p.id left join catalog.suppliers s on s.id=l.supplier_id
 where p.is_active and (coalesce(p_search,'')='' or strpos(lower(coalesce(p.sku,'')||' '||coalesce(p.name,'')),lower(left(p_search,120)))>0)
 and case p_filter when 'low' then b.reorder_point>0 and greatest(b.on_hand-b.reserved,0)<=b.reorder_point
   when 'out' then greatest(b.on_hand-b.reserved,0)<=0 when 'missing' then b.reorder_point<=0 when 'nosupplier' then l.supplier_id is null
   when 'priority' then b.reorder_priority in ('high','urgent') when 'nopriority' then b.reorder_priority is null when 'all' then true else false end
), page_rows as materialized (
 select * from filtered order by case when p_sort='priority' then priority_rank end desc nulls last,
   case when p_sort='available' then available end asc nulls last,sku,id limit 24 offset (greatest(coalesce(p_page,1),1)-1)*24
), sales as (
 -- Same completion/demo exclusions as private.recorded_product_sales, without exposing revenue or customer fields.
 select si.product_id,coalesce(sum(si.quantity),0) as recorded_units,
   coalesce(sum(si.quantity) filter(where st.inventory_applied),0) as posted_units,
   count(distinct coalesce(st.business_date,(st.sale_at at time zone 'Asia/Manila')::date)) filter(where st.inventory_applied and si.quantity>0) as sale_days,
   count(distinct date_trunc('month',coalesce(st.business_date,(st.sale_at at time zone 'Asia/Manila')::date)::timestamp)) filter(where st.inventory_applied and si.quantity>0) as sale_months,
   max(coalesce(st.business_date,(st.sale_at at time zone 'Asia/Manila')::date)) filter(where st.inventory_applied and si.quantity>0) as last_sale_date
 from operations.sales_transactions st join operations.sales_transaction_items si on si.transaction_id=st.id
 join page_rows p on p.id=si.product_id cross join clock c
 where st.status='completed' and si.line_type='product' and st.transaction_number not ilike 'SALE-DEMO-%'
   and coalesce(st.customer_name_snapshot,'') not ilike 'demo customer%' and coalesce(st.original_reference,'') not ilike 'DEMO-%'
   and coalesce(st.business_date,(st.sale_at at time zone 'Asia/Manila')::date)>=c.today-90
   and coalesce(st.business_date,(st.sale_at at time zone 'Asia/Manila')::date)<c.today
 group by si.product_id
), incoming as (
 select i.product_id,sum(i.quantity-i.received_quantity) as incoming_total,
   coalesce(sum(i.quantity-i.received_quantity) filter(where o.expected_date>=c.today and o.expected_date<=c.today+coalesce(p.lead_time_days,0)),0) as incoming_on_time,
   coalesce(sum(i.quantity-i.received_quantity) filter(where o.expected_date<c.today),0) as incoming_overdue,
   coalesce(sum(i.quantity-i.received_quantity) filter(where o.expected_date is null),0) as incoming_undated,
   coalesce(sum(i.quantity-i.received_quantity) filter(where o.expected_date>c.today+coalesce(p.lead_time_days,0)),0) as incoming_later
 from catalog.supplier_order_items i join catalog.supplier_orders o on o.id=i.order_id and o.stage='ordered'
 join page_rows p on p.id=i.product_id cross join clock c where i.quantity>i.received_quantity group by i.product_id
), measured as (
 select p.*,coalesce(s.recorded_units,0) as recorded_units,coalesce(s.posted_units,0) as posted_units,
   coalesce(s.sale_days,0) as sale_days,coalesce(s.sale_months,0) as sale_months,s.last_sale_date,
   coalesce(s.posted_units>0 and s.sale_days>=6 and s.sale_months>=3 and s.last_sale_date>=c.today-30,false) as history_eligible,
   coalesce(i.incoming_total,0) as incoming_total,coalesce(i.incoming_on_time,0) as incoming_on_time,
   coalesce(i.incoming_overdue,0) as incoming_overdue,coalesce(i.incoming_undated,0) as incoming_undated,coalesce(i.incoming_later,0) as incoming_later
 from page_rows p cross join clock c left join sales s on s.product_id=p.id left join incoming i on i.product_id=p.id
), coverage as (
 select *,case when history_eligible and lead_time_days is not null then ceil(greatest(posted_units,0)/90.0*lead_time_days) else null end as demand_cover from measured
), targets as (
 select *,case when reorder_point>0 or demand_cover>0 then greatest(reorder_point,coalesce(demand_cover,0)) else null end as planning_target from coverage
), result_rows as (
 select *,case when planning_target is null then null when available<=planning_target then greatest(ceil(planning_target+reorder_quantity-available-incoming_on_time),0) else 0 end as review_quantity,
   case when demand_cover is not null and reorder_point>0 then 'sales_and_policy' when demand_cover is not null and demand_cover>0 then 'sales_coverage' when reorder_point>0 then 'saved_policy' else 'unconfigured' end as review_basis
 from targets
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by case when p_sort='priority' then priority_rank end desc nulls last,case when p_sort='available' then available end asc nulls last,sku,id) from result_rows r),'[]'),
 'total',(select count(*) from filtered),'window',jsonb_build_object('start',(select today-90 from clock),'end',(select today-1 from clock),'days',90,'minimumSaleDays',6,'minimumActiveMonths',3,'recentWithinDays',30));
$body$;
revoke all on function public.limen_replenishment_review(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.limen_replenishment_review(text,text,integer,text) to service_role;

create or replace function public.limen_replenishment_history(p_product uuid,p_page integer)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with events as (
 select 'reorder-'||id::text as id,'Reorder settings' as kind,created_at,
   jsonb_build_object('reorderPoint',previous_point,'reorderQuantity',previous_quantity,'priority',previous_priority) as previous,
   jsonb_build_object('reorderPoint',reorder_point,'reorderQuantity',reorder_quantity,'priority',reorder_priority) as saved from catalog.inventory_reorder_changes where product_id=p_product
 union all select 'supply-'||id::text,'Supplier plan',created_at,previous_plan,saved_plan from catalog.inventory_supply_plan_changes where product_id=p_product
), page_rows as (select * from events order by created_at desc,id limit 10 offset (greatest(coalesce(p_page,1),1)-1)*10)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from page_rows r),'[]'),'total',(select count(*) from events));
$body$;
revoke all on function public.limen_replenishment_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.limen_replenishment_history(uuid,integer) to service_role;
