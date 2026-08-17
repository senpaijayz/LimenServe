-- Public reservation requests without a customer portal.
-- Customers submit contact details; only internal/admin users can view or
-- process the reservation queue. Existing rows are preserved for audit.

create or replace function public.create_guest_part_reservation(
  p_product_id uuid,
  p_requested_quantity numeric,
  p_request_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, operations, catalog
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_customer operations.customers%rowtype;
  v_product catalog.products%rowtype;
  v_balance catalog.inventory_balances%rowtype;
  v_existing operations.part_reservations%rowtype;
  v_reservation operations.part_reservations%rowtype;
  v_phone text := regexp_replace(btrim(coalesce(p_customer_phone, '')), '[^0-9]', '', 'g');
  v_email text := lower(btrim(coalesce(p_customer_email, '')));
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_available numeric(12,2);
  v_number text;
begin
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

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'A valid customer name is required.';
  end if;

  if v_phone !~ '^0[0-9]{9,10}$' then
    raise exception 'A valid Philippine phone number is required.';
  end if;

  if v_email <> '' and (length(v_email) > 160 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'A valid email address is required.';
  end if;

  select * into v_customer
  from operations.customers
  where phone = v_phone
     or (v_email <> '' and lower(coalesce(email, '')) = v_email)
  order by updated_at desc nulls last, created_at desc, id
  limit 1
  for update;

  if not found then
    insert into operations.customers (
      customer_type, name, phone, email, metadata, business_date
    ) values (
      'walk_in', v_name, v_phone, nullif(v_email, ''),
      jsonb_build_object('source', 'public_guest_reservation'), current_date
    )
    returning * into v_customer;
  else
    update operations.customers
    set name = v_name,
        phone = v_phone,
        email = coalesce(nullif(v_email, ''), email),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source', 'public_guest_reservation'),
        updated_at = v_now
    where id = v_customer.id
    returning * into v_customer;
  end if;

  select * into v_existing
  from operations.part_reservations
  where customer_id = v_customer.id
    and request_key = p_request_key;

  if found then
    return jsonb_build_object('reservation', to_jsonb(v_existing), 'idempotentReplay', true);
  end if;

  select * into v_product
  from catalog.products
  where id = p_product_id
  for share;

  if not found or not v_product.is_active or v_product.status = 'discontinued' then
    raise exception 'Part is not available for reservation.';
  end if;

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date, updated_at
  ) values (
    p_product_id, 0, 0, 0, 0, '{}'::jsonb, current_date, current_date, v_now
  ) on conflict (product_id) do nothing;

  select * into v_balance
  from catalog.inventory_balances
  where product_id = p_product_id
  for update;

  v_available := greatest(v_balance.on_hand - v_balance.reserved, 0);
  if v_available >= p_requested_quantity then
    raise exception 'Requested stock is currently available; complete a normal purchase instead.';
  end if;

  v_number := 'PR-' || to_char(v_now, 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  begin
    insert into operations.part_reservations (
      reservation_number, customer_id, product_id, requested_quantity,
      request_key, customer_note
    ) values (
      v_number, v_customer.id, p_product_id, p_requested_quantity,
      p_request_key, nullif(left(btrim(coalesce(p_customer_note, '')), 1000), '')
    ) returning * into v_reservation;
  exception
    when unique_violation then
      select * into v_existing
      from operations.part_reservations
      where customer_id = v_customer.id
        and request_key = p_request_key;

      if found then
        return jsonb_build_object('reservation', to_jsonb(v_existing), 'idempotentReplay', true);
      end if;

      raise exception using errcode = '23505', message = 'An active reservation for this part already exists.';
  end;

  insert into operations.part_reservation_events (
    reservation_id, event_type, to_status, quantity, actor_user_id, note, metadata
  ) values (
    v_reservation.id, 'created', 'pending', p_requested_quantity, null,
    v_reservation.customer_note,
    jsonb_build_object('source', 'public_guest_reservation')
  );

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'availableQuantityAtRequest', v_available,
    'idempotentReplay', false
  );
end;
$$;

-- Customer-facing reads and cancellation are intentionally removed. The
-- backend admin queue uses the service role and remains the only management
-- surface. Existing rows are not deleted by this migration.
drop policy if exists part_reservations_visible_to_owner_or_staff
  on operations.part_reservations;
create policy part_reservations_visible_to_internal_users
on operations.part_reservations
for select to authenticated
using ((select private.is_internal_user()));

drop policy if exists part_reservation_events_visible_to_owner_or_staff
  on operations.part_reservation_events;
create policy part_reservation_events_visible_to_internal_users
on operations.part_reservation_events
for select to authenticated
using ((select private.is_internal_user()));

revoke all on operations.part_reservations from anon, authenticated;
revoke all on operations.part_reservation_events from anon, authenticated;
grant all on operations.part_reservations to service_role;
grant all on operations.part_reservation_events to service_role;

revoke all on function public.create_guest_part_reservation(uuid, numeric, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_guest_part_reservation(uuid, numeric, uuid, text, text, text, text)
  to service_role;

revoke all on function public.cancel_part_reservation(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_part_reservation(uuid, uuid, numeric, uuid, text)
  from public, anon, authenticated;
