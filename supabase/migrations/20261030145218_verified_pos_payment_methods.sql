alter table operations.sales_transactions add column pos_payment_reference text;

-- Staff attestation is not bank/gateway verification. No funds are moved here.
create function public.assert_recorded_pos_payment(payload jsonb,p_total numeric) returns void
language plpgsql security invoker set search_path='' as $fn$
declare method text:=coalesce(payload->>'paymentMethod','cash'); cash numeric;
 amount numeric; ref text:=btrim(coalesce(payload->>'paymentReference',''));
begin
 if p_total is null or p_total<0 or p_total::text in ('NaN','Infinity','-Infinity') then
  raise exception using errcode='22023',message='The saved payment total could not be confirmed.';
 end if;
 if method not in ('cash','gcash','bank_transfer','to_follow') then
  raise exception using errcode='22023',message='Choose a supported payment method.';
 end if;
 cash:=coalesce((payload->>'cashReceived')::numeric,0);
 amount:=coalesce((payload->>'paidAmount')::numeric,0);
 if cash<0 or cash>1000000000 or amount<0 or amount>1000000000
   or cash::text in ('NaN','Infinity','-Infinity') or amount::text in ('NaN','Infinity','-Infinity') then
  raise exception using errcode='22023',message='Enter a valid payment amount.';
 end if;
 if method='to_follow' then
  if cash<>0 or amount<>0 or ref<>'' then
   raise exception using errcode='22023',message='An unpaid release cannot record a received payment.';
  end if;
  return;
 end if;
 if payload->>'paymentVerified' is distinct from 'true' then
  raise exception using errcode='22023',message='Confirm that the full payment has actually been received.';
 end if;
 if method='cash' then
  if round(cash,2)<round(p_total,2) then raise exception using errcode='22023',message='Enter enough cash for the full amount due.'; end if;
 else
  if round(p_total,2)<=0 or round(amount,2)<>round(p_total,2) or cash<>0 or coalesce((payload->>'changeDue')::numeric,0)<>0 or ref='' or length(ref)>120 then
   raise exception using errcode='22023',message='Enter the full received amount and transaction reference after checking the GCash or bank account.';
  end if;
 end if;
end;
$fn$;
revoke all on function public.assert_recorded_pos_payment(jsonb,numeric) from public,anon,authenticated;
grant execute on function public.assert_recorded_pos_payment(jsonb,numeric) to service_role;

CREATE OR REPLACE FUNCTION public.checkout_pos_order(payload jsonb, p_actor uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 if method is null or method not in ('cash','gcash','bank_transfer','to_follow') or length(coalesce(payload->>'note',''))>1000
     or length(coalesce(payload->>'customerName',''))>200 then
   raise exception using errcode='22023',message='Choose a supported payment method and keep the note within 1000 characters.';
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
 if method='to_follow' and round(coalesce((payload->'totals'->>'total')::numeric,0),2)<=0 then
   raise exception using errcode='22023',message='A payment-to-follow order must have a positive balance.';
 end if;
 perform public.assert_recorded_pos_payment(payload,(payload->'totals'->>'total')::numeric);
 sale_id:=public.create_pos_sale(payload,p_actor);
 update operations.sales_transactions set pos_note=nullif(btrim(payload->>'note'),''),pos_issued_at=created_at,
   pos_paid_at=case when method<>'to_follow' then now() else null end,
pos_payment_reference=case when method in ('gcash','bank_transfer') then btrim(payload->>'paymentReference') end,
   cash_received=case when method='cash' then cash_received else null end where id=sale_id;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'checkout',payload,sale_id);
 return public.pos_order_result(sale_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.checkout_quote_pos_order(p_estimate uuid, p_version text, payment jsonb, p_actor uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare prior operations.pos_checkout_requests%rowtype; e operations.estimates%rowtype; ctx jsonb; sale uuid; ref text;
 day date:=(now() at time zone 'Asia/Manila')::date; method text:=payment->>'paymentMethod'; cash numeric;
 canonical jsonb:=jsonb_build_object('estimateId',p_estimate,'version',p_version,'payment',payment);
begin
 if not exists(select 1 from core.user_profiles where user_id=p_actor and role='admin') then raise exception using errcode='42501',message='An administrator is required for quotation checkout.'; end if;
 if p_request is null or p_estimate is null or p_version is null or jsonb_typeof(payment) is distinct from 'object' then raise exception using errcode='22023',message='Choose a saved quotation and checkout reference.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pos-request:'||p_actor||':'||p_request,0));
 select * into prior from operations.pos_checkout_requests where actor_id=p_actor and request_id=p_request;
 if found then
   if prior.operation<>'quote_checkout' or prior.payload is distinct from canonical then raise exception using errcode='PT409',message='This checkout reference already belongs to a saved operation. Check its saved result.'; end if;
   return public.pos_order_result(prior.sale_id);
 end if;
 perform pg_advisory_xact_lock(73841590214631::bigint);
 select * into e from operations.estimates where id=p_estimate for update;
 if not found then raise exception using errcode='22023',message='The saved quotation could not be found.'; end if;
 if public.quote_pos_version(p_estimate) is distinct from p_version then raise exception using errcode='PT409',message='This quotation changed. Reload and review its saved terms before checkout.'; end if;
 perform 1 from catalog.inventory_balances b where b.product_id in(select product_id from operations.estimate_items where estimate_id=p_estimate and line_type='product') order by b.product_id for update;
 ctx:=public.quote_pos_context(p_estimate);
 if not coalesce((ctx->>'ready')::boolean,false) then raise exception using errcode='PT409',message=coalesce(ctx->>'reason','Review this quotation before checkout.'); end if;
 cash:=round(coalesce((payment->>'cashReceived')::numeric,0),2);
 if method is null or method not in ('cash','gcash','bank_transfer','to_follow') or length(coalesce(payment->>'note',''))>1000 or cash::text in ('NaN','Infinity','-Infinity') or cash<0 or cash>1000000000 then raise exception using errcode='22023',message='Review the payment method, cash and note.'; end if;
 if method='cash' and (payment->>'paymentVerified' is distinct from 'true' or cash<e.grand_total) then raise exception using errcode='22023',message='Confirm the cash was received and enter enough for the quotation total.'; end if;
 if method='to_follow' and (cash<>0 or e.grand_total<=0 or payment->>'releaseConfirmed' is distinct from 'true' or nullif(btrim(payment->>'note'),'') is null) then raise exception using errcode='22023',message='Add a note and confirm the unpaid order is being released now.'; end if;
 perform public.assert_recorded_pos_payment(payment,e.grand_total);
 ref:=operations.generate_document_number('SALE');
 insert into operations.sales_transactions(transaction_number,estimate_id,customer_id,processed_by,payment_method,status,subtotal,discount_total,tax_total,total_amount,
   business_date,cash_received,change_due,customer_name_snapshot,cashier_name_snapshot,sale_at,source_type,inventory_applied,pos_note,pos_issued_at,pos_paid_at)
 values(ref,e.id,e.customer_id,p_actor,method,case when method='to_follow' then 'pending' else 'completed' end,e.subtotal,e.discount_total,e.tax_total,e.grand_total,
   day,case when method='cash' then cash end,case when method='cash' then cash-e.grand_total else 0 end,ctx->>'customerName',(select full_name from core.user_profiles where user_id=p_actor),
   now(),'estimate_conversion',true,nullif(btrim(payment->>'note'),''),now(),case when method<>'to_follow' then now() end) returning id into sale;
 insert into operations.sales_transaction_items(transaction_id,line_type,product_id,service_id,quantity,unit_price,line_total,estimate_item_id,business_date,item_name_snapshot,item_sku_snapshot)
 select sale,i.line_type,i.product_id,i.service_id,i.quantity,i.unit_price,i.line_total,i.id,day,
   coalesce(i.product_name_snapshot,i.service_name_snapshot,p.name,s.name,'Saved item'),coalesce(i.product_sku_snapshot,i.service_code_snapshot,p.sku,s.code,'')
 from operations.estimate_items i left join catalog.products p on p.id=i.product_id left join operations.services s on s.id=i.service_id where i.estimate_id=p_estimate;
 insert into catalog.inventory_movements(product_id,movement_type,quantity,reference_type,reference_id,notes,performed_by,business_date)
 select product_id,'sale',-quantity,'sales_transaction',sale,'Saved quotation POS order '||ref,p_actor,day from operations.sales_transaction_items where transaction_id=sale and product_id is not null;
 update catalog.inventory_balances b set on_hand=b.on_hand-q.quantity,as_of_date=day,business_date=day,updated_at=now()
 from(select product_id,sum(quantity) quantity from operations.sales_transaction_items where transaction_id=sale and product_id is not null group by product_id) q where b.product_id=q.product_id;
 update operations.sales_transactions set pos_payment_reference=case when method in ('gcash','bank_transfer') then btrim(payment->>'paymentReference') end where id=sale;
 update operations.estimates set status='converted_sale' where id=p_estimate;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'quote_checkout',canonical,sale);
 return public.pos_order_result(sale);
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_pos_order(p_sale_id uuid, payload jsonb, p_actor uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare prior operations.pos_checkout_requests%rowtype; sale operations.sales_transactions%rowtype;
 cash numeric; method text:=coalesce(payload->>'paymentMethod','cash'); posted timestamptz:=now(); day date:=(now() at time zone 'Asia/Manila')::date;
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
 if not found or sale.source_type not in ('pos','estimate_conversion') or sale.pos_issued_at is null then
   raise exception using errcode='22023',message='Choose a POS payment-to-follow order.';
 end if;
 if sale.status<>'pending' or sale.payment_method<>'to_follow' or not sale.inventory_applied then
   raise exception using errcode='PT409',message='This order is no longer unpaid. Refresh it before collecting money.';
 end if;
 if method not in ('cash','gcash','bank_transfer') then raise exception using errcode='22023',message='Choose a received payment method.'; end if;
 perform public.assert_recorded_pos_payment(payload,sale.total_amount);
 cash:=round(coalesce((payload->>'cashReceived')::numeric,0),2);
 if method='cash' and (coalesce(payload->>'paymentVerified','false')<>'true' or cash is null or cash<sale.total_amount
     or cash::text in ('NaN','Infinity','-Infinity')) then
   raise exception using errcode='22023',message='Confirm the cash was received and enter enough for the full balance.';
 end if;
 -- Payment-date recognition; original issuance and inventory movement dates remain intact.
 update operations.sales_transactions set status='completed',payment_method=method,cash_received=case when method='cash' then cash else null end,
   change_due=case when method='cash' then round(cash-total_amount,2) else 0 end,
   pos_payment_reference=case when method in ('gcash','bank_transfer') then btrim(payload->>'paymentReference') end,pos_paid_at=posted,sale_at=posted,business_date=day,updated_by=p_actor where id=p_sale_id;
 update operations.sales_transaction_items set business_date=day where transaction_id=p_sale_id;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'settlement',payload,p_sale_id);
 -- No inventory function, balance update or movement insert is performed during settlement.
 return public.pos_order_result(p_sale_id);
end;
$function$;
do $patch$ declare d text; old text; begin
 d:=pg_get_functiondef('public.get_sale_detail(uuid)'::regprocedure);
 old:='st.pos_note, st.pos_issued_at, st.pos_paid_at,';
 if strpos(d,old)=0 then raise exception 'Receipt payment header changed'; end if;
 d:=replace(d,old,'st.pos_note, st.pos_issued_at, st.pos_paid_at, st.pos_payment_reference,');
 old:='''paidAt'', sh.pos_paid_at,';
 if (length(d)-length(replace(d,old,'')))/length(old)<>2 then raise exception 'Receipt payment response changed'; end if;
 execute replace(d,old,old||' ''paymentReference'',sh.pos_payment_reference,');
 d:=pg_get_functiondef('public.quote_pos_context(uuid)'::regprocedure);
 old:='i.quantity<=0 or i.unit_price<0 or i.line_total<0';
 if strpos(d,old)=0 then raise exception 'Saved quote amount guard changed'; end if;
 execute replace(d,old,old||' or i.quantity::text in (''NaN'',''Infinity'',''-Infinity'') or i.unit_price::text in (''NaN'',''Infinity'',''-Infinity'') or i.line_total::text in (''NaN'',''Infinity'',''-Infinity'')');
end; $patch$;
