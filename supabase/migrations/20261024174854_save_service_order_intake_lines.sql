-- Intake estimates are snapshots, not stock movements. Actual workshop lines are
-- reviewed separately and only become a sale when payment is confirmed.
alter table operations.service_order_items
  add column if not exists item_name_snapshot text,
  add column if not exists item_sku_snapshot text;

alter table operations.service_order_items
  drop constraint if exists service_order_items_check;
alter table operations.service_order_items
  add constraint service_order_items_check check (
    (line_type = 'product' and product_id is not null and service_id is null)
    or (line_type = 'service' and product_id is null
        and (service_id is not null or nullif(btrim(item_name_snapshot), '') is not null))
  );

create or replace function public.limen_service_order_json(p_order_id uuid)
returns jsonb language sql security definer
set search_path = public, operations, pg_temp
as $function$
  select jsonb_build_object(
    'id', so.id,
    'orderNumber', so.order_number,
    'order_number', so.order_number,
    'customerId', so.customer_id,
    'customerName', coalesce(c.name, 'Walk-in Customer'),
    'customerPhone', coalesce(c.phone, ''),
    'vehicleId', so.vehicle_id,
    'vehicle', jsonb_build_object(
      'make', coalesce(v.make, 'Mitsubishi'),
      'model', coalesce(v.model_name, ''),
      'year', v.year,
      'plate', coalesce(v.plate_no, ''),
      'engine', coalesce(v.engine, ''),
      'mileage', v.mileage
    ),
    'description', coalesce(so.note, ''),
    'note', so.note,
    'status', so.status,
    'estimatedCost', coalesce(so.total_amount, so.subtotal, 0),
    'subtotal', coalesce(so.subtotal, 0),
    'taxTotal', coalesce(so.tax_total, 0),
    'totalAmount', coalesce(so.total_amount, 0),
    'startedAt', so.started_at,
    'completedAt', so.completed_at,
    'businessDate', so.business_date,
    'createdAt', so.created_at,
    'updatedAt', so.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'lineType', i.line_type,
        'productId', i.product_id,
        'serviceId', i.service_id,
        'itemName', coalesce(i.item_name_snapshot, p.name, s.name, ''),
        'itemSku', coalesce(i.item_sku_snapshot, p.sku, s.code, ''),
        'quantity', i.quantity,
        'unitPrice', i.unit_price,
        'lineTotal', i.line_total
      ) order by i.created_at, i.id)
      from operations.service_order_items i
      left join catalog.products p on p.id = i.product_id
      left join operations.services s on s.id = i.service_id
      where i.service_order_id = so.id
    ), '[]'::jsonb)
  )
  from operations.service_orders so
  left join operations.customers c on c.id = so.customer_id
  left join operations.vehicles v on v.id = so.vehicle_id
  where so.id = p_order_id;
$function$;

revoke all on function public.limen_service_order_json(uuid) from public, anon, authenticated;
grant execute on function public.limen_service_order_json(uuid) to service_role;

create or replace function public.limen_create_service_order(p_payload jsonb)
returns jsonb language plpgsql security definer
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

revoke all on function public.limen_create_service_order(jsonb) from public, anon, authenticated;
grant execute on function public.limen_create_service_order(jsonb) to service_role;
