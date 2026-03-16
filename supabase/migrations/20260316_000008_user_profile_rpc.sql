create or replace function public.get_user_profile_by_user_id(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text
)
language sql
security definer
set search_path = public, app
as $$
  select
    up.id,
    up.user_id,
    up.email,
    up.full_name,
    up.role
  from app.user_profiles up
  where up.user_id = p_user_id
  limit 1;
$$;

revoke execute on function public.get_user_profile_by_user_id(uuid) from public;
grant execute on function public.get_user_profile_by_user_id(uuid) to authenticated;
