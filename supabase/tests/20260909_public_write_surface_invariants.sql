begin;

do $$
begin
  if has_function_privilege('anon', 'public.create_estimate(jsonb)', 'execute') then
    raise exception 'anon must not execute create_estimate directly';
  end if;

  if has_function_privilege('authenticated', 'public.create_estimate(jsonb)', 'execute') then
    raise exception 'authenticated must not execute create_estimate directly';
  end if;

  if has_function_privilege(
    'anon',
    'public.record_upsell_action(text,uuid,uuid,uuid,uuid,text,uuid,text)',
    'execute'
  ) then
    raise exception 'anon must not execute record_upsell_action directly';
  end if;

  if not has_function_privilege('service_role', 'public.create_estimate(jsonb)', 'execute') then
    raise exception 'service_role must retain create_estimate access for the API';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.record_upsell_action(text,uuid,uuid,uuid,uuid,text,uuid,text)',
    'execute'
  ) then
    raise exception 'service_role must retain record_upsell_action access for the API';
  end if;
end
$$;

rollback;
