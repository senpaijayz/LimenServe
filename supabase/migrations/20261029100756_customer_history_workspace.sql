-- Staff-only, read-only identity lookup. Never infer record ownership from names or plates.
create function public.limen_customer_lookup(p_search text,p_page integer,p_quotes boolean)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with links as materialized (
 select customer_id,id as vehicle_id from operations.vehicles where customer_id is not null
 union select customer_id,vehicle_id from operations.service_orders where customer_id is not null and vehicle_id is not null
 union select customer_id,vehicle_id from operations.estimates where p_quotes and customer_id is not null and vehicle_id is not null
), filtered as materialized (
 select c.id,c.name,c.phone,c.created_at from operations.customers c
 where length(btrim(coalesce(p_search,'')))>=2 and (
   strpos(lower(coalesce(c.name,'')),lower(left(btrim(p_search),120)))>0
   or (length(regexp_replace(p_search,'[^0-9]','','g'))>=2 and strpos(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),regexp_replace(left(p_search,120),'[^0-9]','','g'))>0)
   or exists(select 1 from links l join operations.vehicles v on v.id=l.vehicle_id where l.customer_id=c.id
     and strpos(upper(regexp_replace(coalesce(v.plate_no,''),'[^A-Za-z0-9]','','g')),upper(regexp_replace(left(p_search,120),'[^A-Za-z0-9]','','g')))>0
     and length(regexp_replace(p_search,'[^A-Za-z0-9]','','g'))>=2)
 )
), page_rows as (
 select c.*,(select count(*) from operations.service_orders where customer_id=c.id) as service_count,
   case when p_quotes then (select count(*) from operations.estimates where customer_id=c.id) else null end as quote_count,
   (select count(*) from operations.sales_transactions where customer_id=c.id) as sale_count,
   (select count(*) from links where customer_id=c.id) as vehicle_count
 from filtered c order by c.created_at desc,c.id limit 24 offset (greatest(coalesce(p_page,1),1)-1)*24
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from page_rows r),'[]'),
 'total',(select count(*) from filtered),'quotesAllowed',p_quotes,'checkedAt',now());
$body$;
revoke all on function public.limen_customer_lookup(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.limen_customer_lookup(text,integer,boolean) to service_role;

create function public.limen_customer_history(p_customer uuid,p_kind text,p_vehicle uuid,p_page integer,p_quotes boolean)
returns jsonb language sql stable security invoker set search_path=''
as $body$
with customer as (select id,name,phone,created_at from operations.customers where id=p_customer),
links as materialized (
 select id from operations.vehicles where customer_id=p_customer
 union select vehicle_id from operations.service_orders where customer_id=p_customer and vehicle_id is not null
 union select vehicle_id from operations.estimates where p_quotes and customer_id=p_customer and vehicle_id is not null
), vehicles as materialized (
 select v.id,v.plate_no,v.make,v.model_name,v.year,v.created_at,v.customer_id=p_customer as current_link
 from operations.vehicles v join links l on l.id=v.id
), records as materialized (
 select 'orders' as kind,so.id,so.created_at,jsonb_build_object('id',so.id,'reference',so.order_number,'createdAt',so.created_at,
   'status',so.status,'paymentStatus',so.payment_status,'workStage',w.stage,'total',so.total_amount,'note',left(so.note,1200),
   'vehicleId',so.vehicle_id,'plate',v.plate_no,'vehicleLabel',concat_ws(' ',v.year,v.make,v.model_name)) as payload
 from operations.service_orders so left join operations.vehicles v on v.id=so.vehicle_id
 left join operations.service_work_state w on w.service_order_id=so.id
 where so.customer_id=p_customer and (p_vehicle is null or so.vehicle_id=p_vehicle)
 union all
 select 'quotes',e.id,e.created_at,jsonb_build_object('id',e.id,'reference',e.estimate_number,'createdAt',e.created_at,
   'status',e.status,'total',e.grand_total,'validUntil',e.valid_until,'archived',e.archived_at is not null,'vehicleId',e.vehicle_id,
   'plate',coalesce(e.vehicle_snapshot->>'plate_no',e.vehicle_snapshot->>'plate',v.plate_no),
   'vehicleLabel',concat_ws(' ',coalesce(e.vehicle_snapshot->>'year',v.year::text),coalesce(e.vehicle_snapshot->>'make',v.make),coalesce(e.vehicle_snapshot->>'model_name',e.vehicle_snapshot->>'model',v.model_name)))
 from operations.estimates e left join operations.vehicles v on v.id=e.vehicle_id
 where p_quotes and e.customer_id=p_customer and (p_vehicle is null or e.vehicle_id=p_vehicle)
 union all
 select 'sales',s.id,coalesce(s.sale_at,s.created_at),jsonb_build_object('id',s.id,'reference',s.transaction_number,'createdAt',coalesce(s.sale_at,s.created_at),
   'status',s.status,'total',s.total_amount,'paymentMethod',s.payment_method,'sourceType',s.source_type,'inventoryApplied',s.inventory_applied,
   'customerNameSnapshot',s.customer_name_snapshot,'vehicleId',case when e.customer_id=p_customer then e.vehicle_id else null end)
 from operations.sales_transactions s left join operations.estimates e on e.id=s.estimate_id
 where s.customer_id=p_customer and (p_vehicle is null or (e.customer_id=p_customer and e.vehicle_id=p_vehicle))
 union all
 select 'vehicles',v.id,v.created_at,jsonb_build_object('id',v.id,'createdAt',v.created_at,'plate',v.plate_no,'make',v.make,'model',v.model_name,'year',v.year,'currentLink',coalesce(v.current_link,false)) from vehicles v
), page_rows as (
 select * from records where kind=p_kind order by created_at desc,id limit 20 offset (greatest(coalesce(p_page,1),1)-1)*20
)
select case when not exists(select 1 from customer) then null
 when p_vehicle is not null and not exists(select 1 from vehicles where id=p_vehicle) then jsonb_build_object('invalidVehicle',true)
 else jsonb_build_object('customer',(select to_jsonb(c) from customer c),'selectedVehicle',(select to_jsonb(v) from vehicles v where id=p_vehicle),
 'items',coalesce((select jsonb_agg(payload order by created_at desc,id) from page_rows),'[]'),'total',(select count(*) from records where kind=p_kind),
 'counts',(select jsonb_build_object('orders',count(*) filter(where kind='orders'),'quotes',case when p_quotes then count(*) filter(where kind='quotes') else null end,'sales',count(*) filter(where kind='sales'),'vehicles',count(*) filter(where kind='vehicles')) from records),
 'quotesAllowed',p_quotes,'checkedAt',now()) end;
$body$;
revoke all on function public.limen_customer_history(uuid,text,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.limen_customer_history(uuid,text,uuid,integer,boolean) to service_role;
