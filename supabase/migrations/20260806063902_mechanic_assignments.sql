-- Add schedulable mechanic assignments without changing existing service data.
-- Legacy assigned_to remains populated when a mechanic is linked to an auth user.

create extension if not exists btree_gist with schema extensions;

alter table operations.mechanics
  add column if not exists is_active boolean not null default true;

alter table operations.service_orders
  add column if not exists assigned_mechanic_id uuid
    references operations.mechanics(id) on delete set null,
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'operations.service_orders'::regclass
      and conname = 'service_orders_schedule_valid'
  ) then
    alter table operations.service_orders
      add constraint service_orders_schedule_valid
      check (
        (scheduled_start is null and scheduled_end is null)
        or (scheduled_start is not null and scheduled_end > scheduled_start)
      ) not valid;
  end if;
end;
$$;

create table if not exists operations.mechanic_assignments (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null
    references operations.service_orders(id) on delete cascade,
  mechanic_id uuid not null
    references operations.mechanics(id) on delete restrict,
  status text not null default 'assigned'
    check (status in ('assigned', 'reassigned', 'removed', 'completed', 'cancelled')),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default timezone('utc', now()),
  ended_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (scheduled_end > scheduled_start),
  check (
    (status = 'assigned' and ended_at is null)
    or (status <> 'assigned' and ended_at is not null)
  )
);

create unique index if not exists mechanic_assignments_one_active_per_service_idx
  on operations.mechanic_assignments(service_order_id)
  where status = 'assigned';

create index if not exists mechanic_assignments_service_history_idx
  on operations.mechanic_assignments(service_order_id, assigned_at desc);

create index if not exists mechanic_assignments_mechanic_schedule_idx
  on operations.mechanic_assignments(mechanic_id, scheduled_start, scheduled_end)
  where status = 'assigned';

create index if not exists service_orders_assigned_mechanic_idx
  on operations.service_orders(assigned_mechanic_id)
  where assigned_mechanic_id is not null;

create index if not exists mechanic_assignments_assigned_by_idx
  on operations.mechanic_assignments(assigned_by);

create index if not exists mechanic_assignments_ended_by_idx
  on operations.mechanic_assignments(ended_by)
  where ended_by is not null;

-- Cover legacy foreign keys used by authorization and compatibility paths.
create index if not exists mechanics_user_id_idx
  on operations.mechanics(user_id)
  where user_id is not null;

create index if not exists service_orders_assigned_to_idx
  on operations.service_orders(assigned_to)
  where assigned_to is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'operations.mechanic_assignments'::regclass
      and conname = 'mechanic_assignments_no_schedule_overlap'
  ) then
    alter table operations.mechanic_assignments
      add constraint mechanic_assignments_no_schedule_overlap
      exclude using gist (
        mechanic_id with =,
        tstzrange(scheduled_start, scheduled_end, '[)') with &&
      )
      where (status = 'assigned');
  end if;
end;
$$;

drop trigger if exists trg_mechanic_assignments_updated_at
  on operations.mechanic_assignments;
create trigger trg_mechanic_assignments_updated_at
before update on operations.mechanic_assignments
for each row execute function core.touch_updated_at();

create or replace function operations.assert_assignment_admin(p_actor_user_id uuid)
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

create or replace function public.assign_mechanic_to_service_order(
  p_service_order_id uuid,
  p_mechanic_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_actor_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, operations, core
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_mechanic operations.mechanics%rowtype;
  v_service operations.service_orders%rowtype;
  v_previous operations.mechanic_assignments%rowtype;
  v_assignment_id uuid;
begin
  perform operations.assert_assignment_admin(p_actor_user_id);

  if p_service_order_id is null or p_mechanic_id is null then
    raise exception 'A service order and mechanic are required.';
  end if;

  if p_scheduled_start is null or p_scheduled_end is null
     or p_scheduled_end <= p_scheduled_start then
    raise exception 'A valid service start and end time are required.';
  end if;

  select * into v_service
  from operations.service_orders
  where id = p_service_order_id
  for update;

  if not found then
    raise exception 'Service order was not found.';
  end if;

  if v_service.status in ('completed', 'cancelled') then
    raise exception 'Completed or cancelled services cannot be assigned.';
  end if;

  select * into v_mechanic
  from operations.mechanics
  where id = p_mechanic_id
  for update;

  if not found then
    raise exception 'Mechanic was not found.';
  end if;

  if not v_mechanic.is_active or v_mechanic.availability_status = 'off_duty' then
    raise exception 'Only active, on-duty mechanics may be assigned.';
  end if;

  select * into v_previous
  from operations.mechanic_assignments
  where service_order_id = p_service_order_id
    and status = 'assigned'
  for update;

  if found
     and v_previous.mechanic_id = p_mechanic_id
     and v_previous.scheduled_start = p_scheduled_start
     and v_previous.scheduled_end = p_scheduled_end then
    return jsonb_build_object(
      'assignmentId', v_previous.id,
      'serviceOrderId', p_service_order_id,
      'mechanicId', p_mechanic_id,
      'unchanged', true
    );
  end if;

  if v_previous.id is not null then
    update operations.mechanic_assignments
    set
      status = 'reassigned',
      ended_by = p_actor_user_id,
      ended_at = v_now,
      updated_at = v_now
    where id = v_previous.id;
  end if;

  begin
    insert into operations.mechanic_assignments (
      service_order_id,
      mechanic_id,
      scheduled_start,
      scheduled_end,
      assigned_by,
      note
    )
    values (
      p_service_order_id,
      p_mechanic_id,
      p_scheduled_start,
      p_scheduled_end,
      p_actor_user_id,
      nullif(btrim(p_note), '')
    )
    returning id into v_assignment_id;
  exception
    when exclusion_violation then
      raise exception using
        errcode = '23P01',
        message = 'The mechanic already has a conflicting assignment during this time.';
  end;

  update operations.service_orders
  set
    assigned_mechanic_id = p_mechanic_id,
    assigned_to = v_mechanic.user_id,
    scheduled_start = p_scheduled_start,
    scheduled_end = p_scheduled_end,
    updated_at = v_now
  where id = p_service_order_id;

  return jsonb_build_object(
    'assignmentId', v_assignment_id,
    'serviceOrderId', p_service_order_id,
    'mechanicId', p_mechanic_id,
    'scheduledStart', p_scheduled_start,
    'scheduledEnd', p_scheduled_end,
    'assignedAt', v_now,
    'unchanged', false
  );
end;
$$;

create or replace function public.remove_mechanic_from_service_order(
  p_service_order_id uuid,
  p_actor_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, operations, core
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_assignment operations.mechanic_assignments%rowtype;
begin
  perform operations.assert_assignment_admin(p_actor_user_id);

  perform 1
  from operations.service_orders
  where id = p_service_order_id
  for update;

  if not found then
    raise exception 'Service order was not found.';
  end if;

  select * into v_assignment
  from operations.mechanic_assignments
  where service_order_id = p_service_order_id
    and status = 'assigned'
  for update;

  if not found then
    return jsonb_build_object(
      'serviceOrderId', p_service_order_id,
      'removed', false
    );
  end if;

  update operations.mechanic_assignments
  set
    status = 'removed',
    ended_by = p_actor_user_id,
    ended_at = v_now,
    note = coalesce(nullif(btrim(p_note), ''), note),
    updated_at = v_now
  where id = v_assignment.id;

  update operations.service_orders
  set
    assigned_mechanic_id = null,
    assigned_to = null,
    scheduled_start = null,
    scheduled_end = null,
    updated_at = v_now
  where id = p_service_order_id;

  return jsonb_build_object(
    'assignmentId', v_assignment.id,
    'serviceOrderId', p_service_order_id,
    'removed', true,
    'removedAt', v_now
  );
end;
$$;

create or replace function public.finish_mechanic_assignment(
  p_service_order_id uuid,
  p_actor_user_id uuid,
  p_outcome text default 'completed'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, operations, core
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_status text;
begin
  if p_actor_user_id is null or not exists (
    select 1 from core.user_profiles
    where user_id = p_actor_user_id
      and role in ('admin', 'cashier')
  ) then
    raise exception using
      errcode = '42501',
      message = 'Staff permission is required.';
  end if;

  v_status := case when p_outcome = 'cancelled' then 'cancelled' else 'completed' end;

  update operations.mechanic_assignments
  set
    status = v_status,
    ended_by = p_actor_user_id,
    ended_at = v_now,
    updated_at = v_now
  where service_order_id = p_service_order_id
    and status = 'assigned';

  return found;
end;
$$;

-- Keep mechanic administration service-role only and make public listings omit
-- inactive records. This replaces the insecure legacy wrappers in-place.
create or replace function public.get_public_mechanics()
returns setof operations.mechanics
language sql
stable
security definer
set search_path = pg_catalog, operations
as $$
  select *
  from operations.mechanics
  where is_public is true
    and is_active is true
  order by sort_order asc, full_name asc;
$$;

create or replace function public.upsert_mechanic(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, operations
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_user_id uuid := nullif(coalesce(p_payload ->> 'user_id', p_payload ->> 'userId'), '')::uuid;
  v_full_name text := nullif(btrim(coalesce(p_payload ->> 'full_name', p_payload ->> 'fullName')), '');
  v_specialization text := nullif(btrim(p_payload ->> 'specialization'), '');
  v_status text := coalesce(nullif(coalesce(p_payload ->> 'availability_status', p_payload ->> 'availabilityStatus'), ''), 'available');
  v_shift_label text := nullif(btrim(coalesce(p_payload ->> 'shift_label', p_payload ->> 'shiftLabel')), '');
  v_location_name text := coalesce(nullif(btrim(coalesce(p_payload ->> 'location_name', p_payload ->> 'locationName')), ''), 'Limen');
  v_bio text := nullif(btrim(p_payload ->> 'bio'), '');
  v_photo_url text := nullif(btrim(coalesce(p_payload ->> 'photo_url', p_payload ->> 'photoUrl')), '');
  v_is_public boolean := coalesce(nullif(p_payload ->> 'is_public', '')::boolean, nullif(p_payload ->> 'isPublic', '')::boolean, true);
  v_is_active boolean := coalesce(nullif(p_payload ->> 'is_active', '')::boolean, nullif(p_payload ->> 'isActive', '')::boolean, true);
  v_sort_order integer := coalesce(nullif(p_payload ->> 'sort_order', '')::integer, nullif(p_payload ->> 'sortOrder', '')::integer, 0);
begin
  if v_full_name is null or v_specialization is null then
    raise exception 'Mechanic name and specialization are required.';
  end if;

  if v_status not in ('available', 'off_duty', 'booked') then
    raise exception 'Invalid mechanic availability status.';
  end if;

  if v_id is null then
    insert into operations.mechanics (
      user_id, full_name, specialization, availability_status, shift_label,
      location_name, bio, photo_url, is_public, is_active, sort_order
    ) values (
      v_user_id, v_full_name, v_specialization, v_status, v_shift_label,
      v_location_name, v_bio, v_photo_url, v_is_public, v_is_active, v_sort_order
    ) returning id into v_id;
  else
    update operations.mechanics
    set
      user_id = v_user_id,
      full_name = v_full_name,
      specialization = v_specialization,
      availability_status = v_status,
      shift_label = v_shift_label,
      location_name = v_location_name,
      bio = v_bio,
      photo_url = coalesce(v_photo_url, photo_url),
      is_public = v_is_public,
      is_active = v_is_active,
      sort_order = v_sort_order,
      updated_at = timezone('utc', now())
    where id = v_id;

    if not found then
      raise exception 'Mechanic was not found.';
    end if;
  end if;

  return v_id;
end;
$$;

alter table operations.mechanic_assignments enable row level security;

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
);

revoke all on operations.mechanic_assignments from anon, authenticated;
grant select on operations.mechanic_assignments to authenticated;
grant all on operations.mechanic_assignments to service_role;

revoke all on function operations.assert_assignment_admin(uuid)
  from public, anon, authenticated;
grant execute on function operations.assert_assignment_admin(uuid) to service_role;

revoke all on function public.assign_mechanic_to_service_order(uuid, uuid, timestamptz, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.assign_mechanic_to_service_order(uuid, uuid, timestamptz, timestamptz, uuid, text)
  to service_role;

revoke all on function public.remove_mechanic_from_service_order(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.remove_mechanic_from_service_order(uuid, uuid, text)
  to service_role;

revoke all on function public.finish_mechanic_assignment(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.finish_mechanic_assignment(uuid, uuid, text)
  to service_role;

revoke all on function public.upsert_mechanic(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_mechanic(jsonb) to service_role;

revoke all on function public.delete_mechanic(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_mechanic(uuid) to service_role;

revoke all on function public.list_mechanics()
  from public, anon, authenticated;
grant execute on function public.list_mechanics() to service_role;

revoke all on function public.get_public_mechanics()
  from public, anon, authenticated;
grant execute on function public.get_public_mechanics() to service_role;
