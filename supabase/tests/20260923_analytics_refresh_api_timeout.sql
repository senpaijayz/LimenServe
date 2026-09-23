-- Run in an isolated database; verifies the API-facing RPC has a scoped timeout.
begin;
do $test$
declare
  v_function_config text[];
begin
  select proconfig
  into v_function_config
  from pg_proc
  where oid = to_regprocedure('public.run_full_analytics_refresh(text)');

  if v_function_config is null then
    raise exception 'Public analytics refresh RPC is missing';
  end if;

  if not (v_function_config @> array['statement_timeout=60s']) then
    raise exception 'Public analytics refresh RPC must have a scoped 60-second timeout';
  end if;
end;
$test$;
rollback;
