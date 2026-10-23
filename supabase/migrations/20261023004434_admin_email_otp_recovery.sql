-- The protected administrator keeps admin@limen.com as the Auth login.
-- A separate, customer-role Auth identity proves ownership of the recovery
-- mailbox through Supabase's built-in email OTP delivery.
create table private.admin_email_otp_recovery (
  account_id uuid primary key references auth.users(id) on delete cascade,
  verified_identity_id uuid unique references auth.users(id) on delete cascade,
  verified_email text,
  verified_at timestamptz,
  pending_identity_id uuid references auth.users(id) on delete cascade,
  pending_email text,
  pending_expires_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint admin_email_otp_verified_pair_check check (
    (verified_identity_id is null and verified_email is null and verified_at is null)
    or (verified_identity_id is not null and verified_email is not null and verified_at is not null)
  ),
  constraint admin_email_otp_pending_pair_check check (
    (pending_identity_id is null and pending_email is null and pending_expires_at is null)
    or (pending_identity_id is not null and pending_email is not null and pending_expires_at is not null)
  )
);

create unique index admin_email_otp_verified_email_uq
  on private.admin_email_otp_recovery (pg_catalog.lower(verified_email))
  where verified_email is not null;
create unique index admin_email_otp_pending_email_uq
  on private.admin_email_otp_recovery (pg_catalog.lower(pending_email))
  where pending_email is not null;

alter table private.admin_email_otp_recovery enable row level security;
revoke all on table private.admin_email_otp_recovery from public, anon, authenticated, service_role;
create policy admin_email_otp_deny_direct_access
  on private.admin_email_otp_recovery for all to public
  using (false) with check (false);

create or replace function public.find_limen_recovery_identity(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select auth_user.id
  from auth.users as auth_user
  where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(p_email))
    and auth_user.raw_app_meta_data ->> 'role' = 'customer'
    and auth_user.raw_app_meta_data ->> 'limen_recovery_only' = 'true'
  limit 1;
$function$;

create or replace function public.begin_limen_admin_otp_recovery(
  p_account_id uuid,
  p_identity_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
begin
  if v_email is null or pg_catalog.length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or not exists (
      select 1 from private.protected_admin_identities as protected
      join auth.users as admin_user on admin_user.id = protected.user_id
      join core.user_profiles as profile on profile.user_id = admin_user.id
      where protected.user_id = p_account_id
        and pg_catalog.lower(admin_user.email) = 'admin@limen.com'
        and admin_user.raw_app_meta_data ->> 'role' = 'admin'
        and profile.role = 'admin'
        and coalesce(admin_user.raw_app_meta_data ->> 'account_status', 'active') = 'active'
    )
    or not exists (
      select 1 from auth.users as recovery_user
      where recovery_user.id = p_identity_id
        and pg_catalog.lower(recovery_user.email) = v_email
        and recovery_user.raw_app_meta_data ->> 'role' = 'customer'
        and recovery_user.raw_app_meta_data ->> 'limen_recovery_only' = 'true'
    ) then
    raise exception using errcode = '42501', message = 'ADMIN_OTP_RECOVERY_NOT_ALLOWED';
  end if;

  insert into private.admin_email_otp_recovery (
    account_id, pending_identity_id, pending_email, pending_expires_at
  ) values (
    p_account_id, p_identity_id, v_email, pg_catalog.now() + interval '15 minutes'
  )
  on conflict (account_id) do update
    set pending_identity_id = excluded.pending_identity_id,
        pending_email = excluded.pending_email,
        pending_expires_at = excluded.pending_expires_at,
        updated_at = pg_catalog.now();
end;
$function$;

create or replace function public.complete_limen_admin_otp_recovery(
  p_account_id uuid,
  p_identity_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer;
begin
  update private.admin_email_otp_recovery as recovery
  set verified_identity_id = p_identity_id,
      verified_email = pg_catalog.lower(pg_catalog.btrim(p_email)),
      verified_at = pg_catalog.now(),
      pending_identity_id = null,
      pending_email = null,
      pending_expires_at = null,
      updated_at = pg_catalog.now()
  where recovery.account_id = p_account_id
    and recovery.pending_identity_id = p_identity_id
    and recovery.pending_email = pg_catalog.lower(pg_catalog.btrim(p_email))
    and recovery.pending_expires_at > pg_catalog.now()
    and exists (
      select 1 from auth.users as recovery_user
      where recovery_user.id = p_identity_id
        and pg_catalog.lower(recovery_user.email) = recovery.pending_email
        and recovery_user.raw_app_meta_data ->> 'role' = 'customer'
        and recovery_user.raw_app_meta_data ->> 'limen_recovery_only' = 'true'
    )
    and exists (
      select 1 from private.protected_admin_identities as protected
      join auth.users as admin_user on admin_user.id = protected.user_id
      join core.user_profiles as profile on profile.user_id = admin_user.id
      where protected.user_id = recovery.account_id
        and pg_catalog.lower(admin_user.email) = 'admin@limen.com'
        and admin_user.raw_app_meta_data ->> 'role' = 'admin'
        and profile.role = 'admin'
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

create or replace function public.get_limen_admin_otp_recovery(p_account_id uuid)
returns table (
  verified_email text,
  verified_at timestamptz,
  pending_email text,
  pending_expires_at timestamptz
)
language sql
security definer
set search_path = ''
as $function$
  select recovery.verified_email,
         recovery.verified_at,
         recovery.pending_email,
         recovery.pending_expires_at
  from private.admin_email_otp_recovery as recovery
  join private.protected_admin_identities as protected
    on protected.user_id = recovery.account_id
  where recovery.account_id = p_account_id;
$function$;

create or replace function public.lookup_limen_admin_otp_recovery(p_email text)
returns table (
  account_id uuid,
  login_email text,
  recovery_email text,
  identity_id uuid
)
language sql
security definer
set search_path = ''
as $function$
  select admin_user.id,
         admin_user.email,
         recovery.verified_email,
         recovery.verified_identity_id
  from private.admin_email_otp_recovery as recovery
  join private.protected_admin_identities as protected
    on protected.user_id = recovery.account_id
  join auth.users as admin_user on admin_user.id = recovery.account_id
  join core.user_profiles as profile on profile.user_id = admin_user.id
  join auth.users as recovery_user on recovery_user.id = recovery.verified_identity_id
  where recovery.verified_at is not null
    and pg_catalog.lower(pg_catalog.btrim(p_email)) in (
      pg_catalog.lower(admin_user.email), pg_catalog.lower(recovery.verified_email)
    )
    and pg_catalog.lower(admin_user.email) = 'admin@limen.com'
    and admin_user.raw_app_meta_data ->> 'role' = 'admin'
    and profile.role = 'admin'
    and coalesce(admin_user.raw_app_meta_data ->> 'account_status', 'active') = 'active'
    and (admin_user.banned_until is null or admin_user.banned_until <= pg_catalog.now())
    and pg_catalog.lower(recovery_user.email) = pg_catalog.lower(recovery.verified_email)
    and recovery_user.raw_app_meta_data ->> 'role' = 'customer'
    and recovery_user.raw_app_meta_data ->> 'limen_recovery_only' = 'true';
$function$;

revoke all on function public.find_limen_recovery_identity(text) from public, anon, authenticated;
revoke all on function public.begin_limen_admin_otp_recovery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_limen_admin_otp_recovery(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_limen_admin_otp_recovery(uuid) from public, anon, authenticated;
revoke all on function public.lookup_limen_admin_otp_recovery(text) from public, anon, authenticated;
grant execute on function public.find_limen_recovery_identity(text) to service_role;
grant execute on function public.begin_limen_admin_otp_recovery(uuid, uuid, text) to service_role;
grant execute on function public.complete_limen_admin_otp_recovery(uuid, uuid, text) to service_role;
grant execute on function public.get_limen_admin_otp_recovery(uuid) to service_role;
grant execute on function public.lookup_limen_admin_otp_recovery(text) to service_role;
