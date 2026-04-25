create extension if not exists pgcrypto;

create schema if not exists core;

create table if not exists core.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function core.touch_updated_at()
returns trigger
language plpgsql
set search_path = core, public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_core_user_profiles_updated_at on core.user_profiles;
create trigger trg_core_user_profiles_updated_at
before update on core.user_profiles
for each row
execute function core.touch_updated_at();

create or replace function core.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = core, auth, public
as $$
declare
  next_role text;
begin
  next_role := case
    when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
      then new.raw_app_meta_data ->> 'role'
    else 'customer'
  end;

  insert into core.user_profiles (
    user_id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    next_role
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, core.user_profiles.full_name),
    role = excluded.role,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function core.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = core, auth, public
as $$
declare
  existing_role text;
  next_role text;
begin
  select up.role
  into existing_role
  from core.user_profiles up
  where up.user_id = new.id
  limit 1;

  next_role := case
    when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
      then new.raw_app_meta_data ->> 'role'
    else coalesce(existing_role, 'customer')
  end;

  insert into core.user_profiles (
    user_id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    next_role
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, core.user_profiles.full_name),
    role = excluded.role,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function core.handle_auth_user_created();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function core.handle_auth_user_updated();

drop function if exists public.admin_upsert_user_profile(uuid, text, text, text);
drop function if exists core.admin_upsert_user_profile(uuid, text, text, text);

create function core.admin_upsert_user_profile(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_role text default 'staff'
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
    when p_role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer') then p_role
    else 'staff'
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
  on conflict (user_id) do update
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
  from core.user_profiles up
  where up.user_id = p_user_id
  limit 1;
end;
$$;

create function public.admin_upsert_user_profile(
  p_user_id uuid,
  p_email text default null,
  p_full_name text default null,
  p_role text default 'staff'
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

grant usage on schema core to authenticated, service_role;
revoke execute on function core.admin_upsert_user_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function core.admin_upsert_user_profile(uuid, text, text, text) to service_role;
revoke execute on function public.admin_upsert_user_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_upsert_user_profile(uuid, text, text, text) to service_role;
