-- One approved quotation can produce only one service order, including concurrent retries.
create unique index if not exists service_orders_one_per_estimate_idx
  on operations.service_orders(estimate_id) where estimate_id is not null;

create or replace function app.convert_estimate_to_service_order_internal(
  p_estimate_id uuid, p_assigned_to uuid default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, operations, app
as $$
declare
  v_estimate operations.estimates%rowtype;
  v_order_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Quote conversion is server-managed.';
  end if;
  if p_estimate_id is null then
    raise exception using errcode='22023',message='Choose an approved quotation.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_estimate_id::text, 96341));
  select * into v_estimate from operations.estimates where id=p_estimate_id for update;
  if not found then raise exception using errcode='P0002',message='Quotation not found.'; end if;
  select id into v_order_id from operations.service_orders
  where estimate_id=p_estimate_id order by created_at limit 1;
  if v_order_id is not null then return v_order_id; end if;
  if v_estimate.status <> 'approved' then
    raise exception using errcode='22023',message='Only approved quotations can become service orders.';
  end if;
  if v_estimate.valid_until is not null
     and v_estimate.valid_until < (now() at time zone 'Asia/Manila')::date then
    raise exception using errcode='22023',message='This quotation has expired. Ask for an updated approval.';
  end if;
  insert into operations.service_orders(
    order_number,estimate_id,customer_id,vehicle_id,assigned_to,status,note,
    subtotal,tax_total,total_amount,business_date
  ) values (
    app.generate_document_number('SVC'),v_estimate.id,v_estimate.customer_id,
    v_estimate.vehicle_id,p_assigned_to,'pending',v_estimate.note,
    v_estimate.subtotal,v_estimate.tax_total,v_estimate.grand_total,
    (now() at time zone 'Asia/Manila')::date
  ) returning id into v_order_id;
  insert into operations.service_order_items(
    service_order_id,line_type,product_id,service_id,quantity,unit_price,
    line_total,estimate_item_id,business_date
  ) select v_order_id,ei.line_type,ei.product_id,ei.service_id,ei.quantity,
      ei.unit_price,ei.line_total,ei.id,(now() at time zone 'Asia/Manila')::date
    from operations.estimate_items ei where ei.estimate_id=p_estimate_id;
  update operations.estimates set status='converted_service',updated_at=now()
  where id=p_estimate_id;
  return v_order_id;
end;
$$;

revoke all on function app.convert_estimate_to_service_order_internal(uuid,uuid)
  from public,anon,authenticated;
grant execute on function app.convert_estimate_to_service_order_internal(uuid,uuid)
  to service_role;

create or replace function public.convert_estimate_to_service_order(
  p_estimate_id uuid, p_assigned_to uuid default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, app
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Quote conversion is server-managed.';
  end if;
  return app.convert_estimate_to_service_order_internal(p_estimate_id,p_assigned_to);
end;
$$;
revoke all on function public.convert_estimate_to_service_order(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.convert_estimate_to_service_order(uuid,uuid)
  to service_role;
