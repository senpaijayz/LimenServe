-- Released unpaid POS orders use the existing pending lifecycle, never a fake payment.
alter table operations.sales_transactions
  add column pos_note text,
  add column pos_issued_at timestamptz,
  add column pos_paid_at timestamptz;

create table operations.pos_checkout_requests (
  actor_id uuid not null,
  request_id uuid not null,
  operation text not null check(operation in ('checkout','settlement')),
  payload jsonb not null,
  sale_id uuid not null references operations.sales_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
create index pos_checkout_requests_sale_idx on operations.pos_checkout_requests(sale_id);
alter table operations.pos_checkout_requests enable row level security;
revoke all on operations.pos_checkout_requests from public,anon,authenticated,service_role;
grant select,insert on operations.pos_checkout_requests to service_role;

-- Preserve the reviewed price gate, ordered balance locks, line snapshots and stock posting.
do $patch$
declare d text; old text; replacement text;
begin
  d:=replace(pg_get_functiondef('operations.create_pos_sale_internal(jsonb,uuid)'::regprocedure),chr(13),'');
  old:=$old$if v_payment_method not in ('cash', 'gcash', 'bank_transfer') then$old$;
  if strpos(d,old)=0 then raise exception 'POS payment validation changed; review migration before applying.'; end if;
  d:=replace(d,old,$new$if v_payment_method not in ('cash', 'gcash', 'bank_transfer', 'to_follow') then$new$);
  old:=$old$    v_payment_method,
    'completed',$old$;
  if strpos(d,old)=0 then raise exception 'POS lifecycle insertion changed; review migration before applying.'; end if;
  d:=replace(d,old,$new$    v_payment_method,
    case when v_payment_method='to_follow' then 'pending' else 'completed' end,$new$);
  old:=$old$begin
  if jsonb_typeof(v_items)$old$;
  if strpos(d,old)=0 then raise exception 'POS constructor changed; review migration before applying.'; end if;
  d:=replace(d,old,$new$begin
  if v_payment_method='to_follow' and (v_customer_name is null
      or nullif(btrim(payload->>'note'),'') is null or length(payload->>'note')>1000
      or coalesce(payload->>'releaseConfirmed','false')<>'true') then
    raise exception using errcode='22023',message='Enter the customer and a note, then confirm the parts are being released now.';
  end if;
  if jsonb_typeof(v_items)$new$);
  execute d;

  d:=replace(pg_get_functiondef('public.get_sale_detail(uuid)'::regprocedure),chr(13),'');
  old:='      st.status,';
  if strpos(d,old)=0 then raise exception 'Sale detail header changed; review migration before applying.'; end if;
  d:=replace(d,old,old||E'\n      st.pos_note, st.pos_issued_at, st.pos_paid_at,');
  old:=$old$'status', sh.status,$old$;
  if (length(d)-length(replace(d,old,'')))/length(old)<>2 then raise exception 'Sale detail response changed; review migration before applying.'; end if;
  d:=replace(d,old,old||E'\n            ''note'', sh.pos_note, ''issuedAt'', sh.pos_issued_at, ''paidAt'', sh.pos_paid_at,');
  execute d;
end;
$patch$;

create function public.pos_order_result(p_sale_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('saleId',id,'transactionNumber',transaction_number,'status',status,
   'paymentMethod',payment_method,'totalAmount',total_amount,'paidAt',pos_paid_at)
 from operations.sales_transactions where id=p_sale_id;
$$;

create function public.checkout_pos_order(payload jsonb,p_actor uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior operations.pos_checkout_requests%rowtype; sale_id uuid; method text:=payload->>'paymentMethod';
 field text; value numeric; line jsonb; disc numeric;
begin
 perform operations.assert_workshop_staff(p_actor);
 if p_request is null or jsonb_typeof(payload) is distinct from 'object' then
   raise exception using errcode='22023',message='A saved checkout reference is required.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pos-request:'||p_actor||':'||p_request,0));
 select * into prior from operations.pos_checkout_requests where actor_id=p_actor and request_id=p_request;
 if found then
   if prior.operation<>'checkout' or prior.payload is distinct from payload then
     raise exception using errcode='PT409',message='This checkout reference already belongs to a saved operation. Check its saved result before continuing.';
   end if;
   return public.pos_order_result(prior.sale_id);
 end if;
 if method is null or method not in ('cash','to_follow') or length(coalesce(payload->>'note',''))>1000
     or length(coalesce(payload->>'customerName',''))>200 then
   raise exception using errcode='22023',message='Choose Cash or Payment to follow and keep the note within 1000 characters.';
 end if;
 foreach field in array array['rawSubtotal','discountAmount','tax','total'] loop
   value:=(payload->'totals'->>field)::numeric;
   if value is null or value<0 or value>1000000000 or value::text in ('NaN','Infinity','-Infinity') then
     raise exception using errcode='22023',message='Review the sale amounts before continuing.';
   end if;
 end loop;
 disc:=(payload->>'discountPercent')::numeric;
 if disc is null or disc<0 or disc>100 or disc::text in ('NaN','Infinity','-Infinity')
   or abs(round((payload->'totals'->>'rawSubtotal')::numeric*disc/100,2)-(payload->'totals'->>'discountAmount')::numeric)>0.01
   or abs(round(((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric)*0.12,2)-(payload->'totals'->>'tax')::numeric)>0.01 then
   raise exception using errcode='22023',message='Review the POS discount and VAT amounts.';
 end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 200 then
   raise exception using errcode='22023',message='Choose between 1 and 200 order lines.';
 end if;
 for line in select * from jsonb_array_elements(payload->'items') loop
   if (line->>'quantity')::numeric<=0 or (line->>'quantity')::numeric>999999
      or (line->>'quantity')::numeric::text in ('NaN','Infinity','-Infinity')
      or abs(round((line->>'quantity')::numeric*(line->>'unitPrice')::numeric,2)-(line->>'lineTotal')::numeric)>0.01 then
     raise exception using errcode='22023',message='Review the order quantities and line totals.';
   end if;
 end loop;
 value:=(payload->>'cashReceived')::numeric;
 if value is null or value<0 or value>1000000000 or value::text in ('NaN','Infinity','-Infinity') then
   raise exception using errcode='22023',message='Enter a valid cash amount.';
 end if;
 if method='to_follow' and (coalesce((payload->>'cashReceived')::numeric,0)<>0 or coalesce((payload->>'changeDue')::numeric,0)<>0) then
   raise exception using errcode='22023',message='An unpaid order cannot record cash or change.';
 end if;
 if method='to_follow' and coalesce((payload->'totals'->>'total')::numeric,0)<=0 then
   raise exception using errcode='22023',message='A payment-to-follow order must have a positive balance.';
 end if;
 sale_id:=public.create_pos_sale(payload,p_actor);
 update operations.sales_transactions set pos_note=nullif(btrim(payload->>'note'),''),pos_issued_at=created_at,
   pos_paid_at=case when method='cash' then now() else null end where id=sale_id;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'checkout',payload,sale_id);
 return public.pos_order_result(sale_id);
end;
$$;

create function public.settle_pos_order(p_sale_id uuid,payload jsonb,p_actor uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare prior operations.pos_checkout_requests%rowtype; sale operations.sales_transactions%rowtype;
 cash numeric; posted timestamptz:=now(); day date:=(now() at time zone 'Asia/Manila')::date;
begin
 perform operations.assert_workshop_staff(p_actor);
 if p_request is null or p_sale_id is null or jsonb_typeof(payload) is distinct from 'object' then
   raise exception using errcode='22023',message='Choose a saved unpaid order and payment reference.';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('pos-request:'||p_actor||':'||p_request,0));
 select * into prior from operations.pos_checkout_requests where actor_id=p_actor and request_id=p_request;
 if found then
   if prior.operation<>'settlement' or prior.sale_id<>p_sale_id or prior.payload is distinct from payload then
     raise exception using errcode='PT409',message='This payment reference already belongs to a saved operation. Check its saved result before continuing.';
   end if;
   return public.pos_order_result(prior.sale_id);
 end if;
 select * into sale from operations.sales_transactions where id=p_sale_id for update;
 if not found or sale.source_type<>'pos' or sale.pos_issued_at is null then
   raise exception using errcode='22023',message='Choose a POS payment-to-follow order.';
 end if;
 if sale.status<>'pending' or sale.payment_method<>'to_follow' or not sale.inventory_applied then
   raise exception using errcode='PT409',message='This order is no longer unpaid. Refresh it before collecting money.';
 end if;
 cash:=round((payload->>'cashReceived')::numeric,2);
 if coalesce(payload->>'paymentVerified','false')<>'true' or cash is null or cash<sale.total_amount
     or cash::text in ('NaN','Infinity','-Infinity') then
   raise exception using errcode='22023',message='Confirm the cash was received and enter enough for the full balance.';
 end if;
 -- Payment-date recognition; original issuance and inventory movement dates remain intact.
 update operations.sales_transactions set status='completed',payment_method='cash',cash_received=cash,
   change_due=round(cash-total_amount,2),pos_paid_at=posted,sale_at=posted,business_date=day,updated_by=p_actor where id=p_sale_id;
 update operations.sales_transaction_items set business_date=day where transaction_id=p_sale_id;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'settlement',payload,p_sale_id);
 -- No inventory function, balance update or movement insert is performed during settlement.
 return public.pos_order_result(p_sale_id);
end;
$$;

create function public.recover_pos_order(p_actor uuid,p_request uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare saved uuid;
begin
 perform operations.assert_workshop_staff(p_actor);
 select sale_id into saved from operations.pos_checkout_requests where actor_id=p_actor and request_id=p_request;
 return case when saved is null then null else public.pos_order_result(saved) end;
end;
$$;

create function public.list_unpaid_pos_orders(p_page integer default 1) returns jsonb
language sql stable security invoker set search_path='' as $$
 with rows as materialized (
   select id,transaction_number,customer_name_snapshot,total_amount,pos_note,pos_issued_at from operations.sales_transactions
   where source_type='pos' and status='pending' and payment_method='to_follow' and pos_issued_at is not null
 ), bounds as (select count(*)::integer total,greatest(1,least(greatest(p_page,1),greatest(1,(count(*)::integer+7)/8))) page from rows),
 selected as(select * from rows order by pos_issued_at,id limit 8 offset(select (page-1)*8 from bounds))
 select jsonb_build_object('orders',coalesce((select jsonb_agg(to_jsonb(s) order by s.pos_issued_at,s.id) from selected s),'[]'::jsonb),
   'pagination',jsonb_build_object('page',page,'pageSize',8,'totalCount',total,'totalPages',greatest(1,(total+7)/8))) from bounds;
$$;

create function public.paid_sales_day_totals(p_date date) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('totalAmount',coalesce(sum(total_amount),0),'transactionCount',count(*))
 from operations.sales_transactions
 where status='completed' and business_date=p_date
 and transaction_number not ilike 'SALE-DEMO-%'
 and coalesce(customer_name_snapshot,'') not ilike 'demo customer%'
 and coalesce(original_reference,'') not ilike 'DEMO-%';
$$;
revoke all on function public.paid_sales_day_totals(date) from public,anon,authenticated;
grant execute on function public.paid_sales_day_totals(date) to service_role;
revoke all on function public.pos_order_result(uuid),public.checkout_pos_order(jsonb,uuid,uuid),public.settle_pos_order(uuid,jsonb,uuid,uuid),public.recover_pos_order(uuid,uuid),public.list_unpaid_pos_orders(integer) from public,anon,authenticated;
grant execute on function public.pos_order_result(uuid),public.checkout_pos_order(jsonb,uuid,uuid),public.settle_pos_order(uuid,jsonb,uuid,uuid),public.recover_pos_order(uuid,uuid),public.list_unpaid_pos_orders(integer) to service_role;
