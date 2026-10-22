-- Protect the existing primary administrator identity and add a server-only
-- store for separately verified recovery contacts and one-time reset tokens.

create schema if not exists private;

create table private.protected_admin_identities (
  user_id uuid primary key references auth.users(id) on delete restrict,
  login_email text not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  constraint protected_admin_identities_login_email_check
    check (pg_catalog.lower(login_email) = 'admin@limen.com')
);

alter table private.protected_admin_identities enable row level security;
revoke all on table private.protected_admin_identities
  from public, anon, authenticated, service_role;
create policy protected_admin_identities_deny_direct_access
  on private.protected_admin_identities for all to public
  using (false) with check (false);

do $migration$
declare
  matching_accounts integer;
  protected_user_id uuid;
begin
  select pg_catalog.count(*)::integer
  into matching_accounts
  from auth.users as auth_user
  where pg_catalog.lower(auth_user.email) = 'admin@limen.com';

  if matching_accounts <> 1 then
    raise exception using
      errcode = '23514',
      message = 'PRIMARY_ADMIN_IDENTITY_NOT_UNIQUE';
  end if;

  select auth_user.id
  into protected_user_id
  from auth.users as auth_user
  join core.user_profiles as profile on profile.user_id = auth_user.id
  where pg_catalog.lower(auth_user.email) = 'admin@limen.com'
    and auth_user.raw_app_meta_data ->> 'role' = 'admin'
    and coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active') = 'active'
    and profile.role = 'admin'
    and (auth_user.banned_until is null or auth_user.banned_until <= pg_catalog.now());

  if protected_user_id is null then
    raise exception using
      errcode = '23514',
      message = 'PRIMARY_ADMIN_IDENTITY_NOT_ACTIVE_ADMIN';
  end if;

  insert into private.protected_admin_identities (user_id, login_email)
  values (protected_user_id, 'admin@limen.com');
end;
$migration$;

create table private.account_recovery_methods (
  account_id uuid primary key references auth.users(id) on delete cascade,
  verified_email text,
  verified_at timestamptz,
  pending_email text,
  pending_token_digest text,
  pending_expires_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint account_recovery_methods_verified_pair_check
    check ((verified_email is null) = (verified_at is null)),
  constraint account_recovery_methods_pending_pair_check
    check (
      (pending_email is null and pending_token_digest is null and pending_expires_at is null)
      or (
        pending_email is not null
        and pending_token_digest ~ '^[0-9a-f]{64}$'
        and pending_expires_at is not null
      )
    )
);

create unique index account_recovery_methods_verified_email_uq
  on private.account_recovery_methods (pg_catalog.lower(verified_email))
  where verified_email is not null;
create unique index account_recovery_methods_pending_email_uq
  on private.account_recovery_methods (pg_catalog.lower(pending_email))
  where pending_email is not null;
create unique index account_recovery_methods_pending_token_uq
  on private.account_recovery_methods (pending_token_digest)
  where pending_token_digest is not null;

alter table private.account_recovery_methods enable row level security;
revoke all on table private.account_recovery_methods
  from public, anon, authenticated, service_role;
create policy account_recovery_methods_deny_direct_access
  on private.account_recovery_methods for all to public
  using (false) with check (false);

create table private.password_recovery_tokens (
  token_digest text primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint password_recovery_tokens_digest_check
    check (token_digest ~ '^[0-9a-f]{64}$'),
  constraint password_recovery_tokens_expiry_check
    check (expires_at > created_at)
);

create index password_recovery_tokens_account_created_idx
  on private.password_recovery_tokens (account_id, created_at desc);
create index password_recovery_tokens_expiry_idx
  on private.password_recovery_tokens (expires_at)
  where consumed_at is null;

alter table private.password_recovery_tokens enable row level security;
revoke all on table private.password_recovery_tokens
  from public, anon, authenticated, service_role;
create policy password_recovery_tokens_deny_direct_access
  on private.password_recovery_tokens for all to public
  using (false) with check (false);

create or replace function core.guard_protected_admin_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from private.protected_admin_identities as protected
    where protected.user_id = old.id
  ) then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;

    if new.id is distinct from old.id
      or pg_catalog.lower(new.email) is distinct from 'admin@limen.com'
      or new.raw_user_meta_data is distinct from old.raw_user_meta_data
      or new.raw_app_meta_data is distinct from old.raw_app_meta_data
      or new.banned_until is distinct from old.banned_until then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function core.guard_protected_admin_identity()
  from public, anon, authenticated, service_role;
drop trigger if exists guard_protected_admin_identity_before_update on auth.users;
create trigger guard_protected_admin_identity_before_update
before update on auth.users
for each row execute function core.guard_protected_admin_identity();
drop trigger if exists guard_protected_admin_identity_before_delete on auth.users;
create trigger guard_protected_admin_identity_before_delete
before delete on auth.users
for each row execute function core.guard_protected_admin_identity();

create or replace function core.guard_protected_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from private.protected_admin_identities as protected
    where protected.user_id = old.user_id
  ) then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;

    if new.user_id is distinct from old.user_id
      or pg_catalog.lower(new.email) is distinct from 'admin@limen.com'
      or new.role is distinct from 'admin' then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function core.guard_protected_admin_profile()
  from public, anon, authenticated, service_role;
drop trigger if exists guard_protected_admin_profile_before_update on core.user_profiles;
create trigger guard_protected_admin_profile_before_update
before update on core.user_profiles
for each row execute function core.guard_protected_admin_profile();
drop trigger if exists guard_protected_admin_profile_before_delete on core.user_profiles;
create trigger guard_protected_admin_profile_before_delete
before delete on core.user_profiles
for each row execute function core.guard_protected_admin_profile();

create or replace function public.lookup_limen_account_for_recovery(p_email text)
returns table (
  account_id uuid,
  login_email text,
  auth_role text,
  profile_role text,
  account_status text,
  banned_until timestamptz,
  recovery_email text,
  recovery_verified_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
  with matching_accounts as (
    select auth_user.id, auth_user.email, auth_user.raw_app_meta_data, auth_user.banned_until
    from auth.users as auth_user
    where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
  )
  select auth_user.id,
         auth_user.email,
         auth_user.raw_app_meta_data ->> 'role',
         profile.role,
         coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active'),
         auth_user.banned_until,
         recovery.verified_email,
         recovery.verified_at
  from matching_accounts as auth_user
  left join core.user_profiles as profile on profile.user_id = auth_user.id
  left join private.account_recovery_methods as recovery on recovery.account_id = auth_user.id
  where (select pg_catalog.count(*) from matching_accounts) = 1;
$function$;

create or replace function public.get_limen_account_security(p_account_id uuid)
returns table (
  login_email text,
  profile_role text,
  is_protected_admin boolean,
  verified_email text,
  verified_at timestamptz,
  pending_email text,
  pending_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
  select auth_user.email,
         profile.role,
         exists (
           select 1 from private.protected_admin_identities as protected
           where protected.user_id = auth_user.id
         ),
         recovery.verified_email,
         recovery.verified_at,
         recovery.pending_email,
         recovery.pending_expires_at
  from auth.users as auth_user
  left join core.user_profiles as profile on profile.user_id = auth_user.id
  left join private.account_recovery_methods as recovery on recovery.account_id = auth_user.id
  where auth_user.id = p_account_id;
$function$;

create or replace function public.begin_limen_recovery_email_verification(
  p_account_id uuid,
  p_email text,
  p_token_digest text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_login_email text;
  v_auth_role text;
  v_profile_role text;
  v_account_status text;
  v_banned_until timestamptz;
  v_existing_verified_email text;
begin
  if v_email is null or length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid recovery email request.';
  end if;

  select auth_user.email,
         auth_user.raw_app_meta_data ->> 'role',
         profile.role,
         coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active'),
         auth_user.banned_until
  into v_login_email, v_auth_role, v_profile_role, v_account_status, v_banned_until
  from auth.users as auth_user
  join core.user_profiles as profile on profile.user_id = auth_user.id
  where auth_user.id = p_account_id;

  if not found or v_auth_role is distinct from v_profile_role
    or v_profile_role not in ('admin', 'cashier', 'stock_clerk')
    or v_account_status <> 'active'
    or (v_banned_until is not null and v_banned_until > pg_catalog.now()) then
    raise exception using errcode = '42501', message = 'Account recovery is unavailable.';
  end if;

  if pg_catalog.lower(v_login_email) = v_email then
    raise exception using errcode = '22023', message = 'Use a different recovery email.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 70261022));

  if exists (
    select 1 from auth.users as auth_user
    where auth_user.id <> p_account_id
      and pg_catalog.lower(auth_user.email) = v_email
  ) or exists (
    select 1 from private.account_recovery_methods as recovery
    where recovery.account_id <> p_account_id
      and (
        pg_catalog.lower(recovery.verified_email) = v_email
        or pg_catalog.lower(recovery.pending_email) = v_email
      )
  ) then
    raise exception using errcode = '23505', message = 'RECOVERY_EMAIL_IN_USE';
  end if;

  select recovery.verified_email
  into v_existing_verified_email
  from private.account_recovery_methods as recovery
  where recovery.account_id = p_account_id;

  if pg_catalog.lower(v_existing_verified_email) = v_email then
    raise exception using errcode = '22023', message = 'Recovery email is already verified.';
  end if;

  insert into private.account_recovery_methods (
    account_id,
    pending_email,
    pending_token_digest,
    pending_expires_at,
    updated_at
  )
  values (
    p_account_id,
    v_email,
    p_token_digest,
    pg_catalog.clock_timestamp() + interval '15 minutes',
    pg_catalog.clock_timestamp()
  )
  on conflict (account_id) do update
  set pending_email = excluded.pending_email,
      pending_token_digest = excluded.pending_token_digest,
      pending_expires_at = excluded.pending_expires_at,
      updated_at = excluded.updated_at;
end;
$function$;

create or replace function public.complete_limen_recovery_email_verification(p_token_digest text)
returns table (account_id uuid, verified_email text, previous_email text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid;
  v_new_email text;
  v_old_email text;
begin
  if p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'RECOVERY_VERIFICATION_INVALID';
  end if;

  select recovery.account_id, recovery.pending_email, recovery.verified_email
  into v_account_id, v_new_email, v_old_email
  from private.account_recovery_methods as recovery
  where recovery.pending_token_digest = p_token_digest
    and recovery.pending_expires_at > pg_catalog.clock_timestamp()
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'RECOVERY_VERIFICATION_INVALID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_new_email, 70261022));

  if exists (
    select 1 from auth.users as auth_user
    where auth_user.id <> v_account_id
      and pg_catalog.lower(auth_user.email) = pg_catalog.lower(v_new_email)
  ) or exists (
    select 1 from private.account_recovery_methods as recovery
    where recovery.account_id <> v_account_id
      and (
        pg_catalog.lower(recovery.verified_email) = pg_catalog.lower(v_new_email)
        or pg_catalog.lower(recovery.pending_email) = pg_catalog.lower(v_new_email)
      )
  ) then
    raise exception using errcode = '23505', message = 'RECOVERY_EMAIL_IN_USE';
  end if;

  update private.account_recovery_methods as recovery
  set verified_email = v_new_email,
      verified_at = pg_catalog.clock_timestamp(),
      pending_email = null,
      pending_token_digest = null,
      pending_expires_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where recovery.account_id = v_account_id
    and recovery.pending_token_digest = p_token_digest;

  return query select v_account_id, v_new_email, v_old_email;
end;
$function$;

create or replace function public.create_limen_password_recovery_token(
  p_account_id uuid,
  p_token_digest text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid recovery request.';
  end if;

  if not exists (
    select 1
    from auth.users as auth_user
    join core.user_profiles as profile on profile.user_id = auth_user.id
    join private.account_recovery_methods as recovery on recovery.account_id = auth_user.id
    where auth_user.id = p_account_id
      and profile.role in ('admin', 'cashier', 'stock_clerk')
      and auth_user.raw_app_meta_data ->> 'role' = profile.role
      and coalesce(auth_user.raw_app_meta_data ->> 'account_status', 'active') = 'active'
      and (auth_user.banned_until is null or auth_user.banned_until <= pg_catalog.now())
      and recovery.verified_email is not null
      and recovery.verified_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Account recovery is unavailable.';
  end if;

  delete from private.password_recovery_tokens as token
  where token.account_id = p_account_id
    and token.consumed_at is null;

  delete from private.password_recovery_tokens as token
  where token.expires_at < pg_catalog.clock_timestamp() - interval '1 day';

  insert into private.password_recovery_tokens (token_digest, account_id, expires_at)
  values (p_token_digest, p_account_id, pg_catalog.clock_timestamp() + interval '15 minutes');
end;
$function$;

create or replace function public.consume_limen_password_recovery_token(p_token_digest text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account_id uuid;
begin
  if p_token_digest is null or p_token_digest !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  update private.password_recovery_tokens as token
  set consumed_at = pg_catalog.clock_timestamp()
  where token.token_digest = p_token_digest
    and token.consumed_at is null
    and token.expires_at > pg_catalog.clock_timestamp()
  returning token.account_id into v_account_id;

  return v_account_id;
end;
$function$;

revoke all on function public.lookup_limen_account_for_recovery(text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_limen_account_security(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_limen_recovery_email_verification(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_limen_recovery_email_verification(text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_limen_password_recovery_token(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_limen_password_recovery_token(text)
  from public, anon, authenticated, service_role;

grant execute on function public.lookup_limen_account_for_recovery(text) to service_role;
grant execute on function public.get_limen_account_security(uuid) to service_role;
grant execute on function public.begin_limen_recovery_email_verification(uuid, text, text) to service_role;
grant execute on function public.complete_limen_recovery_email_verification(text) to service_role;
grant execute on function public.create_limen_password_recovery_token(uuid, text) to service_role;
grant execute on function public.consume_limen_password_recovery_token(text) to service_role;

comment on table private.protected_admin_identities is
  'Server-only immutable administrator identity anchors; the existing LimenServe primary administrator is seeded by email during migration.';
comment on table private.account_recovery_methods is
  'Server-only recovery contact state. A pending contact becomes authoritative only after single-use email verification.';
comment on table private.password_recovery_tokens is
  'Server-only digests of short-lived one-time custom password recovery tokens.';
