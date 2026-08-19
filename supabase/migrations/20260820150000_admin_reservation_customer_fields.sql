-- Replace customer lookup in the admin reservation form with direct contact
-- entry. Customer matching/upsert, reservation creation, payment state, and
-- the audit event remain one atomic, service-role-only transaction.

alter table operations.part_reservations
  add column if not exists payment_status text not null default 'unpaid';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'operations.part_reservations'::regclass
      and conname = 'part_reservations_payment_status_check'
  ) then
    alter table operations.part_reservations
      add constraint part_reservations_payment_status_check
      check (payment_status in ('unpaid', 'partial', 'paid'));
  end if;
end;
$$;

drop function if exists public.create_admin_part_reservation(uuid, uuid, uuid, numeric, uuid, text);

create or replace function public.create_admin_part_reservation(
  p_actor_user_id uuid,
  p_product_id uuid,
  p_requested_quantity numeric,
  p_request_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_note text default null,
  p_payment_status text default 'unpaid'
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
  v_phone text := regexp_replace(btrim(coalesce(p_customer_phone, '')), '[^0-9]', '', 'g');
  v_email text := lower(btrim(coalesce(p_customer_email, '')));
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_payment_status text := lower(btrim(coalesce(p_payment_status, 'unpaid')));
  v_number text;
begin
  perform operations.assert_reservation_admin(p_actor_user_id);

  if p_product_id is null then raise exception 'Product is required.'; end if;
  if p_requested_quantity is null or p_requested_quantity < 1
     or p_requested_quantity > 999 or p_requested_quantity <> trunc(p_requested_quantity) then
    raise exception 'Requested quantity must be a whole number from 1 to 999.';
  end if;
  if p_request_key is null then raise exception 'A request key is required.'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'A valid customer name is required.'; end if;
  if v_phone !~ '^0[0-9]{9,10}$' then raise exception 'A valid Philippine phone number is required.'; end if;
  if v_email <> '' and (length(v_email) > 160 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'A valid email address is required.';
  end if;
  if v_payment_status not in ('unpaid', 'partial', 'paid') then raise exception 'Choose a valid payment status.'; end if;
  if length(coalesce(p_customer_note, '')) > 1000 then raise exception 'The reservation note is too long.'; end if;

  -- Serialize concurrent staff requests for the same contact without adding a
  -- uniqueness constraint to legacy customer data that may already duplicate.
  perform pg_advisory_xact_lock(hashtextextended(v_phone, 0));

  select * into v_customer
  from operations.customers
  where phone = v_phone
     or (v_email <> '' and lower(coalesce(email, '')) = v_email)
  order by updated_at desc nulls last, created_at desc, id
  limit 1
  for update;

  if not found then
    insert into operations.customers (customer_type, name, phone, email, metadata, business_date)
    values ('walk_in', v_name, v_phone, nullif(v_email, ''), jsonb_build_object('source', 'admin_reservation'), current_date)
    returning * into v_customer;
  else
    update operations.customers
    set name = v_name,
        phone = v_phone,
        email = coalesce(nullif(v_email, ''), email),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source', 'admin_reservation'),
        updated_at = v_now
    where id = v_customer.id
    returning * into v_customer;
  end if;

  select * into v_existing
  from operations.part_reservations
  where customer_id = v_customer.id and request_key = p_request_key;
  if found then
    return jsonb_build_object('reservation', to_jsonb(v_existing), 'idempotentReplay', true);
  end if;

  select * into v_product from catalog.products where id = p_product_id for share;
  if not found or not v_product.is_active or v_product.status = 'discontinued' then
    raise exception 'Part is not available for reservation.';
  end if;

  v_number := 'PR-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  begin
    insert into operations.part_reservations (
      reservation_number, customer_id, product_id, requested_quantity,
      request_key, customer_note, payment_status
    ) values (
      v_number, v_customer.id, p_product_id, p_requested_quantity,
      p_request_key, nullif(btrim(p_customer_note), ''), v_payment_status
    ) returning * into v_reservation;
  exception when unique_violation then
    select * into v_existing from operations.part_reservations
    where customer_id = v_customer.id and request_key = p_request_key;
    if found then return jsonb_build_object('reservation', to_jsonb(v_existing), 'idempotentReplay', true); end if;
    raise exception using errcode = '23505', message = 'An active reservation for this part already exists.';
  end;

  insert into operations.part_reservation_events (
    reservation_id, event_type, to_status, quantity, actor_user_id, note, metadata
  ) values (
    v_reservation.id, 'created_by_admin', 'pending', p_requested_quantity,
    p_actor_user_id, v_reservation.customer_note,
    jsonb_build_object('source', 'admin', 'paymentStatus', v_payment_status)
  );

  return jsonb_build_object('reservation', to_jsonb(v_reservation), 'idempotentReplay', false);
end;
$$;

revoke all on function public.create_admin_part_reservation(uuid, uuid, numeric, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_admin_part_reservation(uuid, uuid, numeric, uuid, text, text, text, text, text)
  to service_role;
