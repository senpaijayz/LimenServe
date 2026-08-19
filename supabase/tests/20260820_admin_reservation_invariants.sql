do $$
begin
  if to_regprocedure('public.create_admin_part_reservation(uuid,uuid,uuid,numeric,uuid,text)') is null then
    raise exception 'Admin reservation RPC is missing.';
  end if;

  if has_function_privilege('anon', 'public.create_admin_part_reservation(uuid,uuid,uuid,numeric,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_admin_part_reservation(uuid,uuid,uuid,numeric,uuid,text)', 'execute') then
    raise exception 'Admin reservation RPC is callable by anon/authenticated.';
  end if;

  if not has_function_privilege('service_role', 'public.create_admin_part_reservation(uuid,uuid,uuid,numeric,uuid,text)', 'execute') then
    raise exception 'service_role must execute the admin reservation RPC.';
  end if;
end;
$$;
