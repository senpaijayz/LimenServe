-- Run only on an isolated database after the sales-return migration.
do $$
declare
  v_name text;
  v_rel regclass;
  v_rls boolean;
  v_execute_count integer;
  v_client_execute_count integer;
  v_function_definition text;
  v_view_definition text;
begin
  foreach v_name in array array['operations.sales_returns', 'operations.sales_return_items', 'operations.sales_return_requests'] loop
    v_rel := to_regclass(v_name);
    if v_rel is null then raise exception 'Required return table % is missing', v_name; end if;
    select c.relrowsecurity into v_rls from pg_class c where c.oid = v_rel;
    if not v_rls then raise exception 'RLS is not enabled on %', v_name; end if;
  end loop;

  if to_regprocedure('public.get_pos_sale_return_context(uuid)') is null
    or to_regprocedure('public.create_pos_sale_return(uuid,jsonb,uuid,uuid)') is null then
    raise exception 'Return RPCs are missing';
  end if;

  select count(*) into v_execute_count
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in ('get_pos_sale_return_context', 'create_pos_sale_return')
    and grantee = 'service_role' and privilege_type = 'EXECUTE';
  if v_execute_count <> 2 then raise exception 'Both return RPCs must be executable by service_role'; end if;

  select count(*) into v_client_execute_count
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name in ('get_pos_sale_return_context', 'create_pos_sale_return')
    and grantee in ('PUBLIC', 'anon', 'authenticated') and privilege_type = 'EXECUTE';
  if v_client_execute_count <> 0 then raise exception 'A return RPC is exposed to a client role'; end if;

  select pg_get_functiondef('public.create_pos_sale_return(uuid,jsonb,uuid,uuid)'::regprocedure)
    into v_function_definition;
  if position('for update' in lower(v_function_definition)) = 0
    or position('sales_return_requests' in v_function_definition) = 0
    or position('inventory_balances' in v_function_definition) = 0 then
    raise exception 'Return flow must lock the sale, persist idempotency, and adjust inventory atomically';
  end if;

  select pg_get_viewdef('private.recorded_product_sales'::regclass, true)
    into v_view_definition;
  if position('sales_returns' in v_view_definition) = 0 then
    raise exception 'Item-level sales reporting does not include returns';
  end if;
end;
$$;
