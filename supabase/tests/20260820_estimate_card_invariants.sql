-- Invariants for random EST numbers and the staff quotation card payload.
do $$
declare
  v_def text;
  v_acl record;
  v_trigger_count integer;
begin
  if to_regprocedure('public.list_estimates(text,integer)') is null then
    raise exception 'public.list_estimates(text,integer) is missing';
  end if;

  select pg_get_functiondef('public.list_estimates(text,integer)'::regprocedure)
    into v_def;
  if position('created_at' in v_def) = 0
     or position('revision_count' in lower(v_def)) > 0
     or position('valid_until' in lower(v_def)) = 0
     or position('current_date' in lower(v_def)) = 0 then
    raise exception 'list_estimates does not expose created_at or still exposes revision_count/expired rows';
  end if;

  for v_acl in
    select x.grantee, x.privilege_type
    from aclexplode(coalesce(
      (select proacl from pg_proc where oid = 'public.list_estimates(text,integer)'::regprocedure),
      acldefault('f', 'postgres'::regrole::oid)
    )) x
  loop
    if v_acl.privilege_type = 'EXECUTE'
       and v_acl.grantee not in ('service_role'::regrole::oid, 'postgres'::regrole::oid)
       and v_acl.grantee <> 0 then
      raise exception 'list_estimates grants EXECUTE to an unexpected role %', v_acl.grantee;
    end if;
  end loop;
  if not exists (
    select 1
    from pg_proc
    where oid = 'public.list_estimates(text,integer)'::regprocedure
      and 'search_path=pg_catalog' = any(coalesce(proconfig, array[]::text[]))
  ) then
    raise exception 'list_estimates must pin search_path to pg_catalog';
  end if;

  if to_regprocedure('app.assign_random_estimate_number()') is null then
    raise exception 'random EST trigger function is missing';
  end if;
  select pg_get_functiondef('app.assign_random_estimate_number()'::regprocedure)
    into v_def;
  if position('EST-' in v_def) = 0 or position('random()' in v_def) = 0 then
    raise exception 'random EST trigger function is not using the expected numeric format';
  end if;
  if not exists (
    select 1
    from pg_proc
    where oid = 'app.assign_random_estimate_number()'::regprocedure
      and 'search_path=pg_catalog' = any(coalesce(proconfig, array[]::text[]))
  ) then
    raise exception 'random EST trigger function must pin search_path to pg_catalog';
  end if;

  select count(*) into v_trigger_count
  from pg_trigger
  where tgname = 'trg_estimates_random_number'
    and not tgisinternal
    and tgrelid in (to_regclass('operations.estimates'), to_regclass('app.estimates'));
  if v_trigger_count <> 1 then
    raise exception 'expected exactly one random EST trigger, found %', v_trigger_count;
  end if;
end;
$$;
