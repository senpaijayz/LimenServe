-- Reuse the existing recovery binding for active administrators only.
create or replace function private.limen_admin_email_recovery_eligible(p_account_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    join core.user_profiles p on p.user_id = u.id
    where u.id = p_account_id and p.role = 'admin'
      and u.raw_app_meta_data ->> 'role' = 'admin'
      and coalesce(u.raw_app_meta_data ->> 'account_status', 'active') = 'active'
      and (u.banned_until is null or u.banned_until <= pg_catalog.now())
  );
$$;
revoke all on function private.limen_admin_email_recovery_eligible(uuid) from public, anon, authenticated, service_role;

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
  perform 1 from auth.users where id = p_account_id for update;
  if v_email is null or pg_catalog.length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or not private.limen_admin_email_recovery_eligible(p_account_id)
    or not exists (
      select 1 from auth.users as recovery_user
      where recovery_user.id = p_identity_id
        and pg_catalog.lower(recovery_user.email) = v_email
        and recovery_user.raw_app_meta_data ->> 'role' = 'customer'
        and recovery_user.raw_app_meta_data ->> 'limen_recovery_only' = 'true'
    ) then
    raise exception using errcode = '42501', message = 'ADMIN_OTP_RECOVERY_NOT_ALLOWED';
  end if;

  -- Serialize claims for the same mailbox across pending and verified slots.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 54061));
  if exists (
    select 1 from private.admin_email_otp_recovery r
    where r.account_id <> p_account_id and (
      pg_catalog.lower(r.verified_email) = v_email
      or (pg_catalog.lower(r.pending_email) = v_email and r.pending_expires_at > pg_catalog.now())
    )
  ) then
    raise exception using errcode = '23505', message = 'RECOVERY_EMAIL_IN_USE';
  end if;
  update private.admin_email_otp_recovery
  set pending_identity_id = null, pending_email = null, pending_expires_at = null
  where account_id <> p_account_id and pg_catalog.lower(pending_email) = v_email
    and pending_expires_at <= pg_catalog.now();

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
  perform 1 from auth.users where id = p_account_id for update;
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
    and private.limen_admin_email_recovery_eligible(recovery.account_id);
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
  where recovery.account_id = p_account_id
    and private.limen_admin_email_recovery_eligible(p_account_id);
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
  join auth.users as admin_user on admin_user.id = recovery.account_id
  join auth.users as recovery_user on recovery_user.id = recovery.verified_identity_id
  where recovery.verified_at is not null
    and pg_catalog.lower(pg_catalog.btrim(p_email)) in (
      pg_catalog.lower(admin_user.email), pg_catalog.lower(recovery.verified_email)
    )
    and private.limen_admin_email_recovery_eligible(recovery.account_id)
    and pg_catalog.lower(recovery_user.email) = pg_catalog.lower(recovery.verified_email)
    and recovery_user.raw_app_meta_data ->> 'role' = 'customer'
    and recovery_user.raw_app_meta_data ->> 'limen_recovery_only' = 'true';
$function$;

-- Auth's role update and recovery unlink succeed or roll back together.
-- Deletion is already covered by the account_id foreign keys (ON DELETE CASCADE).
create or replace function private.limen_unlink_admin_recovery_on_role_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.admin_email_otp_recovery where account_id = new.id;
  delete from private.account_recovery_methods where account_id = new.id;
  return new;
end;
$$;
revoke all on function private.limen_unlink_admin_recovery_on_role_change() from public, anon, authenticated, service_role;
create trigger limen_unlink_admin_recovery_on_role_change
after update of raw_app_meta_data on auth.users
for each row
when ((old.raw_app_meta_data ->> 'role') = 'admin'
      and ((new.raw_app_meta_data ->> 'role') is distinct from 'admin'
           or (new.raw_app_meta_data ->> 'account_status') = 'deactivated'))
execute function private.limen_unlink_admin_recovery_on_role_change();
