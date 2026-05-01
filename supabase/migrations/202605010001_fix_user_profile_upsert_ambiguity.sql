create or replace function core.admin_upsert_user_profile(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_role text default 'stock_clerk'
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text
)
language plpgsql
security definer
set search_path = core, auth, public
as $$
declare
  next_role text;
begin
  next_role := case
    when p_role in ('admin', 'cashier', 'stock_clerk') then p_role
    when p_role in ('staff', 'viewer', 'customer', 'clerk') then 'stock_clerk'
    else 'stock_clerk'
  end;

  insert into core.user_profiles (
    user_id,
    email,
    full_name,
    role
  )
  values (
    p_user_id,
    nullif(p_email, ''),
    nullif(p_full_name, ''),
    next_role
  )
  on conflict on constraint user_profiles_user_id_key do update
  set
    email = coalesce(excluded.email, core.user_profiles.email),
    full_name = coalesce(excluded.full_name, core.user_profiles.full_name),
    role = excluded.role,
    updated_at = timezone('utc', now());

  return query
  select
    up.id,
    up.user_id,
    up.email,
    up.full_name,
    up.role
  from core.user_profiles as up
  where up.user_id = p_user_id
  limit 1;
end;
$$;

create or replace function public.admin_upsert_user_profile(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_role text default 'stock_clerk'
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text
)
language sql
set search_path = public, core
as $$
  select *
  from core.admin_upsert_user_profile(p_user_id, p_email, p_full_name, p_role);
$$;

revoke execute on function core.admin_upsert_user_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function core.admin_upsert_user_profile(uuid, text, text, text) to service_role;

revoke execute on function public.admin_upsert_user_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_upsert_user_profile(uuid, text, text, text) to service_role;
