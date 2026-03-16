-- 09 Security, Policies, and Grants
-- Source: 20260316_000004_seed_and_security.sql

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'user_profiles',
    'products',
    'product_prices',
    'inventory_balances',
    'inventory_movements',
    'customers',
    'vehicles',
    'services',
    'estimates',
    'estimate_items',
    'sales_transactions',
    'sales_transaction_items',
    'service_orders',
    'service_order_items',
    'upsell_interactions'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on app.%1$s', tbl);
    execute format('create trigger set_%1$s_updated_at before update on app.%1$s for each row execute function app.touch_updated_at()', tbl);
    execute format('alter table app.%I enable row level security', tbl);
  end loop;

  execute 'alter table app.analytics_refresh_runs enable row level security';
end;
$$;

drop policy if exists user_profiles_self_select on app.user_profiles;
create policy user_profiles_self_select
on app.user_profiles
for select
to authenticated
using (user_id = auth.uid() or app.is_internal_user());

drop policy if exists user_profiles_self_update on app.user_profiles;
create policy user_profiles_self_update
on app.user_profiles
for update
to authenticated
using (user_id = auth.uid() or app.is_admin())
with check (user_id = auth.uid() or app.is_admin());

drop policy if exists user_profiles_self_insert on app.user_profiles;
create policy user_profiles_self_insert
on app.user_profiles
for insert
to authenticated
with check (user_id = auth.uid() or app.is_admin());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'products',
    'product_prices',
    'inventory_balances',
    'inventory_movements',
    'customers',
    'vehicles',
    'services',
    'estimates',
    'estimate_items',
    'sales_transactions',
    'sales_transaction_items',
    'service_orders',
    'service_order_items',
    'upsell_interactions',
    'analytics_refresh_runs'
  ] loop
    execute format('drop policy if exists %1$s_internal_all on app.%1$s', tbl);
    execute format(
      'create policy %1$s_internal_all on app.%1$s for all to authenticated using (app.is_internal_user()) with check (app.is_internal_user())',
      tbl
    );
  end loop;
end;
$$;

revoke all on schema app from public;
revoke all on schema dw from public;
revoke all on schema ml from public;

grant usage on schema app to authenticated;
grant select, insert, update, delete on all tables in schema app to authenticated;
grant usage, select on all sequences in schema app to authenticated;

revoke execute on function public.create_estimate(jsonb) from public;
revoke execute on function public.convert_estimate_to_sale(uuid, text) from public;
revoke execute on function public.convert_estimate_to_service_order(uuid, uuid) from public;
revoke execute on function public.record_upsell_action(text, uuid, uuid, uuid, uuid, text, uuid, text) from public;
revoke execute on function public.run_full_analytics_refresh(text) from public;
revoke execute on function public.get_product_upsell_recommendations(uuid, text, integer) from public;
revoke execute on function public.get_monthly_product_forecasts(date) from public;
revoke execute on function public.get_monthly_service_forecasts(date) from public;
revoke execute on function public.get_analytics_dashboard_snapshot() from public;

grant execute on function public.create_estimate(jsonb) to anon, authenticated;
grant execute on function public.record_upsell_action(text, uuid, uuid, uuid, uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.get_product_upsell_recommendations(uuid, text, integer) to anon, authenticated;
grant execute on function public.convert_estimate_to_sale(uuid, text) to authenticated;
grant execute on function public.convert_estimate_to_service_order(uuid, uuid) to authenticated;
grant execute on function public.run_full_analytics_refresh(text) to authenticated;
grant execute on function public.get_monthly_product_forecasts(date) to authenticated;
grant execute on function public.get_monthly_service_forecasts(date) to authenticated;
grant execute on function public.get_analytics_dashboard_snapshot() to authenticated;
