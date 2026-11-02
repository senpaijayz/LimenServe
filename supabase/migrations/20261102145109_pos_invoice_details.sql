-- Optional invoice fields are a per-sale snapshot, never a customer master overwrite.
alter table operations.sales_transactions add column invoice_details jsonb not null default '{}'::jsonb;
create function operations.normalize_invoice_details(value jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $fn$
declare k text; v jsonb; limit_chars integer; result jsonb:='{}';
begin
 if value is null then return result; end if;
 if jsonb_typeof(value) is distinct from 'object' then raise exception using errcode='22023',message='Review the additional invoice details.'; end if;
 for k,v in select * from jsonb_each(value) loop
  limit_chars:=case k when 'customerAddress' then 300 when 'customerTin' then 40 when 'businessStyle' then 120 when 'terms' then 120 when 'poNumber' then 80 when 'oscaPwdId' then 80 when 'customerContact' then 80 when 'receivedBy' then 120 else null end;
  if limit_chars is null or jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>limit_chars then raise exception using errcode='22023',message='Review the additional invoice details and field lengths.'; end if;
  if btrim(v#>>'{}')<>'' then result:=result||jsonb_build_object(k,btrim(v#>>'{}')); end if;
 end loop;
 return result;
end;
$fn$;
revoke all on function operations.normalize_invoice_details(jsonb) from public,anon,authenticated;
grant execute on function operations.normalize_invoice_details(jsonb) to service_role;
alter table operations.sales_transactions add constraint sales_invoice_details_valid check(invoice_details=operations.normalize_invoice_details(invoice_details));

do $patch$
declare d text;
begin
 d:=replace(pg_get_functiondef('get_sale_detail(uuid)'::regprocedure),chr(13),'');
 if d is distinct from $original$CREATE OR REPLACE FUNCTION public.get_sale_detail(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'core', 'catalog', 'operations'
AS $function$
  with sale_header as (
    select
      st.id,
      st.transaction_number,
      st.estimate_id,
      (select estimate_number from operations.estimates where id=st.estimate_id) as quotation_number,
      st.customer_id,
      st.processed_by,
      st.payment_method,
      st.status,
      st.pos_note, st.pos_issued_at, st.pos_paid_at, st.pos_payment_reference,
      st.subtotal,
      st.discount_total,
      st.tax_total,
      st.total_amount,
      st.cash_received,
      st.change_due,
      st.customer_name_snapshot,
      st.cashier_name_snapshot,
      st.business_date,
      st.sale_at,
      st.source_type,
      st.original_reference,
      st.inventory_applied,
      st.encoded_by,
      st.updated_by,
      st.created_at,
      st.updated_at,
      coalesce(c.name, st.customer_name_snapshot, 'Walk-in Customer') as customer_name,
      coalesce(st.cashier_name_snapshot, processed_profile.full_name, encoded_profile.full_name, 'Unknown Cashier') as cashier_name,
      encoded_profile.full_name as encoded_by_name,
      updated_profile.full_name as updated_by_name
    from operations.sales_transactions st
    left join operations.customers c on c.id = st.customer_id
    left join core.user_profiles processed_profile on processed_profile.user_id = st.processed_by
    left join core.user_profiles encoded_profile on encoded_profile.user_id = st.encoded_by
    left join core.user_profiles updated_profile on updated_profile.user_id = st.updated_by
    where st.id = p_sale_id
  ),
  sale_items as (
    select
      sti.id,
      sti.line_type,
      sti.product_id,
      sti.service_id,
      sti.quantity,
      sti.unit_price,
      sti.line_total,
      sti.estimate_item_id,
      sti.business_date,
      sti.created_at,
      coalesce(sti.item_name_snapshot, p.name, s.name, 'Unnamed Item') as item_name,
      coalesce(sti.item_sku_snapshot, p.sku, s.code, case when sti.line_type = 'service' then 'SERVICE' else null end) as item_sku
    from operations.sales_transaction_items sti
    left join catalog.products p on p.id = sti.product_id
    left join operations.services s on s.id = sti.service_id
    where sti.transaction_id = p_sale_id
    order by sti.created_at, sti.id
  )
  select
    case
      when exists (select 1 from sale_header) then jsonb_build_object(
        'sale',
        (
          select jsonb_build_object(
            'id', sh.id,
            'transactionNumber', sh.transaction_number,
            'quotationNumber',sh.quotation_number,
            'estimateId', sh.estimate_id,
            'customerId', sh.customer_id,
            'processedBy', sh.processed_by,
            'customerName', sh.customer_name,
            'cashierName', sh.cashier_name,
            'cashierNameSnapshot', sh.cashier_name_snapshot,
            'paymentMethod', sh.payment_method,
            'status', sh.status,
            'note', sh.pos_note, 'issuedAt', sh.pos_issued_at, 'paidAt', sh.pos_paid_at, 'paymentReference',sh.pos_payment_reference,
            'subtotal', sh.subtotal,
            'discountTotal', sh.discount_total,
            'taxTotal', sh.tax_total,
            'totalAmount', sh.total_amount,
            'cashReceived', sh.cash_received,
            'changeDue', sh.change_due,
            'businessDate', sh.business_date,
            'saleAt', sh.sale_at,
            'sourceType', sh.source_type,
            'originalReference', sh.original_reference,
            'inventoryApplied', sh.inventory_applied,
            'encodedBy', sh.encoded_by,
            'encodedByName', sh.encoded_by_name,
            'updatedBy', sh.updated_by,
            'updatedByName', sh.updated_by_name,
            'createdAt', sh.created_at,
            'updatedAt', sh.updated_at
          )
          from sale_header sh
        ),
        'items',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', si.id,
                'lineType', si.line_type,
                'productId', si.product_id,
                'serviceId', si.service_id,
                'quantity', si.quantity,
                'unitPrice', si.unit_price,
                'lineTotal', si.line_total,
                'itemName', si.item_name,
                'itemSku', si.item_sku,
                'estimateItemId', si.estimate_item_id,
                'createdAt', si.created_at
              )
              order by si.created_at, si.id
            )
            from sale_items si
          ),
          '[]'::jsonb
        ),
        'receipt',
        (
          select jsonb_build_object(
            'transactionNumber', sh.transaction_number,
            'quotationNumber',sh.quotation_number,
            'customerName', sh.customer_name,
            'cashierName', sh.cashier_name,
            'paymentMethod', sh.payment_method,
            'status', sh.status,
            'note', sh.pos_note, 'issuedAt', sh.pos_issued_at, 'paidAt', sh.pos_paid_at, 'paymentReference',sh.pos_payment_reference,
            'subtotal', sh.subtotal,
            'discountTotal', sh.discount_total,
            'taxTotal', sh.tax_total,
            'totalAmount', sh.total_amount,
            'cashReceived', sh.cash_received,
            'changeDue', sh.change_due,
            'businessDate', sh.business_date,
            'saleAt', sh.sale_at,
            'sourceType', sh.source_type,
            'originalReference', sh.original_reference,
            'inventoryApplied', sh.inventory_applied,
            'createdAt', sh.created_at,
            'items',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', si.id,
                    'lineType', si.line_type,
                    'itemName', si.item_name,
                    'itemSku', si.item_sku,
                    'quantity', si.quantity,
                    'unitPrice', si.unit_price,
                    'lineTotal', si.line_total
                  )
                  order by si.created_at, si.id
                )
                from sale_items si
              ),
              '[]'::jsonb
            )
          )
          from sale_header sh
        )
      )
      else null
    end;
$function$
$original$ then raise exception 'Invoice function changed; inspect get_sale_detail(uuid) before applying.'; end if;
 execute $updated$CREATE OR REPLACE FUNCTION public.get_sale_detail(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'core', 'catalog', 'operations'
AS $function$
  with sale_header as (
    select
      st.id,
      st.transaction_number,
      st.estimate_id,
      (select estimate_number from operations.estimates where id=st.estimate_id) as quotation_number,
      st.customer_id,
      st.processed_by,
      st.payment_method,
      st.status,
      st.invoice_details, st.pos_note, st.pos_issued_at, st.pos_paid_at, st.pos_payment_reference,
      st.subtotal,
      st.discount_total,
      st.tax_total,
      st.total_amount,
      st.cash_received,
      st.change_due,
      st.customer_name_snapshot,
      st.cashier_name_snapshot,
      st.business_date,
      st.sale_at,
      st.source_type,
      st.original_reference,
      st.inventory_applied,
      st.encoded_by,
      st.updated_by,
      st.created_at,
      st.updated_at,
      coalesce(c.name, st.customer_name_snapshot, 'Walk-in Customer') as customer_name,
      coalesce(st.cashier_name_snapshot, processed_profile.full_name, encoded_profile.full_name, 'Unknown Cashier') as cashier_name,
      encoded_profile.full_name as encoded_by_name,
      updated_profile.full_name as updated_by_name
    from operations.sales_transactions st
    left join operations.customers c on c.id = st.customer_id
    left join core.user_profiles processed_profile on processed_profile.user_id = st.processed_by
    left join core.user_profiles encoded_profile on encoded_profile.user_id = st.encoded_by
    left join core.user_profiles updated_profile on updated_profile.user_id = st.updated_by
    where st.id = p_sale_id
  ),
  sale_items as (
    select
      sti.id,
      sti.line_type,
      sti.product_id,
      sti.service_id,
      sti.quantity,
      sti.unit_price,
      sti.line_total,
      sti.estimate_item_id,
      sti.business_date,
      sti.created_at,
      coalesce(sti.item_name_snapshot, p.name, s.name, 'Unnamed Item') as item_name,
      coalesce(sti.item_sku_snapshot, p.sku, s.code, case when sti.line_type = 'service' then 'SERVICE' else null end) as item_sku
    from operations.sales_transaction_items sti
    left join catalog.products p on p.id = sti.product_id
    left join operations.services s on s.id = sti.service_id
    where sti.transaction_id = p_sale_id
    order by sti.created_at, sti.id
  )
  select
    case
      when exists (select 1 from sale_header) then jsonb_build_object(
        'sale',
        (
          select jsonb_build_object(
            'id', sh.id,
            'transactionNumber', sh.transaction_number,
            'quotationNumber',sh.quotation_number,
            'estimateId', sh.estimate_id,
            'customerId', sh.customer_id,
            'processedBy', sh.processed_by,
            'customerName', sh.customer_name,
            'cashierName', sh.cashier_name,
            'cashierNameSnapshot', sh.cashier_name_snapshot,
            'paymentMethod', sh.payment_method,
            'status', sh.status,
            'invoiceDetails',sh.invoice_details, 'note', sh.pos_note, 'issuedAt', sh.pos_issued_at, 'paidAt', sh.pos_paid_at, 'paymentReference',sh.pos_payment_reference,
            'subtotal', sh.subtotal,
            'discountTotal', sh.discount_total,
            'taxTotal', sh.tax_total,
            'totalAmount', sh.total_amount,
            'cashReceived', sh.cash_received,
            'changeDue', sh.change_due,
            'businessDate', sh.business_date,
            'saleAt', sh.sale_at,
            'sourceType', sh.source_type,
            'originalReference', sh.original_reference,
            'inventoryApplied', sh.inventory_applied,
            'encodedBy', sh.encoded_by,
            'encodedByName', sh.encoded_by_name,
            'updatedBy', sh.updated_by,
            'updatedByName', sh.updated_by_name,
            'createdAt', sh.created_at,
            'updatedAt', sh.updated_at
          )
          from sale_header sh
        ),
        'items',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', si.id,
                'lineType', si.line_type,
                'productId', si.product_id,
                'serviceId', si.service_id,
                'quantity', si.quantity,
                'unitPrice', si.unit_price,
                'lineTotal', si.line_total,
                'itemName', si.item_name,
                'itemSku', si.item_sku,
                'estimateItemId', si.estimate_item_id,
                'createdAt', si.created_at
              )
              order by si.created_at, si.id
            )
            from sale_items si
          ),
          '[]'::jsonb
        ),
        'receipt',
        (
          select jsonb_build_object(
            'transactionNumber', sh.transaction_number,
            'quotationNumber',sh.quotation_number,
            'customerName', sh.customer_name,
            'cashierName', sh.cashier_name,
            'paymentMethod', sh.payment_method,
            'status', sh.status,
            'invoiceDetails',sh.invoice_details, 'note', sh.pos_note, 'issuedAt', sh.pos_issued_at, 'paidAt', sh.pos_paid_at, 'paymentReference',sh.pos_payment_reference,
            'subtotal', sh.subtotal,
            'discountTotal', sh.discount_total,
            'taxTotal', sh.tax_total,
            'totalAmount', sh.total_amount,
            'cashReceived', sh.cash_received,
            'changeDue', sh.change_due,
            'businessDate', sh.business_date,
            'saleAt', sh.sale_at,
            'sourceType', sh.source_type,
            'originalReference', sh.original_reference,
            'inventoryApplied', sh.inventory_applied,
            'createdAt', sh.created_at,
            'items',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', si.id,
                    'lineType', si.line_type,
                    'itemName', si.item_name,
                    'itemSku', si.item_sku,
                    'quantity', si.quantity,
                    'unitPrice', si.unit_price,
                    'lineTotal', si.line_total
                  )
                  order by si.created_at, si.id
                )
                from sale_items si
              ),
              '[]'::jsonb
            )
          )
          from sale_header sh
        )
      )
      else null
    end;
$function$
$updated$;
end;
$patch$;

do $patch$
declare d text;
begin
 d:=replace(pg_get_functiondef('checkout_pos_order(jsonb,uuid,uuid)'::regprocedure),chr(13),'');
 if d is distinct from $original$CREATE OR REPLACE FUNCTION public.checkout_pos_order(payload jsonb, p_actor uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare prior operations.pos_checkout_requests%rowtype; sale_id uuid; method text:=payload->>'paymentMethod';
 field text; value numeric; line jsonb; disc numeric;
 v_saved_customer uuid; v_saved_name text; sale_payload jsonb:=payload;
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
 v_saved_customer:=nullif(payload->>'customerId','')::uuid;
 if v_saved_customer is not null then
   -- Same financial lock order as the retained stock/price constructor.
   perform pg_advisory_xact_lock(73841590214631::bigint);
   select c.name into v_saved_name from operations.customers c where c.id=v_saved_customer for key share;
   if not found or nullif(btrim(v_saved_name),'') is null then
     raise exception using errcode='22023',message='The saved customer is unavailable. Choose the customer again before checkout.';
   end if;
   sale_payload:=payload||jsonb_build_object('customerName',v_saved_name);
 end if;
 if method is null or method not in ('cash','check','to_follow') or length(coalesce(payload->>'note',''))>1000
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
   or payload->>'priceIncludesVat' is distinct from 'true'
   or abs(round(((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric)*12/112,2)-(payload->'totals'->>'tax')::numeric)>0.005
   or abs(round((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric,2)-(payload->'totals'->>'total')::numeric)>0.005 then
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
 sale_id:=public.create_pos_sale(sale_payload,p_actor);
 update operations.sales_transactions set customer_id=v_saved_customer,pos_note=nullif(btrim(payload->>'note'),''),pos_issued_at=created_at,
   pos_paid_at=case when method<>'to_follow' then now() else null end,
pos_payment_reference=case when method='check' then btrim(payload->>'paymentReference') end,
   cash_received=case when method='cash' then cash_received else null end where id=sale_id;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'checkout',payload,sale_id);
 return public.pos_order_result(sale_id);
end;
$function$
$original$ then raise exception 'Invoice function changed; inspect checkout_pos_order(jsonb,uuid,uuid) before applying.'; end if;
 execute $updated$CREATE OR REPLACE FUNCTION public.checkout_pos_order(payload jsonb, p_actor uuid, p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare prior operations.pos_checkout_requests%rowtype; sale_id uuid; method text:=payload->>'paymentMethod';
 field text; value numeric; line jsonb; disc numeric;
 v_saved_customer uuid; v_saved_name text; sale_payload jsonb:=payload;
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
 v_saved_customer:=nullif(payload->>'customerId','')::uuid;
 if v_saved_customer is not null then
   -- Same financial lock order as the retained stock/price constructor.
   perform pg_advisory_xact_lock(73841590214631::bigint);
   select c.name into v_saved_name from operations.customers c where c.id=v_saved_customer for key share;
   if not found or nullif(btrim(v_saved_name),'') is null then
     raise exception using errcode='22023',message='The saved customer is unavailable. Choose the customer again before checkout.';
   end if;
   sale_payload:=payload||jsonb_build_object('customerName',v_saved_name);
 end if;
 if method is null or method not in ('cash','check','to_follow') or length(coalesce(payload->>'note',''))>1000
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
   or payload->>'priceIncludesVat' is distinct from 'true'
   or abs(round(((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric)*12/112,2)-(payload->'totals'->>'tax')::numeric)>0.005
   or abs(round((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric,2)-(payload->'totals'->>'total')::numeric)>0.005 then
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
 sale_id:=public.create_pos_sale(sale_payload,p_actor);
 update operations.sales_transactions set invoice_details=operations.normalize_invoice_details(payload->'invoiceDetails'),customer_id=v_saved_customer,pos_note=nullif(btrim(payload->>'note'),''),pos_issued_at=created_at,
   pos_paid_at=case when method<>'to_follow' then now() else null end,
pos_payment_reference=case when method='check' then btrim(payload->>'paymentReference') end,
   cash_received=case when method='cash' then cash_received else null end where id=sale_id;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'checkout',payload,sale_id);
 return public.pos_order_result(sale_id);
end;
$function$
$updated$;
end;
$patch$;

do $patch$
declare d text;
begin
 d:=replace(pg_get_functiondef('checkout_quote_pos_order(uuid,text,jsonb,uuid,uuid)'::regprocedure),chr(13),'');
 if d is distinct from $original$CREATE OR REPLACE FUNCTION public.checkout_quote_pos_order(p_estimate uuid, p_version text, payment jsonb, p_actor uuid, p_request uuid)
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
 if method is null or method not in ('cash','check','to_follow') or length(coalesce(payment->>'note',''))>1000 or cash::text in ('NaN','Infinity','-Infinity') or cash<0 or cash>1000000000 then raise exception using errcode='22023',message='Review the payment method, cash and note.'; end if;
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
 update operations.sales_transactions set pos_payment_reference=case when method='check' then btrim(payment->>'paymentReference') end where id=sale;
 update operations.estimates set status='converted_sale' where id=p_estimate;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'quote_checkout',canonical,sale);
 return public.pos_order_result(sale);
end;
$function$
$original$ then raise exception 'Invoice function changed; inspect checkout_quote_pos_order(uuid,text,jsonb,uuid,uuid) before applying.'; end if;
 execute $updated$CREATE OR REPLACE FUNCTION public.checkout_quote_pos_order(p_estimate uuid, p_version text, payment jsonb, p_actor uuid, p_request uuid)
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
 if method is null or method not in ('cash','check','to_follow') or length(coalesce(payment->>'note',''))>1000 or cash::text in ('NaN','Infinity','-Infinity') or cash<0 or cash>1000000000 then raise exception using errcode='22023',message='Review the payment method, cash and note.'; end if;
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
 update operations.sales_transactions set invoice_details=operations.normalize_invoice_details(payment->'invoiceDetails'),pos_payment_reference=case when method='check' then btrim(payment->>'paymentReference') end where id=sale;
 update operations.estimates set status='converted_sale' where id=p_estimate;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'quote_checkout',canonical,sale);
 return public.pos_order_result(sale);
end;
$function$
$updated$;
end;
$patch$;
