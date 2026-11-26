alter table operations.service_orders
  add column pos_intake_pending boolean not null default false,
  add constraint service_orders_pos_intake_gate check (
    not pos_intake_pending or (status in ('pending','cancelled') and payment_status = 'unpaid'
      and scheduled_start is null and scheduled_end is null and assigned_mechanic_id is null)
  );

-- Uses the same per-actor request ledger and advisory lock as normal intake.
-- No sale, reservation, or inventory movement occurs in this function.
create function public.limen_create_pos_workshop_order(p_payload jsonb,p_actor uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  saved operations.service_intake_requests%rowtype;
  job uuid;
  lines jsonb := p_payload->'items';
  prepared jsonb := '[]'::jsonb;
  item jsonb;
  product uuid;
  prices jsonb;
  kind text;
  label text;
  sku text;
  qty numeric;
  price numeric;
  amount numeric := 0;
  concern text := '';
begin
  perform operations.assert_workshop_staff(p_actor);
  if p_request_id is null or jsonb_typeof(lines) is distinct from 'array' then
    raise exception using errcode='PT400',message='A valid POS workshop request is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-intake:'||p_actor::text||':'||p_request_id::text,0));
  select * into saved from operations.service_intake_requests where actor_id=p_actor and request_id=p_request_id;
  if found then
    if saved.payload_hash <> md5(p_payload::text) then
      raise exception using errcode='PT409',message='This request already created a different workshop order.';
    end if;
    return public.limen_service_order_json(saved.service_order_id);
  end if;
  if jsonb_array_length(lines) not between 1 and 50 then
    raise exception using errcode='PT400',message='Choose between 1 and 50 parts and labor lines.';
  end if;
  prices := public.limen_current_retail_prices(array(
    select (value->>'productId')::uuid from jsonb_array_elements(lines) where value->>'lineType'='product'
  ));
  for item in select value from jsonb_array_elements(lines) loop
    kind := item->>'lineType';
    qty := (item->>'quantity')::numeric;
    price := (item->>'unitPrice')::numeric;
    product := null;
    if qty is null or qty not between 1 and 10000 or trunc(qty) <> qty
        or price is null or price not between 0.01 and 100000000 or round(price,2) <> price then
      raise exception using errcode='PT400',message='A workshop line has an invalid price or quantity.';
    end if;
    if kind = 'product' then
      product := (item->>'productId')::uuid;
      select value->>'name',value->>'sku' into label,sku
      from jsonb_array_elements(prices)
      where value->>'productId'=product::text and value->>'available'='true'
        and (value->>'price')::numeric=price;
      if not found then
        raise exception using errcode='PT409',message='A part is unavailable or its price changed. Refresh the POS prices before sending the cart.';
      end if;
    elsif kind = 'service' then
      label := nullif(btrim(item->>'itemName'),'');
      if label is null or length(label) > 250 then
        raise exception using errcode='PT400',message='Enter a service name of up to 250 characters.';
      end if;
      sku := 'LABOR';
      concern := concat_ws(', ',nullif(concern,''),label);
    else
      raise exception using errcode='PT400',message='Choose valid parts and labor lines.';
    end if;
    amount := amount + qty * price;
    prepared := prepared || jsonb_build_array(jsonb_build_object('kind',kind,'product',product,'name',label,'sku',sku,'qty',qty,'price',price));
  end loop;
  if concern='' or amount > 100000000 then
    raise exception using errcode='PT400',message='Include a service and keep the workshop estimate within the allowed total.';
  end if;
  insert into operations.service_orders (order_number,note,subtotal,total_amount,pos_intake_pending)
    values ('SVC-POS-'||upper(replace(gen_random_uuid()::text,'-','')),left(concern,2000),amount,amount,true)
    returning id into job;
  insert into operations.service_order_items
    (service_order_id,line_type,product_id,quantity,unit_price,line_total,item_name_snapshot,item_sku_snapshot,business_date)
    select job,value->>'kind',(value->>'product')::uuid,(value->>'qty')::numeric,(value->>'price')::numeric,
      (value->>'qty')::numeric*(value->>'price')::numeric,value->>'name',value->>'sku',current_date
    from jsonb_array_elements(prepared);
  insert into operations.service_intake_requests(actor_id,request_id,payload_hash,service_order_id)
    values(p_actor,p_request_id,md5(p_payload::text),job);
  return public.limen_service_order_json(job);
end;
$$;

create function public.limen_finish_pos_workshop_intake(p_order_id uuid,p_actor uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare
  job operations.service_orders%rowtype;
  customer uuid := nullif(p_payload->>'customerId','')::uuid;
  vehicle uuid := nullif(p_payload->>'vehicleId','')::uuid;
  customer_name text := btrim(coalesce(p_payload->>'customerName',''));
  phone text := nullif(btrim(p_payload->>'customerPhone'),'');
  make_value text := btrim(coalesce(p_payload->>'vehicleMake',''));
  model_value text := btrim(coalesce(p_payload->>'vehicleModel',''));
  plate text := upper(regexp_replace(coalesce(p_payload->>'vehiclePlate',''),'[^A-Za-z0-9]','','g'));
  year_value integer := nullif(p_payload->>'vehicleYear','')::integer;
begin
  perform operations.assert_workshop_staff(p_actor);
  select * into job from operations.service_orders where id=p_order_id for update;
  if not found then raise exception using errcode='PT404',message='Service order not found.'; end if;
  if not job.pos_intake_pending or job.status <> 'pending' then
    raise exception using errcode='PT409',message='This order is not waiting for POS intake details. Reload the order.';
  end if;
  if customer is not null or vehicle is not null then
    perform 1 from operations.vehicles where id=vehicle for update;
    perform 1 from operations.customers where id=customer for share;
    perform public.limen_saved_intake_identity(customer,vehicle,p_payload->>'identityVersion');
  else
    if length(customer_name) not between 1 and 200 or length(make_value) not between 1 and 100
        or length(model_value) not between 1 and 100 or length(plate) not between 1 and 20
        or (phone is not null and phone !~ '^(09[0-9]{9}|[+]?639[0-9]{9})$')
        or (year_value is not null and year_value not between 1900 and 2100) then
      raise exception using errcode='PT400',message='Enter valid customer, vehicle and plate details.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('limen:service-vehicle:'||plate,0));
    if exists(select 1 from operations.vehicles where upper(regexp_replace(coalesce(plate_no,''),'[^A-Za-z0-9]','','g'))=plate) then
      raise exception using errcode='PT409',message='This plate is already registered. Choose the saved customer and vehicle instead.';
    end if;
    insert into operations.customers(customer_type,name,phone,business_date)
      values('walk_in',customer_name,phone,current_date) returning id into customer;
    insert into operations.vehicles(customer_id,plate_no,make,model_name,year,business_date)
      values(customer,plate,make_value,model_value,year_value,current_date) returning id into vehicle;
  end if;
  update operations.service_orders set customer_id=customer,vehicle_id=vehicle,pos_intake_pending=false,updated_at=now()
    where id=p_order_id;
  return public.limen_service_order_json(p_order_id) || '{"posIntakePending":false}'::jsonb;
end;
$$;

revoke all on function public.limen_create_pos_workshop_order(jsonb,uuid,uuid),
  public.limen_finish_pos_workshop_intake(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.limen_create_pos_workshop_order(jsonb,uuid,uuid),
  public.limen_finish_pos_workshop_intake(uuid,uuid,jsonb) to service_role;
