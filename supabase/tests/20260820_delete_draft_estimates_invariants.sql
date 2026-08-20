do $$
declare
  v_definition text;
  v_acl record;
begin
  if to_regprocedure('public.delete_draft_estimate(uuid)') is null then
    raise exception 'Draft estimate delete RPC is missing.';
  end if;

  v_definition := pg_get_functiondef('public.delete_draft_estimate(uuid)'::regprocedure);
  if position('for update' in lower(v_definition)) = 0
     or position('not_draft' in lower(v_definition)) = 0
     or position('status' in lower(v_definition)) = 0 then
    raise exception 'Draft estimate delete RPC must lock and validate status.';
  end if;

  for v_acl in
    select grantee, privilege_type
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    where p.oid = 'public.delete_draft_estimate(uuid)'::regprocedure
  loop
    if v_acl.privilege_type = 'EXECUTE'
       and (v_acl.grantee = 0
         or v_acl.grantee = 'anon'::regrole
         or v_acl.grantee = 'authenticated'::regrole) then
      raise exception 'Draft estimate delete RPC must not be executable by OID %.', v_acl.grantee;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))
    where p.oid = 'public.delete_draft_estimate(uuid)'::regprocedure
      and grantee = 'service_role'::regrole
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'Service role must be able to execute draft estimate delete RPC.';
  end if;
end;
$$;
