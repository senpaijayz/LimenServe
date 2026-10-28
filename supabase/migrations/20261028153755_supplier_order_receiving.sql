create table catalog.supplier_orders (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 code text not null unique, supplier_id uuid not null references catalog.suppliers(id) on delete restrict,
 supplier_name text not null, external_reference text not null default '', expected_date date,
 notes text not null default '', stage text not null default 'draft' check(stage in ('draft','ordered','cancelled')),
 version integer not null default 1 check(version>0), creation_payload jsonb not null, draft_payload jsonb not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index supplier_orders_supplier_idx on catalog.supplier_orders(supplier_id);
create index supplier_orders_creator_idx on catalog.supplier_orders(created_by) where created_by is not null;
create index supplier_orders_recent_idx on catalog.supplier_orders(updated_at desc,id);
create table catalog.supplier_order_items (
 order_id uuid not null references catalog.supplier_orders(id) on delete restrict,
 product_id uuid references catalog.products(id) on delete set null, original_product_id uuid not null,
 sku text not null, name text not null,
 quantity integer not null check(quantity between 1 and 1000000), received_quantity integer not null default 0 check(received_quantity>=0 and received_quantity<=quantity),
 primary key(order_id,original_product_id)
);
create index supplier_order_items_product_idx on catalog.supplier_order_items(product_id) where product_id is not null;
create table catalog.supplier_order_events (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references catalog.supplier_orders(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null, kind text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index supplier_order_events_order_idx on catalog.supplier_order_events(order_id,created_at desc,id);
create index supplier_order_events_actor_idx on catalog.supplier_order_events(actor_id) where actor_id is not null;
create table catalog.supplier_order_receipts (
 request_id uuid primary key, order_id uuid not null references catalog.supplier_orders(id) on delete restrict,
 payload jsonb not null, result jsonb not null, actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index supplier_order_receipts_order_idx on catalog.supplier_order_receipts(order_id);
create index supplier_order_receipts_actor_idx on catalog.supplier_order_receipts(actor_id) where actor_id is not null;
alter table catalog.supplier_orders enable row level security;
alter table catalog.supplier_order_items enable row level security;
alter table catalog.supplier_order_events enable row level security;
alter table catalog.supplier_order_receipts enable row level security;
revoke all on catalog.supplier_orders,catalog.supplier_order_items,catalog.supplier_order_events,catalog.supplier_order_receipts from public,anon,authenticated,service_role;
grant select,insert,update on catalog.supplier_orders to service_role;
grant select,insert,update,delete on catalog.supplier_order_items to service_role;
grant select,insert on catalog.supplier_order_events,catalog.supplier_order_receipts to service_role;
create policy backend_select on catalog.supplier_orders for select to service_role using(true);
create policy backend_insert on catalog.supplier_orders for insert to service_role with check(true);
create policy backend_update on catalog.supplier_orders for update to service_role using(true) with check(true);
create policy backend_select on catalog.supplier_order_items for select to service_role using(true);
create policy backend_insert on catalog.supplier_order_items for insert to service_role with check(true);
create policy backend_update on catalog.supplier_order_items for update to service_role using(true) with check(true);
create policy backend_delete on catalog.supplier_order_items for delete to service_role using(true);
create policy backend_select on catalog.supplier_order_events for select to service_role using(true);
create policy backend_insert on catalog.supplier_order_events for insert to service_role with check(true);
create policy backend_select on catalog.supplier_order_receipts for select to service_role using(true);
create policy backend_insert on catalog.supplier_order_receipts for insert to service_role with check(true);

create function public.limen_supplier_order_detail(p_id uuid,p_page integer default 1)
returns jsonb language sql volatile security invoker set search_path='' as $body$
select jsonb_build_object('id',o.id,'code',o.code,'supplierId',o.supplier_id,'supplierName',o.supplier_name,
 'externalReference',o.external_reference,'expectedDate',o.expected_date,'notes',o.notes,'stage',o.stage,'version',o.version,
 'status',case when o.stage='cancelled' then 'Cancelled' when o.stage='draft' then 'Draft' when not exists(select 1 from catalog.supplier_order_items i where i.order_id=o.id and i.received_quantity<i.quantity) then 'Received' when exists(select 1 from catalog.supplier_order_items i where i.order_id=o.id and i.received_quantity>0) then 'Part received' else 'Awaiting delivery' end,
 'items',coalesce((select jsonb_agg(jsonb_build_object('productId',i.product_id,'originalProductId',i.original_product_id,'sku',i.sku,'name',i.name,'quantity',i.quantity,'received',i.received_quantity,'remaining',i.quantity-i.received_quantity,'available',coalesce(p.is_active,false)) order by i.sku,i.original_product_id) from catalog.supplier_order_items i left join catalog.products p on p.id=i.product_id where i.order_id=o.id),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id) from (select id,kind,details,created_at from catalog.supplier_order_events where order_id=o.id order by created_at desc,id limit 20 offset (greatest(coalesce(p_page,1),1)-1)*20) e),'[]'),
 'eventCount',(select count(*) from catalog.supplier_order_events where order_id=o.id),'createdAt',o.created_at,'updatedAt',o.updated_at)
from catalog.supplier_orders o where o.id=p_id;
$body$;
revoke all on function public.limen_supplier_order_detail(uuid,integer) from public,anon,authenticated;
grant execute on function public.limen_supplier_order_detail(uuid,integer) to service_role;

create function public.limen_supplier_order_page(p_filter text,p_search text,p_page integer)
returns jsonb language sql stable security invoker set search_path='' as $body$
with orders as materialized (
 select o.id,o.code,o.supplier_name as "supplierName",o.expected_date as "expectedDate",o.updated_at as "updatedAt",o.stage,
 coalesce((select sum(quantity-received_quantity) from catalog.supplier_order_items where order_id=o.id),0) as remaining,
 case when o.stage='cancelled' then 'Cancelled' when o.stage='draft' then 'Draft' when not exists(select 1 from catalog.supplier_order_items i where i.order_id=o.id and i.received_quantity<i.quantity) then 'Received' when exists(select 1 from catalog.supplier_order_items i where i.order_id=o.id and i.received_quantity>0) then 'Part received' else 'Awaiting delivery' end as status
 from catalog.supplier_orders o
 where (coalesce(p_search,'')='' or strpos(lower(o.code||' '||o.supplier_name||' '||o.external_reference),lower(left(p_search,120)))>0)
), filtered as materialized (
 select * from orders where case p_filter when 'all' then true when 'draft' then stage='draft' when 'pending' then stage='ordered' and remaining>0 when 'received' then status='Received' when 'cancelled' then stage='cancelled' else false end
), page_rows as (select * from filtered order by "updatedAt" desc,id limit 20 offset (greatest(coalesce(p_page,1),1)-1)*20)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by "updatedAt" desc,id) from page_rows r),'[]'),'total',(select count(*) from filtered));
$body$;
revoke all on function public.limen_supplier_order_page(text,text,integer) from public,anon,authenticated;
grant execute on function public.limen_supplier_order_page(text,text,integer) to service_role;

create function public.limen_supplier_order_receipt(p_order uuid,p_request uuid)
returns jsonb language sql stable security invoker set search_path='' as $body$
 select result from catalog.supplier_order_receipts where order_id=p_order and request_id=p_request;
$body$;
revoke all on function public.limen_supplier_order_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.limen_supplier_order_receipt(uuid,uuid) to service_role;

create function public.limen_supplier_order_command(p_action text,p_payload jsonb,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $body$
declare
 o catalog.supplier_orders%rowtype; prior_receipt catalog.supplier_order_receipts%rowtype;
 item jsonb; lines jsonb; normalized jsonb; request_uuid uuid; supplier_uuid uuid; supplier_label text;
 product_row catalog.products%rowtype; q numeric; result jsonb; receipt_day date; expected_day date;
begin
 if p_action='receive' then
   if p_actor is null or not exists(select 1 from core.user_profiles where user_id=p_actor and role in ('admin','stock_clerk')) then raise exception using errcode='42501',message='Inventory staff permission is required.'; end if;
 else
   perform operations.assert_assignment_admin(p_actor);
 end if;
 if p_action not in ('save','ordered','cancelled','receive') then raise exception using errcode='22023',message='Choose a valid supplier order action.'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='Provide order details.'; end if;
 if p_action in ('save','receive') then
   if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception using errcode='22023',message='Choose 1–100 distinct parts.'; end if;
   if (select count(distinct value->>'productId') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') then raise exception using errcode='22023',message='List each part only once.'; end if;
   for item in select value from jsonb_array_elements(p_payload->'items') loop
     if nullif(item->>'productId','') is null then raise exception using errcode='22023',message='A selected part is unavailable.'; end if;
     q:=(item->>'quantity')::numeric;
     if q is null or q<1 or q>1000000 or q<>trunc(q) then raise exception using errcode='22023',message='Use whole quantities from 1 to 1,000,000.'; end if;
   end loop;
   select jsonb_agg(jsonb_build_object('productId',(value->>'productId')::uuid,'quantity',(value->>'quantity')::integer) order by value->>'productId') into lines from jsonb_array_elements(p_payload->'items');
   request_uuid:=(p_payload->>'requestId')::uuid;
   if request_uuid is null then raise exception using errcode='22023',message='Keep a valid request identity before saving.'; end if;
 end if;
 if p_action='save' then
   supplier_uuid:=(p_payload->>'supplierId')::uuid;
   expected_day:=nullif(p_payload->>'expectedDate','')::date;
   if supplier_uuid is null then raise exception using errcode='22023',message='Choose a supplier.'; end if;
   select name into supplier_label from catalog.suppliers where id=supplier_uuid;
   if not found then raise exception using errcode='22023',message='Supplier is no longer available.'; end if;
   normalized:=jsonb_build_object('supplierId',supplier_uuid,'expectedDate',expected_day,'externalReference',left(btrim(coalesce(p_payload->>'externalReference','')),120),'notes',left(btrim(coalesce(p_payload->>'notes','')),1000),'items',lines,'actorId',p_actor);
   if nullif(p_payload->>'id','') is null then
     perform pg_advisory_xact_lock(hashtextextended('supplier-order:'||request_uuid::text,0));
     select * into o from catalog.supplier_orders where request_id=request_uuid for update;
     if found then
       if o.creation_payload is distinct from normalized then raise exception using errcode='22023',message='This draft request was already saved with different details. Reopen the saved order.'; end if;
       return public.limen_supplier_order_detail(o.id,1);
     end if;
     insert into catalog.supplier_orders(request_id,code,supplier_id,supplier_name,external_reference,expected_date,notes,creation_payload,draft_payload,created_by)
       values(request_uuid,'PO-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(replace(request_uuid::text,'-','')),supplier_uuid,supplier_label,normalized->>'externalReference',expected_day,normalized->>'notes',normalized,normalized,p_actor) returning * into o;
   else
     select * into o from catalog.supplier_orders where id=(p_payload->>'id')::uuid for update;
     if not found then raise exception using errcode='P0002',message='Supplier order was not found.'; end if;
     if o.stage<>'draft' then raise exception using errcode='22023',message='Only drafts can be edited. Cancel outstanding quantities instead of rewriting placed orders.'; end if;
     if o.draft_payload=normalized then return public.limen_supplier_order_detail(o.id,1); end if;
     if o.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception using errcode='40001',message='This draft changed. Reload before editing it.'; end if;
     delete from catalog.supplier_order_items where order_id=o.id;
     update catalog.supplier_orders set supplier_id=supplier_uuid,supplier_name=supplier_label,external_reference=normalized->>'externalReference',expected_date=expected_day,notes=normalized->>'notes',draft_payload=normalized,version=version+1,updated_at=now() where id=o.id;
   end if;
   for item in select value from jsonb_array_elements(lines) loop
     select * into product_row from catalog.products where id=(item->>'productId')::uuid and is_active;
     if not found then raise exception using errcode='22023',message='A selected part is inactive or unavailable. No draft changes were saved.'; end if;
     insert into catalog.supplier_order_items(order_id,product_id,original_product_id,sku,name,quantity) values(o.id,product_row.id,product_row.id,product_row.sku,product_row.name,(item->>'quantity')::integer);
   end loop;
   insert into catalog.supplier_order_events(order_id,actor_id,kind,details) values(o.id,p_actor,case when nullif(p_payload->>'id','') is null then 'Draft saved' else 'Draft updated' end,jsonb_build_object('before',o.draft_payload,'saved',normalized));
   return public.limen_supplier_order_detail(o.id,1);
 end if;

 select * into o from catalog.supplier_orders where id=(p_payload->>'id')::uuid for update;
 if not found then raise exception using errcode='P0002',message='Supplier order was not found.'; end if;
 if p_action='receive' then
   receipt_day:=(p_payload->>'receivedDate')::date;
   if receipt_day is null or receipt_day>(now() at time zone 'Asia/Manila')::date then raise exception using errcode='22023',message='Choose the actual received date, not a future date.'; end if;
   normalized:=jsonb_build_object('id',o.id,'actorId',p_actor,'items',lines,'receivedDate',receipt_day,'referenceNumber',left(btrim(coalesce(p_payload->>'referenceNumber','')),120),'reason',left(btrim(coalesce(p_payload->>'reason','')),1000));
   select * into prior_receipt from catalog.supplier_order_receipts where request_id=request_uuid;
   if found then
     if prior_receipt.order_id<>o.id or prior_receipt.payload is distinct from normalized then raise exception using errcode='22023',message='This receipt reference was already used with different details. Check the order history.'; end if;
     return prior_receipt.result || jsonb_build_object('idempotentReplay',true);
   end if;
   if o.stage<>'ordered' then raise exception using errcode='22023',message='Receive only against an order already placed with the supplier.'; end if;
   if o.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception using errcode='40001',message='This order changed. Reload and review the outstanding quantities before receiving.'; end if;
   for item in select value from jsonb_array_elements(lines) loop
     perform 1 from catalog.supplier_order_items i join catalog.products p on p.id=i.product_id and p.is_active where i.order_id=o.id and i.product_id=(item->>'productId')::uuid and i.quantity-i.received_quantity >= (item->>'quantity')::integer;
     if not found then raise exception using errcode='22023',message='A received quantity exceeds the remaining order, or a part is unavailable. Nothing was received.'; end if;
   end loop;
   result:=public.receive_catalog_stock_batch(jsonb_build_object('items',lines,'supplierId',o.supplier_id,'referenceNumber',o.code||case when normalized->>'referenceNumber'<>'' then ' / '|| (normalized->>'referenceNumber') else '' end,'receivedDate',receipt_day,'reason',normalized->>'reason'),p_actor,'po:'||request_uuid::text);
   for item in select value from jsonb_array_elements(lines) loop
     update catalog.supplier_order_items set received_quantity=received_quantity+(item->>'quantity')::integer where order_id=o.id and product_id=(item->>'productId')::uuid;
   end loop;
   update catalog.supplier_orders set version=version+1,updated_at=now() where id=o.id;
   result:=result||jsonb_build_object('orderId',o.id,'orderCode',o.code);
   insert into catalog.supplier_order_receipts(request_id,order_id,payload,result,actor_id) values(request_uuid,o.id,normalized,result,p_actor);
   insert into catalog.supplier_order_events(order_id,actor_id,kind,details) values(o.id,p_actor,'Stock received',jsonb_build_object('requestId',request_uuid,'receiptId',result->'receiptId','totalQuantity',result->'totalQuantity'));
   return result;
 end if;
 if o.stage=p_action then return public.limen_supplier_order_detail(o.id,1); end if;
 if o.version is distinct from (p_payload->>'expectedVersion')::integer then raise exception using errcode='40001',message='This order changed. Reload before continuing.'; end if;
 if p_action='ordered' and o.stage<>'draft' then raise exception using errcode='22023',message='Only a draft can be marked as placed.'; end if;
 if p_action='ordered' and exists(select 1 from catalog.supplier_order_items i left join catalog.products p on p.id=i.product_id where i.order_id=o.id and not coalesce(p.is_active,false)) then raise exception using errcode='22023',message='A part is inactive or unavailable. Edit the draft before marking it placed.'; end if;
 if p_action='cancelled' and not exists(select 1 from catalog.supplier_order_items where order_id=o.id and received_quantity<quantity) then raise exception using errcode='22023',message='This order is fully received and cannot be cancelled.'; end if;
 update catalog.supplier_orders set stage=p_action,version=version+1,updated_at=now() where id=o.id;
 insert into catalog.supplier_order_events(order_id,actor_id,kind,details) values(o.id,p_actor,case when p_action='ordered' then 'Marked as placed with supplier' else 'Outstanding quantities cancelled' end,jsonb_build_object('notes',left(coalesce(p_payload->>'notes',''),1000)));
 return public.limen_supplier_order_detail(o.id,1);
end;
$body$;
revoke all on function public.limen_supplier_order_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.limen_supplier_order_command(text,jsonb,uuid) to service_role;

-- Preserve a supplier's estimate only when the confirmed delivery uses that same supplier.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.receive_catalog_stock(jsonb,uuid,text)'::regprocedure);
 if position('on conflict (product_id) do update set supplier_id = excluded.supplier_id;' in definition)=0 then raise exception 'Receiver supplier-link update changed; review before applying.'; end if;
 definition:=replace(definition,'on conflict (product_id) do update set supplier_id = excluded.supplier_id;', 'on conflict (product_id) do update set lead_time_days = case when catalog.product_supplier_links.supplier_id=excluded.supplier_id then catalog.product_supplier_links.lead_time_days else null end, supplier_id = excluded.supplier_id;');
 execute definition;
end;
$migration$;
