-- VAT-inclusive selling prices: extract VAT without charging it twice.
-- Exact inspected function bodies and their original permissions are preserved.
-- Historical sales, quotes, prices and stock are not rewritten by this migration.
do $vat_patch_0$
declare d text;
begin
 d:=replace(pg_get_functiondef('operations.create_pos_sale_internal(jsonb,uuid)'::regprocedure),chr(13),'');
 if md5(d)='73d04e179f2bebe9120d65ad7c6b4be3' then
   d:=replace(d,$before$ does not match the submitted line items.';
  end if;

  if abs(round((v_raw_subtotal - v_discount_total + v_tax_total), 2) - v_total_amount) > 0.05 then
    raise exception 'Sale t$before$,$after$ does not match the submitted line items.';
  end if;

  if payload->>'priceIncludesVat' = 'true' then
    if v_discount_total < 0 or v_discount_total > v_raw_subtotal
      or abs(v_discount_total - round(v_raw_subtotal * v_discount_percent / 100,2)) > 0.005
      or abs(v_total_amount - (v_raw_subtotal - v_discount_total)) > 0.005
      or abs(v_tax_total - round(v_total_amount * 12 / 112,2)) > 0.005 then
      raise exception using errcode='22023',message='Sale totals are inconsistent. Selling prices already include VAT.';
    end if;
  elsif abs(round((v_raw_subtotal - v_discount_total + v_tax_total),2) - v_total_amount) > 0.05 then
    raise exception 'Sale t$after$);
   if md5(d)<>'4094461b5183865c95b709d8b6064736' then raise exception 'VAT patch verification failed: operations.create_pos_sale_internal(jsonb,uuid)'; end if;
   execute d;
 elsif md5(d)<>'4094461b5183865c95b709d8b6064736' then
   raise exception 'Unexpected function definition: operations.create_pos_sale_internal(jsonb,uuid). Review before applying VAT changes.';
 end if;
end;
$vat_patch_0$;

do $vat_patch_1$
declare d text;
begin
 d:=replace(pg_get_functiondef('public.create_pos_sale(jsonb,uuid)'::regprocedure),chr(13),'');
 if md5(d)='d0a0a759a01ef4711ee795e85a3530c7' then
   d:=replace(d,$before$'pg_catalog', 'operations', 'catalog'
AS $function$
begin
  perform pg_advisory_xact_lock(73841590214631::bigint);
  $before$,$after$'pg_catalog', 'operations', 'catalog'
AS $function$
begin
  if payload->>'priceIncludesVat' is distinct from 'true' then
    raise exception using errcode='22023',message='Refresh POS to use VAT-inclusive prices before submitting a new sale.';
  end if;
  perform pg_advisory_xact_lock(73841590214631::bigint);
  $after$);
   if md5(d)<>'195229331b7f9d48a2df3c3faac1c830' then raise exception 'VAT patch verification failed: public.create_pos_sale(jsonb,uuid)'; end if;
   execute d;
 elsif md5(d)<>'195229331b7f9d48a2df3c3faac1c830' then
   raise exception 'Unexpected function definition: public.create_pos_sale(jsonb,uuid). Review before applying VAT changes.';
 end if;
end;
$vat_patch_1$;

do $vat_patch_2$
declare d text;
begin
 d:=replace(pg_get_functiondef('public.limen_finalize_service_order(uuid,uuid,text,numeric,text,boolean)'::regprocedure),chr(13),'');
 if md5(d)='e6dddf138e11cae6dd49047206d7ff22' then
   d:=replace(d,$before$ash' then round(p_cash_received-v_total,2) else 0 end,
    'discountPercent',0,
    'totals',jsonb_build_object('rawSubtotal',v_total,'discountAmount',0,'tax',0,'total',v_total),
    'items',v_items);
  v_sale_id := public.create_service_order_sale(v_payload,p_actor,v_reference);
  update operations.sales_transactions set pos_payment_reference=case when p_payment_method='check' then btrim(p_payment_reference) end where id=v_sale_id;
  update operations.service_orders set status='completed',payment_status='paid',payment_method=p_payment_method,
    subtotal=v_total,tax_total=0,total_amount=v_total,completed_at=now(),updated_at=now()
  $before$,$after$ash' then round(p_cash_received-v_total,2) else 0 end,
    'priceIncludesVat',true,'discountPercent',0,
    'totals',jsonb_build_object('rawSubtotal',v_total,'discountAmount',0,'tax',round(v_total*12/112,2),'total',v_total),
    'items',v_items);
  v_sale_id := public.create_service_order_sale(v_payload,p_actor,v_reference);
  update operations.sales_transactions set pos_payment_reference=case when p_payment_method='check' then btrim(p_payment_reference) end where id=v_sale_id;
  update operations.service_orders set status='completed',payment_status='paid',payment_method=p_payment_method,
    subtotal=v_total,tax_total=round(v_total*12/112,2),total_amount=v_total,completed_at=now(),updated_at=now()
  $after$);
   if md5(d)<>'0f90b4c8ef844080f76ee001a0602bda' then raise exception 'VAT patch verification failed: public.limen_finalize_service_order(uuid,uuid,text,numeric,text,boolean)'; end if;
   execute d;
 elsif md5(d)<>'0f90b4c8ef844080f76ee001a0602bda' then
   raise exception 'Unexpected function definition: public.limen_finalize_service_order(uuid,uuid,text,numeric,text,boolean). Review before applying VAT changes.';
 end if;
end;
$vat_patch_2$;

do $vat_patch_3$
declare d text;
begin
 d:=replace(pg_get_functiondef('public.quote_pos_context(uuid)'::regprocedure),chr(13),'');
 if md5(d)='9e815bd447d52b89edc9bcad6239f8b2' then
   d:=replace(d,$before$e.subtotal,e.discount_total,e.tax_total,e.grand_total)<0 or abs(e.subtotal-e.discount_total+e.tax_total-e.grand_total)>0.05
     or (abs(line_sum-e.subtotal)>0.05 and abs(line_sum-(e.$before$,$after$e.subtotal,e.discount_total,e.tax_total,e.grand_total)<0 or (abs(e.subtotal-e.discount_total+e.tax_total-e.grand_total)>0.05
       and (abs(e.subtotal-e.discount_total-e.grand_total)>0.005
            or abs(e.tax_total-round(e.grand_total*12/112,2))>0.005))
     or (abs(line_sum-e.subtotal)>0.05 and abs(line_sum-(e.$after$);
   if md5(d)<>'fa327d9e6c344a3baf94c7865f80e18e' then raise exception 'VAT patch verification failed: public.quote_pos_context(uuid)'; end if;
   execute d;
 elsif md5(d)<>'fa327d9e6c344a3baf94c7865f80e18e' then
   raise exception 'Unexpected function definition: public.quote_pos_context(uuid). Review before applying VAT changes.';
 end if;
end;
$vat_patch_3$;

do $vat_patch_4$
declare d text;
begin
 d:=replace(pg_get_functiondef('app.create_estimate_internal(jsonb)'::regprocedure),chr(13),'');
 if md5(d)='b96c2b180cc09d51e2743eb7984c0376' then
   d:=replace(d,$before$ -> 'vehicle' ->> 'plate_no', ''))), '');
begin
  if payload ? 'customer' and coalesce(payload -> 'customer$before$,$after$ -> 'vehicle' ->> 'plate_no', ''))), '');
begin
  if payload#>>'{estimate,price_includes_vat}' is distinct from 'true' then
    raise exception using errcode='22023',message='Refresh the quotation page to use VAT-inclusive selling prices.';
  end if;
  if payload ? 'customer' and coalesce(payload -> 'customer$after$);
   if md5(d)<>'632d2bbab53f934fadc4b32f5f02b1eb' then raise exception 'VAT patch verification failed: app.create_estimate_internal(jsonb)'; end if;
   execute d;
 elsif md5(d)<>'632d2bbab53f934fadc4b32f5f02b1eb' then
   raise exception 'Unexpected function definition: app.create_estimate_internal(jsonb). Review before applying VAT changes.';
 end if;
end;
$vat_patch_4$;

