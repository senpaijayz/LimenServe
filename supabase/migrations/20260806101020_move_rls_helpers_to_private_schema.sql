-- Production migration version: 20260806101020.
-- Keep SECURITY DEFINER authorization helpers available to RLS without
-- exposing them as PostgREST RPC endpoints. Moving a function preserves its
-- OID, so existing policy dependencies follow it to the private schema.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

alter function app.current_app_role()
  set schema private;
alter function app.is_internal_user()
  set schema private;
alter function app.is_admin()
  set schema private;
alter function app.can_manage_stockroom()
  set schema private;
alter function app.can_view_stockroom_layout(uuid)
  set schema private;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, core, auth
as $$
  select coalesce(
    (
      select up.role
      from core.user_profiles up
      where up.user_id = auth.uid()
      limit 1
    ),
    'anonymous'
  );
$$;

create or replace function private.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, core, auth
as $$
  select private.current_app_role() in (
    'admin',
    'cashier',
    'staff',
    'stock_clerk'
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, core, auth
as $$
  select private.current_app_role() = 'admin';
$$;

create or replace function private.can_manage_stockroom()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, stockroom, auth
as $$
  select private.current_app_role() = 'admin'
    or exists (
      select 1
      from stockroom.admin_users au
      where au.user_id = auth.uid()
        and au.is_active
    );
$$;

create or replace function private.can_view_stockroom_layout(p_layout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, stockroom
as $$
  select private.can_manage_stockroom()
    or exists (
      select 1
      from stockroom.layouts l
      where l.id = p_layout_id
        and l.status = 'published'
    );
$$;

revoke all on function private.current_app_role()
  from public, anon;
revoke all on function private.is_internal_user()
  from public, anon;
revoke all on function private.is_admin()
  from public, anon;
revoke all on function private.can_manage_stockroom()
  from public, anon;
revoke all on function private.can_view_stockroom_layout(uuid)
  from public, anon;

grant execute on function private.current_app_role()
  to authenticated, service_role;
grant execute on function private.is_internal_user()
  to authenticated, service_role;
grant execute on function private.is_admin()
  to authenticated, service_role;
grant execute on function private.can_manage_stockroom()
  to authenticated, service_role;
grant execute on function private.can_view_stockroom_layout(uuid)
  to authenticated, service_role;

-- These existing functions were the remaining role-mutable search_path
-- warnings. Their bodies use fully qualified application objects.
alter function core.touch_updated_at()
  set search_path = pg_catalog;
alter function catalog.set_updated_at()
  set search_path = pg_catalog;
alter function catalog.post_ocr_scan_to_receipt(uuid, uuid)
  set search_path = pg_catalog, catalog;

do $checks$
begin
  if to_regprocedure('app.current_app_role()') is not null
     or to_regprocedure('app.is_internal_user()') is not null
     or to_regprocedure('app.is_admin()') is not null
     or to_regprocedure('app.can_manage_stockroom()') is not null
     or to_regprocedure('app.can_view_stockroom_layout(uuid)') is not null then
    raise exception 'One or more exposed authorization helpers remain in app.';
  end if;

  if to_regprocedure('private.current_app_role()') is null
     or to_regprocedure('private.is_internal_user()') is null
     or to_regprocedure('private.is_admin()') is null
     or to_regprocedure('private.can_manage_stockroom()') is null
     or to_regprocedure('private.can_view_stockroom_layout(uuid)') is null then
    raise exception 'One or more private authorization helpers are missing.';
  end if;

  if has_schema_privilege('anon', 'private', 'usage')
     or not has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'Private schema privileges are incorrect.';
  end if;

  if has_function_privilege('anon', 'private.is_admin()', 'execute')
     or not has_function_privilege(
       'authenticated',
       'private.is_admin()',
       'execute'
     ) then
    raise exception 'Private authorization helper privileges are incorrect.';
  end if;

  if exists (
    select 1
    from pg_policies
    where coalesce(qual, '') ~
      'app\.(current_app_role|is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
       or coalesce(with_check, '') ~
      'app\.(current_app_role|is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
  ) then
    raise exception 'An RLS policy still references an exposed app helper.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where coalesce(qual, '') ~
      'private\.(is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
       or coalesce(with_check, '') ~
      'private\.(is_admin|is_internal_user|can_manage_stockroom|can_view_stockroom_layout)'
  ) then
    raise exception 'RLS policy dependencies did not follow the moved helpers.';
  end if;
end
$checks$;
