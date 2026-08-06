-- Run after the 20260806 migrations in preview/staging. This file is read-only.

do $$
begin
  if to_regclass('operations.mechanic_assignments') is null then
    raise exception 'operations.mechanic_assignments is missing';
  end if;

  if to_regclass('operations.part_reservations') is null
     or to_regclass('operations.part_reservation_events') is null then
    raise exception 'part reservation tables are missing';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'operations.mechanic_assignments'::regclass
      and relrowsecurity
  ) then
    raise exception 'mechanic assignment RLS is disabled';
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'operations.part_reservations'::regclass
      and relrowsecurity
  ) then
    raise exception 'part reservation RLS is disabled';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.assign_mechanic_to_service_order(uuid,uuid,timestamptz,timestamptz,uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute mechanic assignment RPC directly';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.process_part_reservation(uuid,text,uuid,text,date)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute reservation processing RPC directly';
  end if;

  if has_function_privilege('anon', 'public.upsert_mechanic(jsonb)', 'EXECUTE') then
    raise exception 'anon can still execute upsert_mechanic';
  end if;

  if exists (
    select 1 from catalog.inventory_balances
    where on_hand < 0 or reserved < 0 or reserved > on_hand
  ) then
    raise exception 'inventory balance invariant failed';
  end if;
end;
$$;
