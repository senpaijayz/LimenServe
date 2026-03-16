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
