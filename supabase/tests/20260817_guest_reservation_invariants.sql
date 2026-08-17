-- Read-only security invariants for public guest reservation requests.
-- Run after the migration against an isolated staging database.
do $$
declare
  v_function regprocedure :=
    'public.create_guest_part_reservation(uuid,numeric,uuid,text,text,text,text)'::regprocedure;
begin
  if to_regprocedure('public.create_guest_part_reservation(uuid,numeric,uuid,text,text,text,text)') is null then
    raise exception 'guest reservation function is missing';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'guest reservation function is callable by anon/authenticated';
  end if;

  if not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role cannot execute guest reservation function';
  end if;

  if has_table_privilege('anon', 'operations.part_reservations', 'SELECT')
     or has_table_privilege('authenticated', 'operations.part_reservations', 'SELECT')
     or has_table_privilege('anon', 'operations.part_reservation_events', 'SELECT')
     or has_table_privilege('authenticated', 'operations.part_reservation_events', 'SELECT') then
    raise exception 'reservation tables are directly readable by public roles';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'operations.part_reservations'::regclass
      and relrowsecurity
  ) or not exists (
    select 1
    from pg_class
    where oid = 'operations.part_reservation_events'::regclass
      and relrowsecurity
  ) then
    raise exception 'reservation tables must keep RLS enabled';
  end if;
end;
$$;
