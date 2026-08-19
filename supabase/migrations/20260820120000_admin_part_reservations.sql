-- Allow staff to create a reservation for an existing customer without
-- impersonating the customer account. The operation stays inside the
-- database so the customer/product checks, idempotency, and event are atomic.

create or replace function public.create_admin_part_reservation(
  p_actor_user_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_requested_quantity numeric,
  p_request_key uuid,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, operations, catalog, core
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_customer operations.customers%rowtype;
  v_product catalog.products%rowtype;
  v_existing operations.part_reservations%rowtype;
  v_reservation operations.part_reservations%rowtype;
  v_number text;
begin
  perform operations.assert_reservation_admin(p_actor_user_id);

  if p_customer_id is null then
    raise exception 'Customer is required.';
  end if;

  if p_product_id is null then
    raise exception 'Product is required.';
  end if;

  if p_requested_quantity is null
     or p_requested_quantity < 1
     or p_requested_quantity > 999
     or p_requested_quantity <> trunc(p_requested_quantity) then
    raise exception 'Requested quantity must be a whole number from 1 to 999.';
  end if;

  if p_request_key is null then
    raise exception 'A request key is required.';
  end if;

  if length(coalesce(p_customer_note, '')) > 1000 then
    raise exception 'The reservation note is too long.';
  end if;

  select * into v_customer
  from operations.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer was not found.';
  end if;

  select * into v_product
  from catalog.products
  where id = p_product_id
  for share;

  if not found or not v_product.is_active or v_product.status = 'discontinued' then
    raise exception 'Part is not available for reservation.';
  end if;

  select * into v_existing
  from operations.part_reservations
  where customer_id = p_customer_id
    and request_key = p_request_key;

  if found then
    return jsonb_build_object(
      'reservation', to_jsonb(v_existing),
      'idempotentReplay', true
    );
  end if;

  v_number := 'PR-' || to_char(v_now, 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  begin
    insert into operations.part_reservations (
      reservation_number, customer_id, product_id, requested_quantity,
      request_key, customer_note
    ) values (
      v_number, p_customer_id, p_product_id, p_requested_quantity,
      p_request_key, nullif(btrim(p_customer_note), '')
    )
    returning * into v_reservation;
  exception
    when unique_violation then
      select * into v_existing
      from operations.part_reservations
      where customer_id = p_customer_id
        and request_key = p_request_key;

      if found then
        return jsonb_build_object(
          'reservation', to_jsonb(v_existing),
          'idempotentReplay', true
        );
      end if;

      raise exception using
        errcode = '23505',
        message = 'An active reservation for this part already exists.';
  end;

  insert into operations.part_reservation_events (
    reservation_id, event_type, to_status, quantity,
    actor_user_id, note, metadata
  ) values (
    v_reservation.id, 'created_by_admin', 'pending', p_requested_quantity,
    p_actor_user_id, v_reservation.customer_note,
    jsonb_build_object('source', 'admin')
  );

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.create_admin_part_reservation(uuid, uuid, uuid, numeric, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_admin_part_reservation(uuid, uuid, uuid, numeric, uuid, text)
  to service_role;
