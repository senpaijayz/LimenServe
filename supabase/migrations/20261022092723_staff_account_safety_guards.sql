create or replace function core.guard_auth_user_admin_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_role text := coalesce(old.raw_app_meta_data ->> 'role', '');
  new_role text;
  new_account_status text;
  remaining_admins integer;
begin
  if tg_op = 'DELETE' then
    if old_role = 'admin' or exists (
      select 1
      from core.user_profiles as profile
      where profile.user_id = old.id
        and profile.role = 'admin'
    ) then
      raise exception using
        errcode = '23514',
        message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;

    return old;
  end if;

  new_role := coalesce(new.raw_app_meta_data ->> 'role', '');
  new_account_status := coalesce(new.raw_app_meta_data ->> 'account_status', 'active');

  if old_role = 'admin' and new_account_status = 'deactivated' then
    raise exception using
      errcode = '23514',
      message = 'ADMIN_ACCOUNT_PROTECTED';
  end if;

  if old_role = 'admin' and (
    new_role is distinct from old_role
    or new.banned_until is distinct from old.banned_until
  ) then
    if new.banned_until is not null and new.banned_until > pg_catalog.now() then
      perform pg_catalog.pg_advisory_xact_lock(736205, 1);
      select pg_catalog.count(*)::integer
      into remaining_admins
      from core.user_profiles as profile
      join auth.users as auth_user on auth_user.id = profile.user_id
      where profile.role = 'admin'
        and profile.user_id <> old.id
        and coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active') <> 'deactivated'
        and (auth_user.banned_until is null or auth_user.banned_until <= pg_catalog.now());

      if remaining_admins = 0 then
        raise exception using
          errcode = '23514',
          message = 'LAST_ACTIVE_ADMIN_PROTECTED';
      end if;
    elsif new_role is distinct from old_role then
      perform pg_catalog.pg_advisory_xact_lock(736205, 1);
      select pg_catalog.count(*)::integer
      into remaining_admins
      from core.user_profiles as profile
      join auth.users as auth_user on auth_user.id = profile.user_id
      where profile.role = 'admin'
        and profile.user_id <> old.id
        and coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active') <> 'deactivated'
        and (auth_user.banned_until is null or auth_user.banned_until <= pg_catalog.now());

      if remaining_admins = 0 then
        raise exception using
          errcode = '23514',
          message = 'LAST_ACTIVE_ADMIN_PROTECTED';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function core.guard_auth_user_admin_safety() from public, anon, authenticated, service_role;

drop trigger if exists guard_auth_user_admin_safety_before_update on auth.users;
create trigger guard_auth_user_admin_safety_before_update
before update on auth.users
for each row
execute function core.guard_auth_user_admin_safety();

drop trigger if exists guard_auth_user_admin_safety_before_delete on auth.users;
create trigger guard_auth_user_admin_safety_before_delete
before delete on auth.users
for each row
execute function core.guard_auth_user_admin_safety();
