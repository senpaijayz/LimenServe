-- Permit administrator role changes/deactivation/deletion only while another
-- active administrator remains. The advisory transaction lock serializes
-- concurrent admin removals across all writers to auth.users.
create or replace function core.guard_auth_user_admin_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_role text := coalesce(old.raw_app_meta_data ->> 'role', '');
  new_role text;
  old_is_admin boolean;
  removes_admin boolean := false;
  remaining_admins integer;
begin
  select exists (
    select 1 from core.user_profiles profile
     where profile.user_id = old.id and profile.role = 'admin'
  ) into old_is_admin;

  if tg_op = 'DELETE' then
    removes_admin := old_role = 'admin' or old_is_admin;
  else
    new_role := coalesce(new.raw_app_meta_data ->> 'role', '');
    removes_admin := (old_role = 'admin' or old_is_admin)
      and (new_role <> 'admin'
        or coalesce(new.raw_app_meta_data ->> 'account_status', 'active') = 'deactivated'
        or (new.banned_until is not null and new.banned_until > pg_catalog.now()));
  end if;

  if removes_admin then
    perform pg_catalog.pg_advisory_xact_lock(736205, 1);
    select count(*)::integer into remaining_admins
      from core.user_profiles profile
      join auth.users auth_user on auth_user.id = profile.user_id
     where profile.role = 'admin'
       and profile.user_id <> old.id
       and auth_user.raw_app_meta_data ->> 'role' = 'admin'
       and coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active') <> 'deactivated'
       and (auth_user.banned_until is null or auth_user.banned_until <= pg_catalog.now());

    if remaining_admins < 1 then
      raise exception using errcode = '23514',
        message = 'LAST_ACTIVE_ADMIN_PROTECTED';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function core.guard_auth_user_admin_safety()
  from public, anon, authenticated, service_role;
