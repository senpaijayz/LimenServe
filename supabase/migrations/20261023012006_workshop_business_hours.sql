-- New assignments only: historical bookings are left untouched.
create or replace function operations.workshop_hours(p_day date)
returns table (opens_at time, closes_at time)
language sql immutable
set search_path = pg_catalog
as $$
  select time '08:00',
         case when extract(isodow from p_day) = 7 then time '12:00'
              else time '17:00' end;
$$;

create or replace function public.limen_workshop_hours(p_day date)
returns jsonb
language sql stable
security definer
set search_path = pg_catalog, operations
as $$
  select jsonb_build_object(
    'date', p_day,
    'timeZone', 'Asia/Manila',
    'opensAt', h.opens_at,
    'closesAt', h.closes_at
  )
  from operations.workshop_hours(p_day) h;
$$;

revoke all on function public.limen_workshop_hours(date) from public, anon, authenticated;
grant execute on function public.limen_workshop_hours(date) to service_role;

create or replace function operations.validate_new_mechanic_assignment()
returns trigger
language plpgsql
set search_path = pg_catalog, operations
as $$
declare
  v_start timestamp;
  v_end timestamp;
  v_open time;
  v_close time;
  v_mechanic operations.mechanics%rowtype;
  v_shift text;
  v_date text;
begin
  if new.status <> 'assigned' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'assigned'
     and old.scheduled_start = new.scheduled_start
     and old.scheduled_end = new.scheduled_end
     and old.mechanic_id = new.mechanic_id then
    return new;
  end if;
  if new.scheduled_start <= now() then
    raise exception using errcode = '22023', message = 'Past dates and times cannot be scheduled.';
  end if;
  v_start := new.scheduled_start at time zone 'Asia/Manila';
  v_end := new.scheduled_end at time zone 'Asia/Manila';
  if v_start::date <> v_end::date or new.scheduled_end <= new.scheduled_start then
    raise exception using errcode = '22023', message = 'Schedule each work session within one Philippine workday.';
  end if;
  select opens_at, closes_at into v_open, v_close
  from operations.workshop_hours(v_start::date);
  if v_start::time < v_open or v_start::time >= v_close or v_end::time > v_close then
    raise exception using errcode = '22023', message =
      case when extract(isodow from v_start::date) = 7
        then 'Sunday appointments must be between 8:00 AM and 12:00 PM, Philippine time.'
        else 'Appointments must be between 8:00 AM and 5:00 PM, Philippine time.' end;
  end if;
  select * into v_mechanic from operations.mechanics where id = new.mechanic_id;
  if not found or not v_mechanic.is_active or v_mechanic.availability_status = 'off_duty' then
    raise exception using errcode = '22023', message = 'This mechanic is not active and on duty.';
  end if;
  v_shift := lower(coalesce(v_mechanic.location_name, '') || ' ' || coalesce(v_mechanic.shift_label, ''));
  if v_shift like '%afternoon%' and v_start::time < time '13:00' then
    raise exception using errcode = '22023', message = 'This mechanic works the afternoon shift, starting at 1:00 PM.';
  end if;
  if v_shift like '%morning%' and v_end::time > time '12:00' then
    raise exception using errcode = '22023', message = 'This mechanic finishes the morning shift at 12:00 PM.';
  end if;
  if v_mechanic.location_name like '{%' then
    begin
      v_date := v_mechanic.location_name::jsonb ->> 'available_date';
      if nullif(v_date, '') is not null and v_date <> v_start::date::text then
        raise exception using errcode = '22023', message = 'This mechanic is not available on the selected date.';
      end if;
    exception when invalid_text_representation then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_new_mechanic_assignment on operations.mechanic_assignments;
create trigger trg_validate_new_mechanic_assignment
before insert or update of status, scheduled_start, scheduled_end, mechanic_id
on operations.mechanic_assignments
for each row execute function operations.validate_new_mechanic_assignment();
