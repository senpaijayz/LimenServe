-- Destructive-free integration test for the isolated preview database only.
-- All test users and records are rolled back at the end of the transaction.

begin;

do $$
declare
  v_admin_id constant uuid := '10000000-0000-4000-8000-000000000001';
  v_customer_user_id constant uuid := '10000000-0000-4000-8000-000000000002';
  v_mechanic_one uuid;
  v_mechanic_two uuid;
  v_order_one uuid := gen_random_uuid();
  v_order_two uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_request_key uuid := gen_random_uuid();
  v_reservation_id uuid;
  v_result jsonb;
  v_status text;
  v_on_hand numeric(12,2);
  v_reserved numeric(12,2);
begin
  insert into auth.users (
    id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values
    (
      v_admin_id, 'authenticated', 'authenticated', 'preview-admin@limen.test',
      '{"role":"admin"}'::jsonb, '{"full_name":"Preview Admin"}'::jsonb,
      now(), now()
    ),
    (
      v_customer_user_id, 'authenticated', 'authenticated', 'preview-customer@limen.test',
      '{"role":"customer"}'::jsonb, '{"full_name":"Preview Customer"}'::jsonb,
      now(), now()
    );

  insert into core.user_profiles (user_id, email, full_name, role) values
    (v_admin_id, 'preview-admin@limen.test', 'Preview Admin', 'admin'),
    (v_customer_user_id, 'preview-customer@limen.test', 'Preview Customer', 'customer');

  insert into operations.mechanics (
    full_name, specialization, availability_status, is_public, is_active
  ) values
    ('Preview Mechanic One', 'Engine', 'available', true, true),
    ('Preview Mechanic Two', 'Electrical', 'available', true, true);

  select id into v_mechanic_one
  from operations.mechanics
  where full_name = 'Preview Mechanic One';

  select id into v_mechanic_two
  from operations.mechanics
  where full_name = 'Preview Mechanic Two';

  insert into operations.service_orders (id, order_number, status, note) values
    (v_order_one, 'PREVIEW-SVC-001', 'pending', 'Assignment flow one'),
    (v_order_two, 'PREVIEW-SVC-002', 'pending', 'Assignment flow two');

  perform public.assign_mechanic_to_service_order(
    v_order_one,
    v_mechanic_one,
    '2026-08-10 09:00:00+08'::timestamptz,
    '2026-08-10 10:00:00+08'::timestamptz,
    v_admin_id,
    'Initial preview assignment'
  );

  begin
    perform public.assign_mechanic_to_service_order(
      v_order_two,
      v_mechanic_one,
      '2026-08-10 09:30:00+08'::timestamptz,
      '2026-08-10 10:30:00+08'::timestamptz,
      v_admin_id,
      'This must conflict'
    );
    raise exception 'Expected schedule conflict was not raised.';
  exception
    when exclusion_violation then null;
  end;

  perform public.assign_mechanic_to_service_order(
    v_order_one,
    v_mechanic_two,
    '2026-08-10 09:00:00+08'::timestamptz,
    '2026-08-10 10:00:00+08'::timestamptz,
    v_admin_id,
    'Reassigned in preview'
  );

  if not exists (
    select 1 from operations.mechanic_assignments
    where service_order_id = v_order_one
      and mechanic_id = v_mechanic_one
      and status = 'reassigned'
  ) then
    raise exception 'Assignment history did not preserve the prior mechanic.';
  end if;

  perform public.remove_mechanic_from_service_order(
    v_order_one,
    v_admin_id,
    'Removed in preview'
  );

  if exists (
    select 1 from operations.mechanic_assignments
    where service_order_id = v_order_one and status = 'assigned'
  ) then
    raise exception 'Removing a mechanic left an active assignment.';
  end if;

  update operations.mechanics set is_active = false where id = v_mechanic_one;
  begin
    perform public.assign_mechanic_to_service_order(
      v_order_two,
      v_mechanic_one,
      '2026-08-10 11:00:00+08'::timestamptz,
      '2026-08-10 12:00:00+08'::timestamptz,
      v_admin_id,
      null
    );
    raise exception 'Expected inactive-mechanic rejection was not raised.';
  exception
    when raise_exception then
      if sqlerrm = 'Expected inactive-mechanic rejection was not raised.'
         or sqlerrm not like 'Only active, on-duty mechanics%' then
        raise;
      end if;
  end;

  insert into catalog.products (
    id, sku, name, status, is_active
  ) values (
    v_product_id, 'PREVIEW-PART-001', 'Preview Out-of-Stock Part', 'out_of_stock', true
  );

  insert into catalog.inventory_balances (product_id, on_hand, reserved)
  values (v_product_id, 0, 0);

  v_result := public.create_part_reservation(
    v_customer_user_id,
    v_product_id,
    2,
    v_request_key,
    'Preview reservation'
  );
  v_reservation_id := (v_result -> 'reservation' ->> 'id')::uuid;

  v_result := public.create_part_reservation(
    v_customer_user_id,
    v_product_id,
    2,
    v_request_key,
    'Idempotent replay'
  );
  if coalesce((v_result ->> 'idempotentReplay')::boolean, false) is not true then
    raise exception 'Reservation idempotency replay was not detected.';
  end if;

  perform public.process_part_reservation(
    v_reservation_id,
    'approve',
    v_admin_id,
    'Approved in preview',
    null
  );

  select status into v_status
  from operations.part_reservations
  where id = v_reservation_id;
  if v_status <> 'waiting_for_stock' then
    raise exception 'Zero-stock approval did not enter waiting_for_stock.';
  end if;

  update catalog.inventory_balances
  set on_hand = 2
  where product_id = v_product_id;

  select status into v_status
  from operations.part_reservations
  where id = v_reservation_id;
  if v_status <> 'available' then
    raise exception 'Restock did not make the reservation available.';
  end if;

  select on_hand, reserved into v_on_hand, v_reserved
  from catalog.inventory_balances
  where product_id = v_product_id;
  if v_on_hand <> 2 or v_reserved <> 2 then
    raise exception 'Restock allocation balance is incorrect.';
  end if;

  perform public.process_part_reservation(
    v_reservation_id,
    'complete',
    v_admin_id,
    'Completed in preview',
    null
  );

  select status into v_status
  from operations.part_reservations
  where id = v_reservation_id;
  select on_hand, reserved into v_on_hand, v_reserved
  from catalog.inventory_balances
  where product_id = v_product_id;

  if v_status <> 'completed' or v_on_hand <> 0 or v_reserved <> 0 then
    raise exception 'Completion did not consume physical and reserved stock atomically.';
  end if;

  if not exists (
    select 1 from catalog.inventory_movements
    where reference_id = v_reservation_id and movement_type = 'reservation'
  ) or not exists (
    select 1 from catalog.inventory_movements
    where reference_id = v_reservation_id and movement_type = 'sale'
  ) then
    raise exception 'Reservation inventory ledger entries are incomplete.';
  end if;
end;
$$;

rollback;
