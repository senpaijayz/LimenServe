-- Run with psql --set ON_ERROR_STOP=1 against an isolated rehearsal database.
-- This is intentionally schema/RPC coverage only; it does not mutate production.
do $$
declare
  v_constraint_count integer;
  v_function_count integer;
  v_service_grant_count integer;
  v_client_grant_count integer;
begin
  if to_regclass('operations.historical_sales_aggregates') is null then
    raise exception 'historical_sales_aggregates table is missing';
  end if;

  if to_regclass('operations.historical_sales_aggregate_audit') is null then
    raise exception 'historical_sales_aggregate_audit table is missing';
  end if;

  select count(*) into v_constraint_count
  from pg_constraint
  where conrelid = 'operations.historical_sales_aggregates'::regclass
    and contype = 'c';
  if v_constraint_count < 4 then
    raise exception 'period total validation constraints are incomplete';
  end if;

  select count(*) into v_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_historical_sales_aggregate', 'update_historical_sales_aggregate', 'list_historical_sales_aggregates');
  if v_function_count <> 3 then
    raise exception 'period total RPCs are missing';
  end if;

  select count(*) into v_service_grant_count
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in ('create_historical_sales_aggregate', 'update_historical_sales_aggregate', 'list_historical_sales_aggregates')
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';
  if v_service_grant_count <> 3 then
    raise exception 'period total RPCs must remain service-role only';
  end if;

  select count(*) into v_client_grant_count
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in ('create_historical_sales_aggregate', 'update_historical_sales_aggregate', 'list_historical_sales_aggregates')
    and grantee in ('anon', 'authenticated')
    and privilege_type = 'EXECUTE';
  if v_client_grant_count <> 0 then
    raise exception 'period total RPCs are exposed to a client role';
  end if;
end;
$$;
