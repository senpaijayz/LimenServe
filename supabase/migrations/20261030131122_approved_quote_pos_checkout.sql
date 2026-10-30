alter table operations.pos_checkout_requests drop constraint pos_checkout_requests_operation_check;
alter table operations.pos_checkout_requests add constraint pos_checkout_requests_operation_check check(operation in ('checkout','settlement','quote_checkout'));
create unique index pos_quote_conversion_once_idx on operations.sales_transactions(estimate_id)
where estimate_id is not null and source_type='estimate_conversion';

create function public.quote_pos_version(p_id uuid) returns text
language sql stable security invoker set search_path='' as $$
 select md5(to_jsonb(e)::text||coalesce((select string_agg(to_jsonb(i)::text,'' order by i.id) from operations.estimate_items i where i.estimate_id=e.id),''))
 from operations.estimates e where id=p_id;
$$;
create function public.quote_pos_context(p_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare e operations.estimates%rowtype; rows jsonb; line_sum numeric; reason text; sale uuid;
begin
 select * into e from operations.estimates where id=p_id;
 if not found then return null; end if;
 select id into sale from operations.sales_transactions where estimate_id=p_id and source_type='estimate_conversion';
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'lineType',i.line_type,'productId',i.product_id,'serviceId',i.service_id,
   'name',coalesce(i.product_name_snapshot,i.service_name_snapshot,p.name,s.name,'Saved item'),
   'sku',coalesce(i.product_sku_snapshot,i.service_code_snapshot,p.sku,s.code,''),'quantity',i.quantity,'unitPrice',i.unit_price,'lineTotal',i.line_total)
   order by i.line_position,i.id),'[]'),coalesce(sum(i.line_total),0) into rows,line_sum
 from operations.estimate_items i left join catalog.products p on p.id=i.product_id left join operations.services s on s.id=i.service_id where i.estimate_id=p_id;
 reason:=case when sale is not null then 'This quotation already has a POS order. Open that order instead of creating another.'
   when e.archived_at is not null then 'This quotation is archived.'
   when e.status in ('converted_sale','converted_service') then 'This quotation was already converted. Review its linked sale or service order instead of creating another.'
   when e.status<>'approved' then 'Save this quotation as Approved by customer before checkout.'
   when e.valid_until is not null and e.valid_until::date < (now() at time zone 'Asia/Manila')::date then 'This quotation has expired. Review its terms with the customer and save an approved revision.'
   when jsonb_array_length(rows)=0 then 'This quotation has no saved items.'
   when least(e.subtotal,e.discount_total,e.tax_total,e.grand_total)<0 or abs(e.subtotal-e.discount_total+e.tax_total-e.grand_total)>0.05
     or (abs(line_sum-e.subtotal)>0.05 and abs(line_sum-(e.subtotal-e.discount_total))>0.05) then 'The saved total does not match the saved items. Review and save an approved revision before checkout.'
   when exists(select 1 from operations.estimate_items i left join catalog.products p on p.id=i.product_id left join operations.services s on s.id=i.service_id
     where i.estimate_id=p_id and (i.quantity<=0 or i.unit_price<0 or i.line_total<0 or i.line_type not in ('product','service')
       or (i.line_type='product' and (p.id is null or not p.is_active)) or (i.line_type='service' and ((i.service_id is not null and (s.id is null or not s.is_active)) or (i.service_id is null and nullif(btrim(i.service_name_snapshot),'') is null))))) then 'A saved item is missing or unavailable. Review the quotation before checkout.'
   when exists(select 1 from (select product_id,sum(quantity) quantity from operations.estimate_items where estimate_id=p_id and line_type='product' group by product_id) q
     left join catalog.inventory_balances b on b.product_id=q.product_id where coalesce(b.on_hand-b.reserved,0)<q.quantity) then 'There is not enough available stock for this quotation. Receive stock or agree on a revised order.'
   end;
 return jsonb_build_object('id',e.id,'number',e.estimate_number,'status',e.status,'version',public.quote_pos_version(p_id),'reason',reason,'ready',reason is null,
   'saleId',sale,'customerName',coalesce(e.customer_snapshot->>'name',(select name from operations.customers where id=e.customer_id),'Walk-in Customer'),
   'subtotal',e.subtotal,'discountTotal',e.discount_total,'taxTotal',e.tax_total,'totalAmount',e.grand_total,'validUntil',e.valid_until,'items',rows);
end;
$$;

create function public.checkout_quote_pos_order(p_estimate uuid,p_version text,payment jsonb,p_actor uuid,p_request uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
 if method is null or method not in ('cash','to_follow') or length(coalesce(payment->>'note',''))>1000 or cash::text in ('NaN','Infinity','-Infinity') or cash<0 or cash>1000000000 then raise exception using errcode='22023',message='Review the payment method, cash and note.'; end if;
 if method='cash' and (payment->>'paymentVerified' is distinct from 'true' or cash<e.grand_total) then raise exception using errcode='22023',message='Confirm the cash was received and enter enough for the quotation total.'; end if;
 if method='to_follow' and (cash<>0 or e.grand_total<=0 or payment->>'releaseConfirmed' is distinct from 'true' or nullif(btrim(payment->>'note'),'') is null) then raise exception using errcode='22023',message='Add a note and confirm the unpaid order is being released now.'; end if;
 ref:=operations.generate_document_number('SALE');
 insert into operations.sales_transactions(transaction_number,estimate_id,customer_id,processed_by,payment_method,status,subtotal,discount_total,tax_total,total_amount,
   business_date,cash_received,change_due,customer_name_snapshot,cashier_name_snapshot,sale_at,source_type,inventory_applied,pos_note,pos_issued_at,pos_paid_at)
 values(ref,e.id,e.customer_id,p_actor,method,case when method='to_follow' then 'pending' else 'completed' end,e.subtotal,e.discount_total,e.tax_total,e.grand_total,
   day,case when method='cash' then cash end,case when method='cash' then cash-e.grand_total else 0 end,ctx->>'customerName',(select full_name from core.user_profiles where user_id=p_actor),
   now(),'estimate_conversion',true,nullif(btrim(payment->>'note'),''),now(),case when method='cash' then now() end) returning id into sale;
 insert into operations.sales_transaction_items(transaction_id,line_type,product_id,service_id,quantity,unit_price,line_total,estimate_item_id,business_date,item_name_snapshot,item_sku_snapshot)
 select sale,i.line_type,i.product_id,i.service_id,i.quantity,i.unit_price,i.line_total,i.id,day,
   coalesce(i.product_name_snapshot,i.service_name_snapshot,p.name,s.name,'Saved item'),coalesce(i.product_sku_snapshot,i.service_code_snapshot,p.sku,s.code,'')
 from operations.estimate_items i left join catalog.products p on p.id=i.product_id left join operations.services s on s.id=i.service_id where i.estimate_id=p_estimate;
 insert into catalog.inventory_movements(product_id,movement_type,quantity,reference_type,reference_id,notes,performed_by,business_date)
 select product_id,'sale',-quantity,'sales_transaction',sale,'Saved quotation POS order '||ref,p_actor,day from operations.sales_transaction_items where transaction_id=sale and product_id is not null;
 update catalog.inventory_balances b set on_hand=b.on_hand-q.quantity,as_of_date=day,business_date=day,updated_at=now()
 from(select product_id,sum(quantity) quantity from operations.sales_transaction_items where transaction_id=sale and product_id is not null group by product_id) q where b.product_id=q.product_id;
 update operations.estimates set status='converted_sale' where id=p_estimate;
 insert into operations.pos_checkout_requests(actor_id,request_id,operation,payload,sale_id) values(p_actor,p_request,'quote_checkout',canonical,sale);
 return public.pos_order_result(sale);
end;
$$;

do $patch$ declare d text; begin
 d:=pg_get_functiondef('public.settle_pos_order(uuid,jsonb,uuid,uuid)'::regprocedure);
 if strpos(d,$old$sale.source_type<>'pos'$old$)=0 then raise exception 'POS settlement guard changed'; end if;
 execute replace(d,$old$sale.source_type<>'pos'$old$,$new$sale.source_type not in ('pos','estimate_conversion')$new$);
 d:=pg_get_functiondef('public.list_unpaid_pos_orders(integer)'::regprocedure);
 if strpos(d,$old$source_type='pos'$old$)=0 then raise exception 'Unpaid POS source filter changed'; end if;
 execute replace(d,$old$source_type='pos'$old$,$new$source_type in ('pos','estimate_conversion')$new$);
end; $patch$;
do $patch$ declare d text; old text; begin
 d:=replace(pg_get_functiondef('public.get_sale_detail(uuid)'::regprocedure),chr(13),'');
 old:='      st.estimate_id,';
 if strpos(d,old)=0 then raise exception 'Sale-detail quote identity changed'; end if;
 d:=replace(d,old,old||E'\n      (select estimate_number from operations.estimates where id=st.estimate_id) as quotation_number,');
 old:=$old$'transactionNumber', sh.transaction_number,$old$;
 if (length(d)-length(replace(d,old,'')))/length(old)<>2 then raise exception 'Sale-detail document identity changed'; end if;
 execute replace(d,old,old||E'\n            ''quotationNumber'',sh.quotation_number,');
end; $patch$;
revoke all on function public.quote_pos_version(uuid),public.quote_pos_context(uuid),public.checkout_quote_pos_order(uuid,text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.quote_pos_version(uuid),public.quote_pos_context(uuid),public.checkout_quote_pos_order(uuid,text,jsonb,uuid,uuid) to service_role;
