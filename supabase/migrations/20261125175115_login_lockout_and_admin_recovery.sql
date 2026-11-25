-- Track failed staff sign-ins server-side. The browser cannot read or change
-- these records; only the authenticated backend's service-role client can.
create schema if not exists private;

create table if not exists private.account_login_lockouts (
  account_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempts smallint not null default 0
    check (failed_attempts between 0 and 5),
  locked_at timestamptz,
  last_failed_at timestamptz,
  last_unlocked_at timestamptz,
  last_unlocked_by uuid references auth.users(id) on delete set null,
  last_unlock_method text
    check (last_unlock_method is null or last_unlock_method in ('administrator', 'verified_recovery_email')),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint account_login_lockouts_threshold_check
    check (locked_at is null or failed_attempts = 5)
);

alter table private.account_login_lockouts enable row level security;
revoke all on table private.account_login_lockouts from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select, insert, update on table private.account_login_lockouts to service_role;
drop policy if exists account_login_lockouts_service_role_all on private.account_login_lockouts;
create policy account_login_lockouts_service_role_all
  on private.account_login_lockouts for all to service_role
  using (true) with check (true);

-- These invoker RPCs are callable only by the trusted backend service role.
-- They deliberately do not use SECURITY DEFINER or expose private table access
-- to browser roles.
create or replace function public.limen_get_account_login_lockout(p_account_id uuid)
returns table (failed_attempts smallint, locked_at timestamptz)
language sql
security invoker
set search_path = pg_catalog, private
as $function$
  select lockout.failed_attempts, lockout.locked_at
  from private.account_login_lockouts as lockout
  where lockout.account_id = p_account_id;
$function$;

create or replace function public.limen_record_account_login_failure(p_account_id uuid)
returns table (failed_attempts smallint, locked_at timestamptz)
language plpgsql
security invoker
set search_path = pg_catalog, private
as $function$
begin
  if p_account_id is null then
    raise exception using errcode = '22023', message = 'LOGIN_ACCOUNT_REQUIRED';
  end if;

  return query
  insert into private.account_login_lockouts as current_lockout (
    account_id, failed_attempts, last_failed_at, updated_at
  ) values (
    p_account_id, 1, pg_catalog.now(), pg_catalog.now()
  )
  on conflict (account_id) do update
  set failed_attempts = case
        when current_lockout.locked_at is not null then 5
        else least(5, current_lockout.failed_attempts + 1)::smallint
      end,
      locked_at = case
        when current_lockout.locked_at is not null then current_lockout.locked_at
        when current_lockout.failed_attempts + 1 >= 5 then pg_catalog.now()
        else null
      end,
      last_failed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  returning current_lockout.failed_attempts, current_lockout.locked_at;
end;
$function$;

create or replace function public.limen_record_account_login_success(p_account_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, private
as $function$
begin
  if p_account_id is null then
    return false;
  end if;

  insert into private.account_login_lockouts (account_id, failed_attempts)
  values (p_account_id, 0)
  on conflict (account_id) do nothing;

  update private.account_login_lockouts
  set failed_attempts = 0,
      locked_at = null,
      last_failed_at = null,
      updated_at = pg_catalog.now()
  where account_id = p_account_id
    and locked_at is null;

  return found;
end;
$function$;

create or replace function public.limen_unlock_account_login(
  p_account_id uuid,
  p_actor_user_id uuid,
  p_method text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, private
as $function$
begin
  if p_account_id is null
    or p_method not in ('administrator', 'verified_recovery_email')
    or (p_method = 'administrator' and p_actor_user_id is null)
    or (p_method = 'verified_recovery_email' and p_actor_user_id is not null) then
    raise exception using errcode = '22023', message = 'LOGIN_UNLOCK_REQUEST_INVALID';
  end if;

  update private.account_login_lockouts
  set failed_attempts = 0,
      locked_at = null,
      last_failed_at = null,
      last_unlocked_at = pg_catalog.now(),
      last_unlocked_by = p_actor_user_id,
      last_unlock_method = p_method,
      updated_at = pg_catalog.now()
  where account_id = p_account_id
    and locked_at is not null;

  return found;
end;
$function$;

create or replace function public.limen_list_account_login_lockouts()
returns table (
  account_id uuid,
  failed_attempts smallint,
  locked_at timestamptz,
  last_unlocked_at timestamptz,
  last_unlock_method text
)
language sql
security invoker
set search_path = pg_catalog, private
as $function$
  select lockout.account_id,
         lockout.failed_attempts,
         lockout.locked_at,
         lockout.last_unlocked_at,
         lockout.last_unlock_method
  from private.account_login_lockouts as lockout
  where lockout.failed_attempts > 0
     or lockout.locked_at is not null
     or lockout.last_unlocked_at is not null;
$function$;

revoke all on function public.limen_get_account_login_lockout(uuid) from public, anon, authenticated;
revoke all on function public.limen_record_account_login_failure(uuid) from public, anon, authenticated;
revoke all on function public.limen_record_account_login_success(uuid) from public, anon, authenticated;
revoke all on function public.limen_unlock_account_login(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.limen_list_account_login_lockouts() from public, anon, authenticated;
grant execute on function public.limen_get_account_login_lockout(uuid) to service_role;
grant execute on function public.limen_record_account_login_failure(uuid) to service_role;
grant execute on function public.limen_record_account_login_success(uuid) to service_role;
grant execute on function public.limen_unlock_account_login(uuid, uuid, text) to service_role;
grant execute on function public.limen_list_account_login_lockouts() to service_role;
