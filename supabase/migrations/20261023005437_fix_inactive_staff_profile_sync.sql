-- Preserve the non-staff customer role when an administrator deactivates a
-- Cashier or Clerk. Previously this RPC silently converted customer back to
-- stock_clerk, leaving Auth and the staff profile out of sync.
create or replace function core.admin_upsert_user_profile(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_role text default 'stock_clerk'
)
returns table (id uuid, user_id uuid, email text, full_name text, role text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  next_role text;
begin
  next_role := case
    when p_role in ('admin', 'cashier', 'stock_clerk', 'customer') then p_role
    when p_role in ('staff', 'viewer', 'clerk') then 'stock_clerk'
    else 'stock_clerk'
  end;

  insert into core.user_profiles (user_id, email, full_name, role)
  values (p_user_id, nullif(p_email, ''), nullif(p_full_name, ''), next_role)
  on conflict on constraint user_profiles_user_id_key do update
  set email = coalesce(excluded.email, core.user_profiles.email),
      full_name = coalesce(excluded.full_name, core.user_profiles.full_name),
      role = excluded.role,
      updated_at = pg_catalog.timezone('utc', pg_catalog.now());

  return query
  select profile.id, profile.user_id, profile.email, profile.full_name, profile.role
  from core.user_profiles as profile
  where profile.user_id = p_user_id
  limit 1;
end;
$function$;

-- Repair only accounts that already have the explicit, trusted inactive-staff
-- marker. Never alter an administrator or an active account.
update core.user_profiles as profile
set role = 'customer'
from auth.users as auth_user
where profile.user_id = auth_user.id
  and auth_user.raw_app_meta_data ->> 'account_status' = 'deactivated'
  and auth_user.raw_app_meta_data ->> 'role' = 'customer'
  and auth_user.raw_app_meta_data ->> 'former_staff_role' in ('cashier', 'stock_clerk')
  and profile.role in ('cashier', 'stock_clerk')
  and not exists (
    select 1 from private.protected_admin_identities as protected
    where protected.user_id = auth_user.id
  );
