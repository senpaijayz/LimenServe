-- Remove direct client access to historical invoice receivers.
-- The backend calls public.receive_supplier_invoice_stock_idempotent(...),
-- which is service-role-only and owns idempotency/lock ordering. Keep the
-- historical wrappers available to service_role for compatibility until all
-- callers are inventoried, but never expose them to API client roles.

begin;

do $$
declare
  v_signature text;
  v_oid oid;
begin
  foreach v_signature in array array[
    'public.receive_supplier_invoice_stock(jsonb,uuid)',
    'public.receive_existing_supplier_invoice_stock(jsonb,uuid)'
  ] loop
    v_oid := to_regprocedure(v_signature);

    if v_oid is not null then
      execute format('revoke all on function %s from public, anon, authenticated', v_signature);
      execute format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end;
$$;

commit;
