-- Data-preserving part pre-orders/reservations with atomic stock allocation.

alter table operations.customers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists customers_user_id_unique_idx
  on operations.customers(user_id)
  where user_id is not null;

create table if not exists operations.part_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text not null unique,
  customer_id uuid not null references operations.customers(id) on delete restrict,
  product_id uuid not null references catalog.products(id) on delete restrict,
  requested_quantity numeric(12,2) not null,
  allocated_quantity numeric(12,2) not null default 0,
  status text not null default 'pending'
    check (status in (
      'pending', 'approved', 'waiting_for_stock', 'partially_available',
      'available', 'completed', 'rejected', 'cancelled'
    )),
  request_key uuid not null default gen_random_uuid(),
  customer_note text,
  admin_note text,
  estimated_available_on date,
  requested_at timestamptz not null default timezone('utc', now()),
  approved_at timestamptz,
  available_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  last_processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    requested_quantity >= 1
    and requested_quantity <= 999
    and requested_quantity = trunc(requested_quantity)
  ),
  check (
    allocated_quantity >= 0
    and allocated_quantity <= requested_quantity
    and allocated_quantity = trunc(allocated_quantity)
  )
);

create table if not exists operations.part_reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null
    references operations.part_reservations(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  quantity numeric(12,2),
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists part_reservations_request_key_idx
  on operations.part_reservations(customer_id, request_key);

create unique index if not exists part_reservations_one_active_product_idx
  on operations.part_reservations(customer_id, product_id)
  where status in (
    'pending', 'approved', 'waiting_for_stock',
    'partially_available', 'available'
  );

create index if not exists part_reservations_fulfillment_queue_idx
  on operations.part_reservations(
    product_id,
    coalesce(approved_at, requested_at),
    requested_at
  )
  where status in ('approved', 'waiting_for_stock', 'partially_available');

create index if not exists part_reservations_customer_history_idx
  on operations.part_reservations(customer_id, requested_at desc);

create index if not exists part_reservation_events_history_idx
  on operations.part_reservation_events(reservation_id, created_at asc);

create index if not exists part_reservations_processed_by_idx
  on operations.part_reservations(processed_by)
  where processed_by is not null;

create index if not exists part_reservation_events_actor_user_idx
  on operations.part_reservation_events(actor_user_id)
  where actor_user_id is not null;

drop trigger if exists trg_part_reservations_updated_at
  on operations.part_reservations;
create trigger trg_part_reservations_updated_at
before update on operations.part_reservations
for each row execute function core.touch_updated_at();

-- Enforce nonnegative physical/reserved inventory on all new writes while
-- avoiding a destructive rewrite of the existing production table.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'catalog.inventory_balances'::regclass
      and conname = 'inventory_balances_nonnegative_stock'
  ) then
    alter table catalog.inventory_balances
      add constraint inventory_balances_nonnegative_stock
      check (on_hand >= 0 and reserved >= 0) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'catalog.inventory_balances'::regclass
      and conname = 'inventory_balances_reserved_not_overdrawn'
  ) then
    alter table catalog.inventory_balances
      add constraint inventory_balances_reserved_not_overdrawn
      check (reserved <= on_hand) not valid;
  end if;
end;
$$;

create or replace function operations.assert_reservation_admin(p_actor_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, core
as $$
begin
  if p_actor_user_id is null or not exists (
    select 1
    from core.user_profiles up
    where up.user_id = p_actor_user_id
      and up.role = 'admin'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Administrator permission is required.';
  end if;
end;
$$;

create or replace function operations.allocate_part_reservations_for_product(
  p_product_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, operations, catalog
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_balance catalog.inventory_balances%rowtype;
  v_reservation operations.part_reservations%rowtype;
  v_available numeric(12,2);
  v_needed numeric(12,2);
  v_allocate numeric(12,2);
  v_next_status text;
  v_updated_count integer := 0;
  v_allocated_total numeric(12,2) := 0;
begin
  if p_product_id is null then
    raise exception 'Product is required for allocation.';
  end if;

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date, updated_at
  )
  values (
    p_product_id, 0, 0, 0, 0,
    '{}'::jsonb, current_date, current_date, v_now
  )
  on conflict (product_id) do nothing;

  select * into v_balance
  from catalog.inventory_balances
  where product_id = p_product_id
  for update;

  v_available := greatest(v_balance.on_hand - v_balance.reserved, 0);

  for v_reservation in
    select *
    from operations.part_reservations
    where product_id = p_product_id
      and status in ('approved', 'waiting_for_stock', 'partially_available')
    order by coalesce(approved_at, requested_at), requested_at, id
    for update
  loop
    v_needed := v_reservation.requested_quantity - v_reservation.allocated_quantity;
    v_allocate := least(v_needed, v_available);

    if v_allocate > 0 then
      v_next_status := case
        when v_reservation.allocated_quantity + v_allocate = v_reservation.requested_quantity
          then 'available'
        else 'partially_available'
      end;

      update catalog.inventory_balances
      set
        reserved = reserved + v_allocate,
        updated_at = v_now,
        as_of_date = current_date,
        business_date = current_date
      where product_id = p_product_id;

      update operations.part_reservations
      set
        allocated_quantity = allocated_quantity + v_allocate,
        status = v_next_status,
        available_at = case when v_next_status = 'available' then v_now else null end,
        processed_by = coalesce(p_actor_user_id, processed_by),
        last_processed_at = v_now,
        updated_at = v_now
      where id = v_reservation.id;

      insert into operations.part_reservation_events (
        reservation_id, event_type, from_status, to_status,
        quantity, actor_user_id, note
      ) values (
        v_reservation.id, 'stock_allocated', v_reservation.status, v_next_status,
        v_allocate, p_actor_user_id, 'Inventory allocated in first-approved, first-served order.'
      );

      insert into catalog.inventory_movements (
        product_id, movement_type, quantity, reference_type,
        reference_id, notes, performed_by, business_date
      ) values (
        p_product_id,
        'reservation',
        v_allocate,
        'part_reservation',
        v_reservation.id,
        'Inventory reserved in first-approved, first-served order.',
        p_actor_user_id,
        current_date
      );

      v_available := v_available - v_allocate;
      v_updated_count := v_updated_count + 1;
      v_allocated_total := v_allocated_total + v_allocate;
    elsif v_reservation.status = 'approved' then
      update operations.part_reservations
      set
        status = 'waiting_for_stock',
        processed_by = coalesce(p_actor_user_id, processed_by),
        last_processed_at = v_now,
        updated_at = v_now
      where id = v_reservation.id;

      insert into operations.part_reservation_events (
        reservation_id, event_type, from_status, to_status,
        actor_user_id, note
      ) values (
        v_reservation.id, 'status_changed', 'approved', 'waiting_for_stock',
        p_actor_user_id, 'Approved reservation is waiting for inventory.'
      );

      v_updated_count := v_updated_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'productId', p_product_id,
    'updatedReservations', v_updated_count,
    'allocatedQuantity', v_allocated_total,
    'remainingAvailable', v_available
  );
end;
$$;

create or replace function public.create_part_reservation(
  p_actor_user_id uuid,
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
  v_profile core.user_profiles%rowtype;
  v_customer operations.customers%rowtype;
  v_product catalog.products%rowtype;
  v_balance catalog.inventory_balances%rowtype;
  v_existing operations.part_reservations%rowtype;
  v_reservation operations.part_reservations%rowtype;
  v_available numeric(12,2);
  v_number text;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select * into v_profile
  from core.user_profiles
  where user_id = p_actor_user_id
    and role = 'customer';

  if not found then
    raise exception using errcode = '42501', message = 'A customer account is required.';
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

  select * into v_customer
  from operations.customers
  where user_id = p_actor_user_id
  for update;

  if not found then
    insert into operations.customers (
      user_id, customer_type, name, email, business_date
    ) values (
      p_actor_user_id,
      'repeat',
      coalesce(nullif(v_profile.full_name, ''), nullif(v_profile.email, ''), 'Customer'),
      v_profile.email,
      current_date
    )
    on conflict (user_id) where user_id is not null
    do update set user_id = excluded.user_id
    returning * into v_customer;
  end if;

  select * into v_existing
  from operations.part_reservations
  where customer_id = v_customer.id
    and request_key = p_request_key;

  if found then
    return jsonb_build_object(
      'reservation', to_jsonb(v_existing),
      'idempotentReplay', true
    );
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
    p_product_id, 0, 0, 0, 0,
    '{}'::jsonb, current_date, current_date, v_now
  )
  on conflict (product_id) do nothing;

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
      p_request_key, nullif(btrim(p_customer_note), '')
    )
    returning * into v_reservation;
  exception
    when unique_violation then
      select * into v_existing
      from operations.part_reservations
      where customer_id = v_customer.id
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
    actor_user_id, note
  ) values (
    v_reservation.id, 'created', 'pending', p_requested_quantity,
    p_actor_user_id, v_reservation.customer_note
  );

  return jsonb_build_object(
    'reservation', to_jsonb(v_reservation),
    'availableQuantityAtRequest', v_available,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.cancel_part_reservation(
  p_actor_user_id uuid,
  p_reservation_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, operations
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_reservation operations.part_reservations%rowtype;
begin
  select r.* into v_reservation
  from operations.part_reservations r
  join operations.customers c on c.id = r.customer_id
  where r.id = p_reservation_id
    and c.user_id = p_actor_user_id
  for update of r;

  if not found then
    raise exception using errcode = '42501', message = 'Reservation was not found for this customer.';
  end if;

  if v_reservation.status <> 'pending' or v_reservation.allocated_quantity <> 0 then
    raise exception 'Only an unprocessed pending reservation can be cancelled by the customer.';
  end if;

  update operations.part_reservations
  set
    status = 'cancelled',
    cancelled_at = v_now,
    updated_at = v_now
  where id = p_reservation_id
  returning * into v_reservation;

  insert into operations.part_reservation_events (
    reservation_id, event_type, from_status, to_status,
    actor_user_id, note
  ) values (
    p_reservation_id, 'cancelled_by_customer', 'pending', 'cancelled',
    p_actor_user_id, nullif(btrim(p_note), '')
  );

  return to_jsonb(v_reservation);
end;
$$;

create or replace function public.process_part_reservation(
  p_reservation_id uuid,
  p_action text,
  p_actor_user_id uuid,
  p_admin_note text default null,
  p_estimated_available_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, operations, catalog, core
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reservation operations.part_reservations%rowtype;
  v_from_status text;
  v_new_on_hand numeric(12,2);
  v_new_reserved numeric(12,2);
begin
  perform operations.assert_reservation_admin(p_actor_user_id);

  select * into v_reservation
  from operations.part_reservations
  where id = p_reservation_id;

  if not found then
    raise exception 'Reservation was not found.';
  end if;

  -- All fulfillment mutations for a product acquire the balance lock first.
  -- This consistent lock order prevents deadlocks between concurrent admins.
  perform 1
  from catalog.inventory_balances
  where product_id = v_reservation.product_id
  for update;

  if not found then
    raise exception 'Inventory balance was not found for this reservation.';
  end if;

  select * into v_reservation
  from operations.part_reservations
  where id = p_reservation_id
  for update;

  v_from_status := v_reservation.status;

  if v_action = 'approve' then
    if v_from_status <> 'pending' then
      raise exception 'Only pending reservations can be approved.';
    end if;

    update operations.part_reservations
    set
      status = 'approved',
      approved_at = v_now,
      processed_by = p_actor_user_id,
      last_processed_at = v_now,
      admin_note = coalesce(nullif(btrim(p_admin_note), ''), admin_note),
      estimated_available_on = coalesce(p_estimated_available_on, estimated_available_on),
      updated_at = v_now
    where id = p_reservation_id;

    insert into operations.part_reservation_events (
      reservation_id, event_type, from_status, to_status,
      actor_user_id, note
    ) values (
      p_reservation_id, 'approved', v_from_status, 'approved',
      p_actor_user_id, nullif(btrim(p_admin_note), '')
    );

    perform operations.allocate_part_reservations_for_product(
      v_reservation.product_id,
      p_actor_user_id
    );

  elsif v_action = 'allocate' then
    if v_from_status not in ('approved', 'waiting_for_stock', 'partially_available') then
      raise exception 'This reservation is not eligible for allocation.';
    end if;

    perform operations.allocate_part_reservations_for_product(
      v_reservation.product_id,
      p_actor_user_id
    );

  elsif v_action in ('reject', 'cancel') then
    if v_from_status in ('completed', 'rejected', 'cancelled') then
      raise exception 'This reservation is already final.';
    end if;

    if v_reservation.allocated_quantity > 0 then
      update catalog.inventory_balances
      set
        reserved = reserved - v_reservation.allocated_quantity,
        updated_at = v_now,
        as_of_date = current_date,
        business_date = current_date
      where product_id = v_reservation.product_id
        and reserved >= v_reservation.allocated_quantity;

      if not found then
        raise exception 'Reserved inventory is inconsistent; no changes were applied.';
      end if;

      insert into catalog.inventory_movements (
        product_id, movement_type, quantity, reference_type,
        reference_id, notes, performed_by, business_date
      ) values (
        v_reservation.product_id,
        'release',
        -v_reservation.allocated_quantity,
        'part_reservation',
        p_reservation_id,
        'Reservation stock released after ' || v_action,
        p_actor_user_id,
        current_date
      );
    end if;

    update operations.part_reservations
    set
      status = case when v_action = 'reject' then 'rejected' else 'cancelled' end,
      allocated_quantity = 0,
      cancelled_at = case when v_action = 'cancel' then v_now else cancelled_at end,
      processed_by = p_actor_user_id,
      last_processed_at = v_now,
      admin_note = coalesce(nullif(btrim(p_admin_note), ''), admin_note),
      estimated_available_on = coalesce(p_estimated_available_on, estimated_available_on),
      updated_at = v_now
    where id = p_reservation_id;

    insert into operations.part_reservation_events (
      reservation_id, event_type, from_status, to_status,
      quantity, actor_user_id, note
    ) values (
      p_reservation_id,
      case when v_action = 'reject' then 'rejected' else 'cancelled_by_admin' end,
      v_from_status,
      case when v_action = 'reject' then 'rejected' else 'cancelled' end,
      v_reservation.allocated_quantity,
      p_actor_user_id,
      nullif(btrim(p_admin_note), '')
    );

    perform operations.allocate_part_reservations_for_product(
      v_reservation.product_id,
      p_actor_user_id
    );

  elsif v_action = 'complete' then
    if v_from_status <> 'available'
       or v_reservation.allocated_quantity <> v_reservation.requested_quantity then
      raise exception 'Only fully allocated reservations can be completed.';
    end if;

    update catalog.inventory_balances
    set
      on_hand = on_hand - v_reservation.allocated_quantity,
      reserved = reserved - v_reservation.allocated_quantity,
      updated_at = v_now,
      as_of_date = current_date,
      business_date = current_date
    where product_id = v_reservation.product_id
      and on_hand >= v_reservation.allocated_quantity
      and reserved >= v_reservation.allocated_quantity
    returning on_hand, reserved into v_new_on_hand, v_new_reserved;

    if not found then
      raise exception 'Inventory is inconsistent; reservation completion was rolled back.';
    end if;

    update catalog.products
    set
      status = case
        when v_new_on_hand - v_new_reserved <= 0 then 'out_of_stock'
        when v_new_on_hand - v_new_reserved <= 5 then 'low_stock'
        else 'in_stock'
      end,
      updated_at = v_now
    where id = v_reservation.product_id;

    insert into catalog.inventory_movements (
      product_id, movement_type, quantity, reference_type,
      reference_id, notes, performed_by, business_date
    ) values (
      v_reservation.product_id,
      'sale',
      -v_reservation.allocated_quantity,
      'part_reservation',
      p_reservation_id,
      'Completed part reservation ' || v_reservation.reservation_number,
      p_actor_user_id,
      current_date
    );

    update operations.part_reservations
    set
      status = 'completed',
      completed_at = v_now,
      processed_by = p_actor_user_id,
      last_processed_at = v_now,
      admin_note = coalesce(nullif(btrim(p_admin_note), ''), admin_note),
      updated_at = v_now
    where id = p_reservation_id;

    insert into operations.part_reservation_events (
      reservation_id, event_type, from_status, to_status,
      quantity, actor_user_id, note
    ) values (
      p_reservation_id, 'completed', v_from_status, 'completed',
      v_reservation.allocated_quantity, p_actor_user_id,
      nullif(btrim(p_admin_note), '')
    );

  elsif v_action = 'update' then
    update operations.part_reservations
    set
      processed_by = p_actor_user_id,
      last_processed_at = v_now,
      admin_note = coalesce(nullif(btrim(p_admin_note), ''), admin_note),
      estimated_available_on = p_estimated_available_on,
      updated_at = v_now
    where id = p_reservation_id;

    insert into operations.part_reservation_events (
      reservation_id, event_type, from_status, to_status,
      actor_user_id, note, metadata
    ) values (
      p_reservation_id, 'admin_updated', v_from_status, v_from_status,
      p_actor_user_id, nullif(btrim(p_admin_note), ''),
      jsonb_build_object('estimatedAvailableOn', p_estimated_available_on)
    );
  else
    raise exception 'Unsupported reservation action.';
  end if;

  select * into v_reservation
  from operations.part_reservations
  where id = p_reservation_id;

  return to_jsonb(v_reservation);
end;
$$;

create or replace function operations.allocate_part_reservations_after_restock()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, operations
as $$
begin
  if (tg_op = 'INSERT' and new.on_hand > 0)
     or (tg_op = 'UPDATE' and new.on_hand > old.on_hand) then
    perform operations.allocate_part_reservations_for_product(new.product_id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_allocate_part_reservations_after_restock
  on catalog.inventory_balances;
create trigger trg_allocate_part_reservations_after_restock
after insert or update of on_hand on catalog.inventory_balances
for each row
execute function operations.allocate_part_reservations_after_restock();

alter table operations.part_reservations enable row level security;
alter table operations.part_reservation_events enable row level security;
alter table operations.customers enable row level security;

drop policy if exists customers_self_select on operations.customers;
create policy customers_self_select
on operations.customers
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select app.is_internal_user())
);

drop policy if exists part_reservations_visible_to_owner_or_staff
  on operations.part_reservations;
create policy part_reservations_visible_to_owner_or_staff
on operations.part_reservations
for select to authenticated
using (
  (select app.is_internal_user())
  or exists (
    select 1 from operations.customers c
    where c.id = customer_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists part_reservation_events_visible_to_owner_or_staff
  on operations.part_reservation_events;
create policy part_reservation_events_visible_to_owner_or_staff
on operations.part_reservation_events
for select to authenticated
using (
  (select app.is_internal_user())
  or exists (
    select 1
    from operations.part_reservations r
    join operations.customers c on c.id = r.customer_id
    where r.id = reservation_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists mechanic_assignments_customer_select
  on operations.mechanic_assignments;
drop policy if exists mechanic_assignments_internal_select
  on operations.mechanic_assignments;
drop policy if exists mechanic_assignments_visible
  on operations.mechanic_assignments;
create policy mechanic_assignments_visible
on operations.mechanic_assignments
for select to authenticated
using (
  (select app.is_internal_user())
  or exists (
    select 1
    from operations.mechanics m
    where m.id = mechanic_id
      and m.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from operations.service_orders so
    join operations.customers c on c.id = so.customer_id
    where so.id = service_order_id
      and c.user_id = (select auth.uid())
  )
);

grant usage on schema operations, catalog to authenticated, service_role;

revoke all on operations.part_reservations from anon, authenticated;
revoke all on operations.part_reservation_events from anon, authenticated;
grant select on operations.part_reservations to authenticated;
grant select on operations.part_reservation_events to authenticated;
grant all on operations.part_reservations to service_role;
grant all on operations.part_reservation_events to service_role;

revoke all on function operations.assert_reservation_admin(uuid)
  from public, anon, authenticated;
grant execute on function operations.assert_reservation_admin(uuid) to service_role;

revoke all on function operations.allocate_part_reservations_for_product(uuid, uuid)
  from public, anon, authenticated;
grant execute on function operations.allocate_part_reservations_for_product(uuid, uuid)
  to service_role;

revoke all on function operations.allocate_part_reservations_after_restock()
  from public, anon, authenticated;
grant execute on function operations.allocate_part_reservations_after_restock()
  to service_role;

revoke all on function public.create_part_reservation(uuid, uuid, numeric, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_part_reservation(uuid, uuid, numeric, uuid, text)
  to service_role;

revoke all on function public.cancel_part_reservation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_part_reservation(uuid, uuid, text)
  to service_role;

revoke all on function public.process_part_reservation(uuid, text, uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.process_part_reservation(uuid, text, uuid, text, date)
  to service_role;
