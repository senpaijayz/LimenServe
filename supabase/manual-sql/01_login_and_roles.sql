-- 01 Login and Roles

-- Source: 20260316_000001_core_schema.sql (foundation and user profile helpers)

create extension if not exists pgcrypto;

create schema if not exists app;
create schema if not exists dw;
create schema if not exists ml;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists app.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'cashier', 'staff', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function app.current_app_role()
returns text
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    (
      select up.role
      from app.user_profiles up
      where up.user_id = auth.uid()
      limit 1
    ),
    'anonymous'
  );
$$;

create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() in ('admin', 'cashier', 'staff');
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() = 'admin';
$$;


-- Source: 20260316_000006_user_role_alignment.sql

alter table app.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table app.user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer'));

create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() in ('admin', 'cashier', 'staff', 'stock_clerk');
$$;

