create or replace function app.seed_demo_data()
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_estimate_id uuid;
  v_sale_id uuid;
  v_service_order_id uuid;
  v_month date;
  v_idx integer;
  p_oil_filter uuid;
  p_engine_oil uuid;
  p_drain_washer uuid;
  p_brake_pads uuid;
  p_brake_cleaner uuid;
  p_air_filter uuid;
  p_spark_plugs uuid;
  p_terminal_cleaner uuid;
  s_oil_change uuid;
  s_brake_service uuid;
  s_tune_up uuid;
  s_battery_check uuid;
begin
  if exists (select 1 from app.sales_transactions where transaction_number like 'SALE-DEMO-%') then
    return;
  end if;

  insert into app.products (sku, name, model_name, category, metadata)
  values
    ('LF-OF-001', 'Oil Filter - Xpander', 'XPANDER (2017-PRESENT)', 'Filters', '{"recommended_for":["oil_change"]}'),
    ('LF-EO-004', 'Fully Synthetic Engine Oil 4L', 'XPANDER (2017-PRESENT)', 'Fluids & Oils', '{"recommended_for":["oil_change"]}'),
    ('LF-DW-001', 'Drain Plug Washer', 'XPANDER (2017-PRESENT)', 'General Parts', '{"recommended_for":["oil_change"]}'),
    ('LF-BP-101', 'Brake Pad Front Set', 'MONTERO (2015-PRESENT)', 'Brakes', '{"recommended_for":["brake_service"]}'),
    ('LF-BC-001', 'Brake Cleaner', 'MONTERO (2015-PRESENT)', 'Brakes', '{"recommended_for":["brake_service"]}'),
    ('LF-AF-210', 'Air Filter - Mirage', 'MIRAGE G4 (2012-PRESENT)', 'Filters', '{"recommended_for":["tune_up"]}'),
    ('LF-SP-410', 'Spark Plug Set', 'MIRAGE G4 (2012-PRESENT)', 'Ignition', '{"recommended_for":["tune_up"]}'),
    ('LF-BT-010', 'Battery Terminal Cleaner', 'VARIOUS', 'Electrical', '{"recommended_for":["battery_check"]}')
  on conflict (sku) do nothing;

  select id into p_oil_filter from app.products where sku = 'LF-OF-001';
  select id into p_engine_oil from app.products where sku = 'LF-EO-004';
  select id into p_drain_washer from app.products where sku = 'LF-DW-001';
  select id into p_brake_pads from app.products where sku = 'LF-BP-101';
  select id into p_brake_cleaner from app.products where sku = 'LF-BC-001';
  select id into p_air_filter from app.products where sku = 'LF-AF-210';
  select id into p_spark_plugs from app.products where sku = 'LF-SP-410';
  select id into p_terminal_cleaner from app.products where sku = 'LF-BT-010';

  insert into app.product_prices (product_id, price_type, amount, is_current, effective_from)
  values
    (p_oil_filter, 'retail', 450.00, true, date '2025-10-01'),
    (p_engine_oil, 'retail', 1850.00, true, date '2025-10-01'),
    (p_drain_washer, 'retail', 55.00, true, date '2025-10-01'),
    (p_brake_pads, 'retail', 3200.00, true, date '2025-10-01'),
    (p_brake_cleaner, 'retail', 280.00, true, date '2025-10-01'),
    (p_air_filter, 'retail', 780.00, true, date '2025-10-01'),
    (p_spark_plugs, 'retail', 1680.00, true, date '2025-10-01'),
    (p_terminal_cleaner, 'retail', 240.00, true, date '2025-10-01')
  on conflict do nothing;

  insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location)
  values
    (p_oil_filter, 18, 0, 6, 12, '{"floor":1,"section":"A","shelf":"2"}'),
    (p_engine_oil, 24, 0, 8, 16, '{"floor":1,"section":"A","shelf":"3"}'),
    (p_drain_washer, 60, 0, 15, 30, '{"floor":1,"section":"A","shelf":"1"}'),
    (p_brake_pads, 12, 0, 4, 8, '{"floor":2,"section":"B","shelf":"2"}'),
    (p_brake_cleaner, 22, 0, 6, 12, '{"floor":2,"section":"B","shelf":"3"}'),
    (p_air_filter, 14, 0, 5, 10, '{"floor":1,"section":"C","shelf":"2"}'),
    (p_spark_plugs, 16, 0, 5, 10, '{"floor":1,"section":"C","shelf":"3"}'),
    (p_terminal_cleaner, 10, 0, 4, 8, '{"floor":2,"section":"D","shelf":"1"}')
  on conflict (product_id) do nothing;

  insert into app.services (code, name, description, standard_price, estimated_duration_minutes)
  values
    ('SVC-OIL', 'Comprehensive Oil Change Service', 'Oil, filter, washer replacement and inspection', 650.00, 45),
    ('SVC-BRAKE', 'Brake System Overhaul', 'Brake inspection, cleaning, and pad installation', 1200.00, 90),
    ('SVC-TUNE', 'Engine Diagnostic & Tuning', 'Tune-up with filter and spark plug inspection', 1500.00, 90),
    ('SVC-BATT', 'Battery Check & Terminal Cleaning', 'Battery health check and terminal service', 350.00, 30)
  on conflict (code) do nothing;

  select id into s_oil_change from app.services where code = 'SVC-OIL';
  select id into s_brake_service from app.services where code = 'SVC-BRAKE';
  select id into s_tune_up from app.services where code = 'SVC-TUNE';
  select id into s_battery_check from app.services where code = 'SVC-BATT';

  for v_idx in 0..5 loop
    v_month := (date '2025-10-01' + make_interval(months => v_idx));

    insert into app.customers (customer_type, name, phone, email, business_date)
    values (
      case when v_idx % 3 = 0 then 'repeat' else 'walk_in' end,
      'Demo Customer ' || (v_idx + 1),
      '091700000' || lpad((v_idx + 1)::text, 2, '0'),
      'demo' || (v_idx + 1) || '@limen.test',
      v_month + 2
    )
    returning id into v_customer_id;

    insert into app.vehicles (customer_id, plate_no, make, model_name, year, engine, mileage, business_date)
    values (
      v_customer_id,
      'DEM' || lpad((100 + v_idx)::text, 4, '0'),
      'Mitsubishi',
      case
        when v_idx % 3 = 0 then 'XPANDER (2017-PRESENT)'
        when v_idx % 3 = 1 then 'MONTERO (2015-PRESENT)'
        else 'MIRAGE G4 (2012-PRESENT)'
      end,
      2019 + (v_idx % 4),
      case when v_idx % 2 = 0 then '1.5L' else '2.4L' end,
      20000 + (v_idx * 7500),
      v_month + 2
    )
    returning id into v_vehicle_id;

    insert into app.estimates (
      estimate_number,
      customer_id,
      vehicle_id,
      status,
      source,
      note,
      subtotal,
      discount_total,
      tax_total,
      grand_total,
      issued_at,
      valid_until,
      business_date
    )
    values (
      'EST-DEMO-' || to_char(v_month, 'YYYYMM') || '-A',
      v_customer_id,
      v_vehicle_id,
      'approved',
      'public',
      'Oil service package estimate',
      3005.00 + (v_idx * 65),
      0,
      360.60 + (v_idx * 7.80),
      3365.60 + (v_idx * 72.80),
      (v_month + 2)::timestamp,
      v_month + 9,
      v_month + 2
    )
    returning id into v_estimate_id;

    insert into app.estimate_items (estimate_id, line_type, product_id, quantity, unit_price, line_total, business_date)
    values
      (v_estimate_id, 'product', p_oil_filter, 1, 450.00, 450.00, v_month + 2),
      (v_estimate_id, 'product', p_engine_oil, 1, 1850.00, 1850.00, v_month + 2),
      (v_estimate_id, 'product', p_drain_washer, 1, 55.00, 55.00, v_month + 2),
      (v_estimate_id, 'service', s_oil_change, 1, 650.00, 650.00, v_month + 2);

    insert into app.sales_transactions (
      transaction_number,
      estimate_id,
      customer_id,
      payment_method,
      status,
      subtotal,
      discount_total,
      tax_total,
      total_amount,
      business_date
    )
    values (
      'SALE-DEMO-' || to_char(v_month, 'YYYYMM') || '-A',
      v_estimate_id,
      v_customer_id,
      'cash',
      'completed',
      3005.00 + (v_idx * 65),
      0,
      360.60 + (v_idx * 7.80),
      3365.60 + (v_idx * 72.80),
      v_month + 2
    )
    returning id into v_sale_id;

    insert into app.sales_transaction_items (transaction_id, line_type, product_id, quantity, unit_price, line_total, business_date)
    values
      (v_sale_id, 'product', p_oil_filter, 1, 450.00, 450.00, v_month + 2),
      (v_sale_id, 'product', p_engine_oil, 1 + case when v_idx >= 4 then 1 else 0 end, 1850.00, 1850.00 * (1 + case when v_idx >= 4 then 1 else 0 end), v_month + 2),
      (v_sale_id, 'product', p_drain_washer, 1, 55.00, 55.00, v_month + 2),
      (v_sale_id, 'service', s_oil_change, 1, 650.00, 650.00, v_month + 2);

    insert into app.upsell_interactions (
      context_type,
      context_id,
      product_id,
      recommended_product_id,
      action,
      reason_label,
      business_date
    )
    values
      ('estimate', v_estimate_id, p_oil_filter, p_drain_washer, 'accepted', 'Frequently bought together', v_month + 2),
      ('estimate', v_estimate_id, p_engine_oil, p_oil_filter, 'accepted', 'Frequently bought together', v_month + 2);

    insert into app.estimates (
      estimate_number,
      customer_id,
      vehicle_id,
      status,
      source,
      note,
      subtotal,
      discount_total,
      tax_total,
      grand_total,
      issued_at,
      valid_until,
      business_date
    )
    values (
      'EST-DEMO-' || to_char(v_month, 'YYYYMM') || '-B',
      v_customer_id,
      v_vehicle_id,
      'approved',
      'internal',
      'Brake or tune-up estimate',
      case when v_idx % 2 = 0 then 4680.00 else 3960.00 end,
      0,
      case when v_idx % 2 = 0 then 561.60 else 475.20 end,
      case when v_idx % 2 = 0 then 5241.60 else 4435.20 end,
      (v_month + 15)::timestamp,
      v_month + 22,
      v_month + 15
    )
    returning id into v_estimate_id;

    if v_idx % 2 = 0 then
      insert into app.estimate_items (estimate_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_estimate_id, 'product', p_brake_pads, 1, 3200.00, 3200.00, v_month + 15),
        (v_estimate_id, 'product', p_brake_cleaner, 1, 280.00, 280.00, v_month + 15),
        (v_estimate_id, 'service', s_brake_service, 1, 1200.00, 1200.00, v_month + 15);
    else
      insert into app.estimate_items (estimate_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_estimate_id, 'product', p_air_filter, 1, 780.00, 780.00, v_month + 15),
        (v_estimate_id, 'product', p_spark_plugs, 1, 1680.00, 1680.00, v_month + 15),
        (v_estimate_id, 'service', s_tune_up, 1, 1500.00, 1500.00, v_month + 15);
    end if;

    insert into app.service_orders (
      order_number,
      estimate_id,
      customer_id,
      vehicle_id,
      status,
      note,
      subtotal,
      tax_total,
      total_amount,
      business_date
    )
    values (
      'SVC-DEMO-' || to_char(v_month, 'YYYYMM') || '-B',
      v_estimate_id,
      v_customer_id,
      v_vehicle_id,
      case when v_idx = 5 then 'pending' else 'completed' end,
      'Service package generated from estimate',
      case when v_idx % 2 = 0 then 4480.00 else 3960.00 end,
      case when v_idx % 2 = 0 then 537.60 else 475.20 end,
      case when v_idx % 2 = 0 then 5017.60 else 4435.20 end,
      v_month + 16
    )
    returning id into v_service_order_id;

    if v_idx % 2 = 0 then
      insert into app.service_order_items (service_order_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_service_order_id, 'product', p_brake_pads, 1, 3200.00, 3200.00, v_month + 16),
        (v_service_order_id, 'product', p_brake_cleaner, 1, 280.00, 280.00, v_month + 16),
        (v_service_order_id, 'service', s_brake_service, 1, 1200.00, 1200.00, v_month + 16);

      insert into app.upsell_interactions (
        context_type,
        context_id,
        product_id,
        recommended_product_id,
        action,
        reason_label,
        business_date
      )
      values
        ('service', v_service_order_id, p_brake_pads, p_brake_cleaner, 'accepted', 'Recommended installation add-on', v_month + 16);
    else
      insert into app.service_order_items (service_order_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_service_order_id, 'product', p_air_filter, 1, 780.00, 780.00, v_month + 16),
        (v_service_order_id, 'product', p_spark_plugs, 1, 1680.00, 1680.00, v_month + 16),
        (v_service_order_id, 'service', s_tune_up, 1, 1500.00, 1500.00, v_month + 16);

      insert into app.upsell_interactions (
        context_type,
        context_id,
        product_id,
        recommended_service_id,
        action,
        reason_label,
        business_date
      )
      values
        ('service', v_service_order_id, p_air_filter, s_tune_up, 'shown', 'Recommended service pairing', v_month + 16);
    end if;

    if v_idx in (3, 4, 5) then
      insert into app.sales_transactions (
        transaction_number,
        customer_id,
        payment_method,
        status,
        subtotal,
        discount_total,
        tax_total,
        total_amount,
        business_date
      )
      values (
        'SALE-DEMO-' || to_char(v_month, 'YYYYMM') || '-C',
        v_customer_id,
        'cash',
        'completed',
        590.00,
        0,
        70.80,
        660.80,
        v_month + 24
      )
      returning id into v_sale_id;

      insert into app.sales_transaction_items (transaction_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_sale_id, 'product', p_terminal_cleaner, 1, 240.00, 240.00, v_month + 24),
        (v_sale_id, 'service', s_battery_check, 1, 350.00, 350.00, v_month + 24);

      insert into app.upsell_interactions (
        context_type,
        context_id,
        product_id,
        recommended_service_id,
        action,
        reason_label,
        business_date
      )
      values
        ('sale', v_sale_id, p_terminal_cleaner, s_battery_check, case when v_idx = 5 then 'accepted' else 'shown' end, 'Best upsell candidate this month', v_month + 24);
    end if;
  end loop;
end;
$$;

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
