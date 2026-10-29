-- Reuse exact, currently linked records. No ownership/contact updates or data backfill.
create function public.limen_service_intake_context(p_customer uuid)
returns jsonb language sql stable security invoker set search_path=''
as $body$
select jsonb_build_object('customer',jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone),
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object(
    'id',v.id,'plate',v.plate_no,'make',v.make,'model',v.model_name,'year',v.year,
    'identityVersion',md5(jsonb_build_array(c.id,c.name,c.phone,v.id,v.customer_id,v.plate_no,v.make,v.model_name,v.year)::text))
    order by v.created_at,v.id) from operations.vehicles v where v.customer_id=c.id),'[]'::jsonb),
  'checkedAt',now())
from operations.customers c where c.id=p_customer;
$body$;

create function public.limen_saved_intake_identity(p_customer uuid,p_vehicle uuid,p_version text)
returns jsonb language plpgsql stable security invoker set search_path=''
as $body$
declare c operations.customers%rowtype; v operations.vehicles%rowtype; version_value text;
begin
  if p_customer is null or p_vehicle is null or p_version is null or p_version !~ '^[a-f0-9]{32}$' then
    raise exception using errcode='PT400',message='Choose a saved customer and vehicle again before continuing.';
  end if;
  select * into c from operations.customers where id=p_customer;
  if not found then raise exception using errcode='PT409',message='This saved customer is no longer available. Choose another record.'; end if;
  select * into v from operations.vehicles where id=p_vehicle and customer_id=p_customer;
  if not found then raise exception using errcode='PT409',message='This vehicle is not currently linked to the selected customer. Choose their current vehicle or enter a new intake.'; end if;
  version_value:=md5(jsonb_build_array(c.id,c.name,c.phone,v.id,v.customer_id,v.plate_no,v.make,v.model_name,v.year)::text);
  if version_value<>p_version then
    raise exception using errcode='PT409',message='Saved customer or vehicle details changed. Select the saved records again before creating this job.';
  end if;
  if nullif(btrim(c.name),'') is null or nullif(btrim(v.make),'') is null
    or nullif(btrim(v.model_name),'') is null or nullif(btrim(v.plate_no),'') is null then
    raise exception using errcode='PT409',message='This saved record is missing required customer or vehicle details. Review it before starting a new visit.';
  end if;
  return jsonb_build_object('customerId',c.id,'vehicleId',v.id,'customerName',c.name,'customerPhone',coalesce(c.phone,''),
    'vehicleMake',v.make,'vehicleModel',v.model_name,'vehicleYear',v.year,'vehiclePlate',v.plate_no,'identityVersion',version_value);
end;
$body$;

create function public.limen_service_intake_result(p_actor uuid,p_request uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $body$
begin
  perform operations.assert_workshop_staff(p_actor);
  return (select jsonb_build_object('orderId',service_order_id) from operations.service_intake_requests
    where actor_id=p_actor and request_id=p_request);
end;
$body$;

revoke all on function public.limen_service_intake_context(uuid), public.limen_saved_intake_identity(uuid,uuid,text),
  public.limen_service_intake_result(uuid,uuid) from public,anon,authenticated;
grant execute on function public.limen_service_intake_context(uuid), public.limen_saved_intake_identity(uuid,uuid,text),
  public.limen_service_intake_result(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.limen_create_service_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'operations', 'pg_temp'
AS $function$
declare
  v_customer_id uuid;
  v_locked_plate text;
  v_vehicle_id uuid;
  v_vehicle_customer_id uuid;
  v_vehicle_make text;
  v_vehicle_model text;
  v_vehicle_year integer;
  v_order_id uuid;
  v_now timestamptz := timezone('utc', now());
  v_status text := coalesce(nullif(p_payload->>'status', ''), 'pending');
  v_estimated_cost numeric := coalesce(nullif(p_payload->>'estimatedCost', '')::numeric, 0);
  v_year integer := nullif(p_payload->>'vehicleYear', '')::integer;
  v_customer_name text := coalesce(nullif(btrim(p_payload->>'customerName'), ''), 'Walk-in Customer');
  v_customer_phone text := nullif(btrim(coalesce(p_payload->>'customerPhone', '')), '');
  v_make text := coalesce(nullif(btrim(p_payload->>'vehicleMake'), ''), 'Mitsubishi');
  v_model text := coalesce(nullif(btrim(p_payload->>'vehicleModel'), ''), 'Unspecified');
  v_plate text := nullif(upper(regexp_replace(coalesce(p_payload->>'vehiclePlate', ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_items jsonb := coalesce(p_payload->'items', '[]'::jsonb);
  v_item jsonb;
  v_line_type text;
  v_product_id uuid;
  v_service_id uuid;
  v_item_name text;
  v_item_sku text;
  v_quantity numeric;
  v_unit_price numeric;
  v_items_total numeric := 0;
begin
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 50 then
    raise exception using errcode = 'PT400', message = 'Choose no more than 50 valid estimated parts and labor lines.';
  end if;
  if v_estimated_cost < 0 or v_estimated_cost > 100000000 then
    raise exception using errcode = 'PT400', message = 'Enter a valid service estimate.';
  end if;
  if v_status not in ('pending', 'in_progress', 'completed', 'cancelled') then
    v_status := 'pending';
  end if;

  if nullif(p_payload->>'customerId','') is not null or nullif(p_payload->>'vehicleId','') is not null then
    v_customer_id:=nullif(p_payload->>'customerId','')::uuid;
    v_vehicle_id:=nullif(p_payload->>'vehicleId','')::uuid;
    if v_customer_id is null or v_vehicle_id is null then
      raise exception using errcode='PT400',message='Choose both a saved customer and vehicle.';
    end if;
    select nullif(upper(regexp_replace(coalesce(plate_no,''),'[^A-Za-z0-9]','','g')),'') into v_plate
      from operations.vehicles where id=v_vehicle_id;
    if not found or v_plate is null then
      raise exception using errcode='PT409',message='This saved vehicle is unavailable or has no plate. Choose another record.';
    end if;
    -- Same plate-advisory -> vehicle lock order as legacy intake; keep this
    -- selection stable through the pending-order/item/scheduling transaction.
    perform pg_advisory_xact_lock(hashtextextended('limen:service-vehicle:'||v_plate,0));
    select nullif(upper(regexp_replace(coalesce(plate_no,''),'[^A-Za-z0-9]','','g')),'') into v_locked_plate
      from operations.vehicles where id=v_vehicle_id for update;
    if not found or v_locked_plate is distinct from v_plate then
      raise exception using errcode='PT409',message='Saved vehicle details changed. Select the vehicle again.';
    end if;
    perform 1 from operations.customers where id=v_customer_id for share;
    perform public.limen_saved_intake_identity(v_customer_id,v_vehicle_id,p_payload->>'identityVersion');
    -- IDs only: never create/merge a customer or transfer a vehicle in this path.
  else
  if v_plate is not null then
    perform pg_advisory_xact_lock(hashtextextended('limen:service-vehicle:' || v_plate, 0));
    select id, customer_id, make, model_name, year
      into v_vehicle_id, v_vehicle_customer_id, v_vehicle_make, v_vehicle_model, v_vehicle_year
    from operations.vehicles
    where upper(regexp_replace(coalesce(plate_no, ''), '[^A-Za-z0-9]', '', 'g')) = v_plate
    order by created_at, id limit 1 for update;
  end if;
  if v_vehicle_id is not null then
    if lower(btrim(coalesce(v_vehicle_make, ''))) <> lower(v_make)
       or lower(btrim(coalesce(v_vehicle_model, ''))) <> lower(v_model)
       or (v_year is not null and v_vehicle_year is not null and v_year <> v_vehicle_year) then
      raise exception using errcode = 'PT409',
        message = 'This plate is registered to a different vehicle. Check the plate, model, and year before creating the service order.';
    end if;
    select id into v_customer_id from operations.customers
    where id = v_vehicle_customer_id and lower(btrim(name)) = lower(v_customer_name)
      and (v_customer_phone is null or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = regexp_replace(v_customer_phone, '[^0-9]', '', 'g'));
  end if;
  if v_customer_id is null then
    insert into operations.customers (customer_type, name, phone, email, metadata, business_date)
    values ('walk_in', v_customer_name, v_customer_phone, null, '{}'::jsonb, current_date)
    returning id into v_customer_id;
  end if;
  if v_vehicle_id is null then
    insert into operations.vehicles (customer_id, plate_no, make, model_name, year, metadata, business_date)
    values (v_customer_id, v_plate, v_make, v_model, v_year, '{}'::jsonb, current_date)
    returning id into v_vehicle_id;
  elsif v_vehicle_customer_id is distinct from v_customer_id then
    update operations.vehicles set customer_id = v_customer_id where id = v_vehicle_id;
  end if;
  end if;

  insert into operations.service_orders (
    order_number, customer_id, vehicle_id, assigned_to, status, note,
    subtotal, tax_total, total_amount, started_at, completed_at, business_date
  ) values (
    'SVC-' || to_char(v_now, 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
    v_customer_id, v_vehicle_id, null, v_status,
    nullif(btrim(coalesce(p_payload->>'description', '')), ''),
    v_estimated_cost, 0, v_estimated_cost,
    case when v_status = 'in_progress' then v_now else null end,
    case when v_status = 'completed' then v_now else null end,
    current_date
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_line_type := case when v_item->>'lineType' in ('part', 'product') then 'product'
                        when v_item->>'lineType' = 'service' then 'service' else null end;
    if v_line_type is null then
      raise exception using errcode = 'PT400', message = 'An estimated item has an invalid type.';
    end if;
    v_quantity := nullif(v_item->>'quantity', '')::numeric;
    v_unit_price := nullif(v_item->>'unitPrice', '')::numeric;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 10000
       or v_unit_price is null or v_unit_price < 0 or v_unit_price > 100000000
       or (v_line_type = 'product' and v_quantity <> trunc(v_quantity)) then
      raise exception using errcode = 'PT400', message = 'An estimated item has an invalid quantity or price.';
    end if;
    v_product_id := null;
    v_service_id := null;
    if v_line_type = 'product' then
      v_product_id := nullif(v_item->>'productId', '')::uuid;
      select p.name, p.sku into v_item_name, v_item_sku
      from catalog.products p where p.id = v_product_id and p.is_active = true;
      if not found then
        raise exception using errcode = 'PT400', message = 'A selected part is no longer available. Remove it and search again.';
      end if;
    else
      v_service_id := nullif(v_item->>'serviceId', '')::uuid;
      v_item_name := nullif(btrim(coalesce(v_item->>'itemName', v_item->>'displayName', '')), '');
      v_item_sku := nullif(btrim(coalesce(v_item->>'itemSku', '')), '');
      if v_service_id is not null then
        select coalesce(v_item_name, s.name), coalesce(v_item_sku, s.code)
          into v_item_name, v_item_sku
        from operations.services s where s.id = v_service_id;
        if not found then
          raise exception using errcode = 'PT400', message = 'A selected service is no longer available.';
        end if;
      end if;
      if v_item_name is null then
        raise exception using errcode = 'PT400', message = 'Give the estimated labor a description.';
      end if;
    end if;
    v_items_total := v_items_total + round(v_quantity * v_unit_price, 2);
    insert into operations.service_order_items (
      service_order_id, line_type, product_id, service_id, quantity,
      unit_price, line_total, item_name_snapshot, item_sku_snapshot, business_date
    ) values (
      v_order_id, v_line_type, v_product_id, v_service_id, v_quantity,
      v_unit_price, round(v_quantity * v_unit_price, 2), left(v_item_name, 250), left(v_item_sku, 100), current_date
    );
  end loop;
  if jsonb_array_length(v_items) > 0 and abs(round(v_items_total, 2) - round(v_estimated_cost, 2)) > 0.01 then
    raise exception using errcode = 'PT400', message = 'The estimated parts and labor no longer match the total. Review and try again.';
  end if;
  return public.limen_service_order_json(v_order_id);
end;
$function$;
revoke all on function public.limen_create_service_order(jsonb) from public,anon,authenticated;
grant execute on function public.limen_create_service_order(jsonb) to service_role;
