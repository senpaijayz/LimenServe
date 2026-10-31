-- Cash and Check are the current received-payment methods.
-- Version aligned to the applied LimenServe Supabase migration ledger.
-- Retain prior payment descriptions for historical records; never rewrite sales.
-- Only method guards/reference display data change. Locks, pricing and stock posting stay intact.
do $patch$
declare spec record; d text; before_patch text;
begin
 for spec in select * from (values
   ('public.assert_recorded_pos_payment(jsonb,numeric)','3f104845a644eae3a649daae79c48d13',false),
   ('public.checkout_pos_order(jsonb,uuid,uuid)','d2211ef25c7f3504b8fbba7bc7f45ce1',false),
   ('public.checkout_quote_pos_order(uuid,text,jsonb,uuid,uuid)','1a9c9db92cfcf69710f397e04f0f7a2e',false),
   ('public.settle_pos_order(uuid,jsonb,uuid,uuid)','002528df32a38af660dece8786099f9a',false),
   ('operations.create_pos_sale_internal(jsonb,uuid)','b6df18413cb8e116cae2199c19fa9031',false),
   ('app.create_pos_sale_internal(jsonb,uuid)','dd065ddedb9b3cc11b323afa8524c0cd',false),
   ('public.limen_finalize_service_order(uuid,uuid,text,numeric,text,boolean)','dafad7c03af895f1816d7e8831740f9b',false),
   ('operations.create_historical_sale_internal(jsonb,uuid)','5f590496b9ef7d49d60d3603514a8674',true),
   ('operations.update_historical_sale_internal(uuid,jsonb,uuid)','fb1e9d73b67aedeb4799b7bff3eecc11',true),
   ('operations.create_historical_sales_aggregate_internal(jsonb,uuid)','c9a270462f3a571925c361c2f353c70b',true),
   ('operations.update_historical_sales_aggregate_internal(uuid,jsonb,uuid)','4d46b9a6773676fd1ab405774f1a78b0',true)
 ) as changes(signature,expected_hash,keep_historical_methods)
 loop
  d:=pg_get_functiondef(spec.signature::regprocedure);
  if md5(d)<>spec.expected_hash then
   raise exception 'Payment function changed; review % before applying.',spec.signature;
  end if;
  before_patch:=d;
  if spec.keep_historical_methods then
   d:=replace(d,$old$('cash', 'gcash', 'bank_transfer'$old$,$new$('cash', 'check', 'gcash', 'bank_transfer'$new$);
  elsif spec.signature like 'public.limen_finalize_service_order(%' then
   d:=replace(d,$old$if p_payment_method not in ('cash','gcash','bank_transfer') then$old$,$new$if p_payment_method is null or p_payment_method not in ('cash','check') then$new$);
   d:=replace(d,'Choose Cash, GCash, or Bank Transfer.','Choose Cash or Check.');
   d:=replace(d,$old$if p_payment_method <> 'cash' and nullif(btrim(coalesce(p_payment_reference,'')),'') is null then$old$,$new$if p_payment_method='check' and (nullif(btrim(coalesce(p_payment_reference,'')),'') is null or length(btrim(p_payment_reference))>120) then$new$);
   d:=replace(d,'Enter the verified payment reference.','Enter the cleared check number (up to 120 characters).');
   d:=replace(d,$old$  v_sale_id := public.create_service_order_sale(v_payload,p_actor,v_reference);$old$,$new$  v_sale_id := public.create_service_order_sale(v_payload,p_actor,v_reference);
  update operations.sales_transactions set pos_payment_reference=case when p_payment_method='check' then btrim(p_payment_reference) end where id=v_sale_id;$new$);
  else
   d:=replace(d,$old$('cash','gcash','bank_transfer','to_follow')$old$,$new$('cash','check','to_follow')$new$);
   d:=replace(d,$old$('cash','gcash','bank_transfer')$old$,$new$('cash','check')$new$);
   d:=replace(d,$old$('cash', 'gcash', 'bank_transfer', 'to_follow')$old$,$new$('cash', 'check', 'to_follow')$new$);
   d:=replace(d,$old$('cash', 'gcash', 'bank_transfer')$old$,$new$('cash', 'check')$new$);
   d:=replace(d,$old$method in ('gcash','bank_transfer')$old$,$new$method='check'$new$);
   d:=replace(d,'Enter the full received amount and transaction reference after checking the GCash or bank account.','Enter the full cleared amount and check number after confirming the funds have reached the shop account.');
  end if;
  if d=before_patch or (not spec.keep_historical_methods and (strpos(d,'gcash')>0 or strpos(d,'bank_transfer')>0)) then
   raise exception 'Cash/check replacement was incomplete for %.',spec.signature;
  end if;
  execute d;
 end loop;
end; $patch$;

-- This historical-only constraint continues to allow truthful old records.
alter table operations.historical_sales_aggregates drop constraint historical_sales_aggregates_payment_method_check;
alter table operations.historical_sales_aggregates add constraint historical_sales_aggregates_payment_method_check
 check(payment_method in ('cash','check','gcash','bank_transfer','mixed','unknown'));
