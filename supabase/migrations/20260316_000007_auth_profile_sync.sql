create or replace function app.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = app, auth, public
as $$
begin
  insert into app.user_profiles (
    user_id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
        then new.raw_app_meta_data ->> 'role'
      else 'customer'
    end
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, app.user_profiles.full_name),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function app.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = app, auth, public
as $$
begin
  update app.user_profiles
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data ->> 'full_name', app.user_profiles.full_name),
    role = case
      when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
        then new.raw_app_meta_data ->> 'role'
      else app.user_profiles.role
    end,
    updated_at = timezone('utc', now())
  where user_id = new.id;

  if not found then
    insert into app.user_profiles (
      user_id,
      email,
      full_name,
      role
    )
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
      case
        when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
          then new.raw_app_meta_data ->> 'role'
        else 'customer'
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_auth_user_created();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function app.handle_auth_user_updated();

insert into app.user_profiles (
  user_id,
  email,
  full_name,
  role
)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(coalesce(au.email, ''), '@', 1)),
  case
    when coalesce(au.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
      then au.raw_app_meta_data ->> 'role'
    else 'customer'
  end
from auth.users au
on conflict (user_id) do update
set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, app.user_profiles.full_name),
  role = case
    when excluded.role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
      then excluded.role
    else app.user_profiles.role
  end,
  updated_at = timezone('utc', now());
