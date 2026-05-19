create or replace function app.create_estimate_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_estimate_id uuid;
  v_item jsonb;
  v_business_date date := coalesce((payload -> 'estimate' ->> 'business_date')::date, current_date);
  v_estimate_number text := coalesce(payload -> 'estimate' ->> 'estimate_number', app.generate_document_number('EST'));
  v_vehicle_plate text := nullif(upper(btrim(coalesce(payload -> 'vehicle' ->> 'plate_no', ''))), '');
begin
  if payload ? 'customer' and coalesce(payload -> 'customer' ->> 'name', '') <> '' then
    insert into app.customers (
      customer_type,
      name,
      phone,
      email,
      metadata,
      business_date
    )
    values (
      coalesce(payload -> 'customer' ->> 'customer_type', 'walk_in'),
      payload -> 'customer' ->> 'name',
      payload -> 'customer' ->> 'phone',
      payload -> 'customer' ->> 'email',
      coalesce(payload -> 'customer' -> 'metadata', '{}'::jsonb),
      v_business_date
    )
    returning id into v_customer_id;
  end if;

  if payload ? 'vehicle' and coalesce(payload -> 'vehicle' ->> 'model_name', '') <> '' then
    if v_vehicle_plate is not null then
      select id
      into v_vehicle_id
      from app.vehicles
      where upper(btrim(coalesce(plate_no, ''))) = v_vehicle_plate
      limit 1;
    end if;

    if v_vehicle_id is null then
      insert into app.vehicles (
        customer_id,
        plate_no,
        make,
        model_name,
        year,
        engine,
        mileage,
        metadata,
        business_date
      )
      values (
        v_customer_id,
        v_vehicle_plate,
        coalesce(payload -> 'vehicle' ->> 'make', 'Mitsubishi'),
        payload -> 'vehicle' ->> 'model_name',
        nullif(payload -> 'vehicle' ->> 'year', '')::integer,
        payload -> 'vehicle' ->> 'engine',
        nullif(payload -> 'vehicle' ->> 'mileage', '')::integer,
        coalesce(payload -> 'vehicle' -> 'metadata', '{}'::jsonb),
        v_business_date
      )
      returning id into v_vehicle_id;
    else
      update app.vehicles
      set
        customer_id = coalesce(v_customer_id, customer_id),
        plate_no = coalesce(v_vehicle_plate, plate_no),
        make = coalesce(payload -> 'vehicle' ->> 'make', make),
        model_name = coalesce(nullif(payload -> 'vehicle' ->> 'model_name', ''), model_name),
        year = coalesce(nullif(payload -> 'vehicle' ->> 'year', '')::integer, year),
        engine = coalesce(payload -> 'vehicle' ->> 'engine', engine),
        mileage = coalesce(nullif(payload -> 'vehicle' ->> 'mileage', '')::integer, mileage),
        metadata = coalesce(payload -> 'vehicle' -> 'metadata', metadata)
      where id = v_vehicle_id;
    end if;
  end if;

  insert into app.estimates (
    estimate_number,
    customer_id,
    vehicle_id,
    status,
    source,
    note,
    subtotal,
    discount_total,
    tax_total,
    grand_total,
    issued_at,
    valid_until,
    business_date,
    created_by
  )
  values (
    v_estimate_number,
    v_customer_id,
    v_vehicle_id,
    coalesce(payload -> 'estimate' ->> 'status', 'draft'),
    coalesce(payload -> 'estimate' ->> 'source', 'public'),
    payload -> 'estimate' ->> 'note',
    coalesce((payload -> 'estimate' ->> 'subtotal')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'discount_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'tax_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'grand_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'issued_at')::timestamptz, timezone('utc', now())),
    coalesce((payload -> 'estimate' ->> 'valid_until')::date, current_date + 7),
    v_business_date,
    auth.uid()
  )
  returning id into v_estimate_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
  loop
    insert into app.estimate_items (
      estimate_id,
      line_type,
      product_id,
      service_id,
      quantity,
      unit_price,
      line_total,
      recommendation_rule_id,
      is_upsell,
      business_date
    )
    values (
      v_estimate_id,
      coalesce(v_item ->> 'line_type', case when v_item ? 'service_id' then 'service' else 'product' end),
      nullif(v_item ->> 'product_id', '')::uuid,
      nullif(v_item ->> 'service_id', '')::uuid,
      coalesce((v_item ->> 'quantity')::numeric, 1),
      coalesce((v_item ->> 'unit_price')::numeric, 0),
      coalesce((v_item ->> 'line_total')::numeric, 0),
      nullif(v_item ->> 'recommendation_rule_id', '')::uuid,
      coalesce((v_item ->> 'is_upsell')::boolean, false),
      v_business_date
    );
  end loop;

  return v_estimate_id;
end;
$$;
