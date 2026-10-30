-- An optional explicit customer ID links new POS activity; never merge by name/phone.
do $patch$
declare d text; old text;
begin
 d:=replace(pg_get_functiondef('public.checkout_pos_order(jsonb,uuid,uuid)'::regprocedure),chr(13),'');
 old:='field text; value numeric; line jsonb; disc numeric;';
 if strpos(d,old)=0 then raise exception 'POS declaration changed'; end if;
 d:=replace(d,old,old||E'\n v_saved_customer uuid; v_saved_name text; sale_payload jsonb:=payload;');
 old:='if method is null or method not in';
 if strpos(d,old)=0 then raise exception 'POS method guard changed'; end if;
 d:=replace(d,old,$new$v_saved_customer:=nullif(payload->>'customerId','')::uuid;
 if v_saved_customer is not null then
   -- Same financial lock order as the retained stock/price constructor.
   perform pg_advisory_xact_lock(73841590214631::bigint);
   select c.name into v_saved_name from operations.customers c where c.id=v_saved_customer for key share;
   if not found or nullif(btrim(v_saved_name),'') is null then
     raise exception using errcode='22023',message='The saved customer is unavailable. Choose the customer again before checkout.';
   end if;
   sale_payload:=payload||jsonb_build_object('customerName',v_saved_name);
 end if;
 if method is null or method not in$new$);
 old:='sale_id:=public.create_pos_sale(payload,p_actor);';
 if strpos(d,old)=0 then raise exception 'POS constructor call changed'; end if;
 d:=replace(d,old,'sale_id:=public.create_pos_sale(sale_payload,p_actor);');
 old:='update operations.sales_transactions set pos_note=';
 if strpos(d,old)=0 then raise exception 'POS saved-header update changed'; end if;
 execute replace(d,old,'update operations.sales_transactions set customer_id=v_saved_customer,pos_note=');
end; $patch$;
