-- Linked records, not only a status label, establish prior fulfillment.
do $patch$ declare d text; old text; begin
 d:=pg_get_functiondef('public.quote_pos_context(uuid)'::regprocedure);
 old:=$old$where estimate_id=p_id and source_type='estimate_conversion'$old$;
 if strpos(d,old)=0 then raise exception 'Quote checkout sale lookup changed'; end if;
 d:=replace(d,old,'where estimate_id=p_id order by created_at,id limit 1');
 old:=$old$when e.archived_at is not null then 'This quotation is archived.'$old$;
 if strpos(d,old)=0 then raise exception 'Quote checkout lifecycle guard changed'; end if;
 d:=replace(d,old,old||$new$
   when exists(select 1 from operations.service_orders where estimate_id=p_id) then 'This quotation already has a service order. Open that job instead of selling the same quotation again.'
$new$);
 old:=$old$'saleId',sale,$old$;
 if strpos(d,old)=0 then raise exception 'Quote checkout response changed'; end if;
 execute replace(d,old,old||$new$'serviceOrderId',(select id from operations.service_orders where estimate_id=p_id order by created_at,id limit 1),$new$);
 d:=pg_get_functiondef('app.convert_estimate_to_service_order_internal(uuid,uuid)'::regprocedure);
 old:=$old$  if v_estimate.status <> 'approved' then$old$;
 if strpos(d,old)=0 then raise exception 'Service conversion lifecycle guard changed'; end if;
 execute replace(d,old,$new$  if exists(select 1 from operations.sales_transactions where estimate_id=p_estimate_id) then
    raise exception using errcode='22023',message='This quotation already has a sales record. Open that record instead of creating another job.';
  end if;
$new$||old);
end; $patch$;
