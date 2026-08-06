-- Security baseline for the existing production schema.
-- This migration is intentionally additive/restrictive: it changes privileges and
-- policies without deleting application data.

create or replace function app.current_app_role()
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

create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app, core, auth
as $$
  select app.current_app_role() in ('admin', 'cashier', 'staff', 'stock_clerk');
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app, core, auth
as $$
  select app.current_app_role() = 'admin';
$$;

-- SECURITY DEFINER functions are granted to PUBLIC by PostgreSQL unless that
-- privilege is explicitly removed. The application calls RPCs through the
-- Render service-role client, so browser roles do not need direct execution.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as identity
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in (
        'app', 'public', 'catalog', 'operations', 'core', 'cms',
        'stockroom', 'reco', 'ml'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      fn.identity
    );
    execute format(
      'grant execute on function %s to service_role',
      fn.identity
    );
  end loop;
end;
$$;

-- These helpers are evaluated by existing authenticated RLS policies.
grant execute on function app.current_app_role() to authenticated, service_role;
grant execute on function app.is_internal_user() to authenticated, service_role;
grant execute on function app.is_admin() to authenticated, service_role;

do $$
begin
  if to_regprocedure('app.can_manage_stockroom()') is not null then
    execute 'grant execute on function app.can_manage_stockroom() to authenticated, service_role';
  end if;

  if to_regprocedure('app.can_view_stockroom_layout(uuid)') is not null then
    execute 'grant execute on function app.can_view_stockroom_layout(uuid) to authenticated, service_role';
  end if;
end;
$$;

-- Profiles are provisioned by trusted Auth triggers and managed through the
-- backend. Browser users may read only their own row and cannot modify roles.
revoke insert, update, delete on core.user_profiles from anon, authenticated;
grant select on core.user_profiles to authenticated, service_role;

drop policy if exists user_profiles_self_insert on core.user_profiles;
drop policy if exists user_profiles_self_update on core.user_profiles;
drop policy if exists user_profiles_self_select on core.user_profiles;

create policy user_profiles_self_select
on core.user_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or (select app.is_admin())
);

-- Make application views obey the caller's access rules on PostgreSQL 17.
alter view if exists public.inventory_movements set (security_invoker = true);
alter view if exists ml.v_top_upsell_opportunities set (security_invoker = true);
alter view if exists ml.v_predicted_low_stock_risk set (security_invoker = true);
alter view if exists ml.v_product_forecast_vs_actual set (security_invoker = true);

-- ML tables are backend-only. RLS is enabled as defense in depth and browser
-- roles are explicitly denied; the service role remains available to Render.
alter table if exists ml.vehicle_bundle_rules enable row level security;
alter table if exists ml.product_association_rules enable row level security;
alter table if exists ml.service_association_rules enable row level security;
alter table if exists ml.product_monthly_forecasts enable row level security;
alter table if exists ml.service_monthly_forecasts enable row level security;

-- Document the only intended caller explicitly. The service role bypasses RLS,
-- but these policies keep the backend-only contract visible to security tooling.
drop policy if exists vehicle_bundle_rules_service_role_all
  on ml.vehicle_bundle_rules;
create policy vehicle_bundle_rules_service_role_all
on ml.vehicle_bundle_rules
for all to service_role
using (true)
with check (true);

drop policy if exists product_association_rules_service_role_all
  on ml.product_association_rules;
create policy product_association_rules_service_role_all
on ml.product_association_rules
for all to service_role
using (true)
with check (true);

drop policy if exists service_association_rules_service_role_all
  on ml.service_association_rules;
create policy service_association_rules_service_role_all
on ml.service_association_rules
for all to service_role
using (true)
with check (true);

drop policy if exists product_monthly_forecasts_service_role_all
  on ml.product_monthly_forecasts;
create policy product_monthly_forecasts_service_role_all
on ml.product_monthly_forecasts
for all to service_role
using (true)
with check (true);

drop policy if exists service_monthly_forecasts_service_role_all
  on ml.service_monthly_forecasts;
create policy service_monthly_forecasts_service_role_all
on ml.service_monthly_forecasts
for all to service_role
using (true)
with check (true);

revoke all on table
  ml.vehicle_bundle_rules,
  ml.product_association_rules,
  ml.service_association_rules,
  ml.product_monthly_forecasts,
  ml.service_monthly_forecasts
from anon, authenticated;

grant all on table
  ml.vehicle_bundle_rules,
  ml.product_association_rules,
  ml.service_association_rules,
  ml.product_monthly_forecasts,
  ml.service_monthly_forecasts
to service_role;
