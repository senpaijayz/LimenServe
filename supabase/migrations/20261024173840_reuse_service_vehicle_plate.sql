-- A returning vehicle must be reused by plate instead of inserted a second time.
-- Keep the service order's customer snapshot independent of the vehicle's current owner.
create or replace function public.limen_create_service_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, operations, pg_temp
as $function$
declare
  v_customer_id uuid;
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
begin
  if v_status not in ('pending', 'in_progress', 'completed', 'cancelled') then
    v_status := 'pending';
  end if;

  if v_plate is not null then
    -- Serialize this intake path for a plate before checking the unique vehicle record.
    perform pg_advisory_xact_lock(hashtextextended('limen:service-vehicle:' || v_plate, 0));
    select id, customer_id, make, model_name, year
      into v_vehicle_id, v_vehicle_customer_id, v_vehicle_make, v_vehicle_model, v_vehicle_year
    from operations.vehicles
    where upper(regexp_replace(coalesce(plate_no, ''), '[^A-Za-z0-9]', '', 'g')) = v_plate
    order by created_at, id
    limit 1
    for update;
  end if;

  if v_vehicle_id is not null then
    if lower(btrim(coalesce(v_vehicle_make, ''))) <> lower(v_make)
       or lower(btrim(coalesce(v_vehicle_model, ''))) <> lower(v_model)
       or (v_year is not null and v_vehicle_year is not null and v_year <> v_vehicle_year) then
      raise exception using errcode = 'PT409',
        message = 'This plate is registered to a different vehicle. Check the plate, model, and year before creating the service order.';
    end if;

    select id into v_customer_id
    from operations.customers
    where id = v_vehicle_customer_id
      and lower(btrim(name)) = lower(v_customer_name)
      and (v_customer_phone is null
           or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = regexp_replace(v_customer_phone, '[^0-9]', '', 'g'));
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
    -- The current owner can change; historical orders retain their own customer_id.
    update operations.vehicles set customer_id = v_customer_id where id = v_vehicle_id;
  end if;

  insert into operations.service_orders (
    order_number, customer_id, vehicle_id, assigned_to, status, note,
    subtotal, tax_total, total_amount, started_at, completed_at, business_date
  )
  values (
    'SVC-' || to_char(v_now, 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
    v_customer_id, v_vehicle_id, null, v_status,
    nullif(btrim(coalesce(p_payload->>'description', '')), ''),
    v_estimated_cost, 0, v_estimated_cost,
    case when v_status = 'in_progress' then v_now else null end,
    case when v_status = 'completed' then v_now else null end,
    current_date
  )
  returning id into v_order_id;

  return public.limen_service_order_json(v_order_id);
end;
$function$;

revoke all on function public.limen_create_service_order(jsonb) from public, anon, authenticated;
grant execute on function public.limen_create_service_order(jsonb) to service_role;
