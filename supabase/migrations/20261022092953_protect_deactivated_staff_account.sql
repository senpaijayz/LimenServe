create or replace function core.guard_auth_user_admin_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_role text := coalesce(old.raw_app_meta_data ->> 'role', '');
  old_account_status text := coalesce(old.raw_app_meta_data ->> 'account_status', 'active');
  old_former_staff_role text := coalesce(old.raw_app_meta_data ->> 'former_staff_role', '');
  new_role text;
  new_account_status text;
  new_former_staff_role text;
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
  new_former_staff_role := coalesce(new.raw_app_meta_data ->> 'former_staff_role', '');

  if old_account_status = 'deactivated' then
    if new_account_status = 'deactivated' and new_role = old_role then
      return new;
    end if;

    if new_account_status = 'active'
      and old_former_staff_role in ('cashier', 'stock_clerk')
      and new_role = old_former_staff_role
      and new_former_staff_role = ''
      and (new.banned_until is null or new.banned_until <= pg_catalog.now())
    then
      return new;
    end if;

    raise exception using
      errcode = '23514',
      message = 'DEACTIVATED_ACCOUNT_LOCKED';
  end if;

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
