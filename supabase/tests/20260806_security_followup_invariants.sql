-- Run after 20260806101020_move_rls_helpers_to_private_schema.sql.
-- This file is read-only.

do $$
begin
  if to_regnamespace('private') is null then
    raise exception 'private schema is missing';
  end if;

  if to_regprocedure('app.current_app_role()') is not null
     or to_regprocedure('app.is_internal_user()') is not null
     or to_regprocedure('app.is_admin()') is not null
     or to_regprocedure('app.can_manage_stockroom()') is not null
     or to_regprocedure('app.can_view_stockroom_layout(uuid)') is not null then
    raise exception 'authorization helpers remain exposed in app';
  end if;

  if to_regprocedure('private.current_app_role()') is null
     or to_regprocedure('private.is_internal_user()') is null
     or to_regprocedure('private.is_admin()') is null
     or to_regprocedure('private.can_manage_stockroom()') is null
     or to_regprocedure('private.can_view_stockroom_layout(uuid)') is null then
    raise exception 'private authorization helpers are incomplete';
  end if;

  if has_schema_privilege('anon', 'private', 'usage')
     or not has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'private schema privileges are incorrect';
  end if;

  if has_function_privilege('anon', 'private.is_admin()', 'execute')
     or not has_function_privilege(
       'authenticated',
       'private.is_admin()',
       'execute'
     ) then
    raise exception 'private helper privileges are incorrect';
  end if;

  if exists (
    select 1
    from pg_policies
    where coalesce(qual, '') ~
      'app\.(current_app_role|is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
       or coalesce(with_check, '') ~
      'app\.(current_app_role|is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
  ) then
    raise exception 'an RLS policy references an exposed authorization helper';
  end if;

  if not exists (
    select 1
    from pg_policies
    where coalesce(qual, '') ~
      'private\.(is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
       or coalesce(with_check, '') ~
      'private\.(is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
  ) then
    raise exception 'RLS policies do not reference private authorization helpers';
  end if;

  if not pg_get_functiondef(
    'private.can_manage_stockroom()'::regprocedure
  ) ~ 'stockroom\.admin_users' then
    raise exception 'stockroom manager helper uses the wrong admin table';
  end if;

  if not pg_get_functiondef(
    'private.can_view_stockroom_layout(uuid)'::regprocedure
  ) ~ 'stockroom\.layouts' then
    raise exception 'stockroom viewer helper uses the wrong layouts table';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (
      ('core', 'touch_updated_at'),
      ('catalog', 'set_updated_at'),
      ('catalog', 'post_ocr_scan_to_receipt')
    )
      and p.proconfig is null
  ) then
    raise exception 'a hardened function still has a mutable search_path';
  end if;
end;
$$;
