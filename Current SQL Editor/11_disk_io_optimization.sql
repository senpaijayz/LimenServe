-- Disk IO optimization for LimenServe production.
-- Run during a low-traffic window in Supabase SQL Editor.
-- Purpose:
-- 1. Add indexes used by catalog, inventory, sales, service, stockroom, CMS, and recommendation screens.
-- 2. Support search without repeated full table scans.
-- 3. Refresh planner statistics after index creation.

create extension if not exists pg_trgm;

-- Catalog runtime source of truth.
create index if not exists catalog_products_active_category_name_idx
  on catalog.products (is_active, category, name, sku);

create index if not exists catalog_products_active_status_idx
  on catalog.products (is_active, status);

create index if not exists catalog_products_model_name_idx
  on catalog.products (model_name)
  where model_name is not null;

create index if not exists catalog_products_sku_trgm_idx
  on catalog.products using gin (sku gin_trgm_ops);

create index if not exists catalog_products_name_trgm_idx
  on catalog.products using gin (name gin_trgm_ops);

create index if not exists catalog_products_model_trgm_idx
  on catalog.products using gin (model_name gin_trgm_ops)
  where model_name is not null;

create index if not exists catalog_product_prices_current_retail_idx
  on catalog.product_prices (product_id, effective_from desc, created_at desc)
  where price_type = 'retail' and is_current = true;

create index if not exists catalog_inventory_movements_product_created_idx
  on catalog.inventory_movements (product_id, created_at desc);

create index if not exists catalog_inventory_movements_performed_created_idx
  on catalog.inventory_movements (performed_by, created_at desc)
  where performed_by is not null;

create index if not exists catalog_inventory_movements_reference_idx
  on catalog.inventory_movements (reference_type, reference_id)
  where reference_type is not null;

-- Keep staging searchable for audit/import screens, but the live app no longer uses it for normal catalog paging.
create index if not exists catalog_pricelist_staging_sku_trgm_idx
  on catalog.pricelist_import_staging using gin (sku gin_trgm_ops);

create index if not exists catalog_pricelist_staging_name_trgm_idx
  on catalog.pricelist_import_staging using gin (name gin_trgm_ops);

create index if not exists catalog_pricelist_staging_category_name_idx
  on catalog.pricelist_import_staging (category, name, sku);

-- Operations and reports.
create index if not exists operations_sales_transactions_history_idx
  on operations.sales_transactions (business_date desc, created_at desc, status);

create index if not exists operations_sales_transactions_estimate_idx
  on operations.sales_transactions (estimate_id)
  where estimate_id is not null;

create index if not exists operations_sales_items_product_idx
  on operations.sales_transaction_items (product_id)
  where product_id is not null;

create index if not exists operations_sales_items_service_idx
  on operations.sales_transaction_items (service_id)
  where service_id is not null;

create index if not exists operations_service_orders_active_idx
  on operations.service_orders (status, business_date desc, created_at desc);

create index if not exists operations_service_orders_customer_idx
  on operations.service_orders (customer_id)
  where customer_id is not null;

create index if not exists operations_service_order_items_order_idx
  on operations.service_order_items (service_order_id);

create index if not exists operations_estimates_number_idx
  on operations.estimates (estimate_number);

create index if not exists operations_estimates_status_date_idx
  on operations.estimates (status, business_date desc, created_at desc);

-- Recommendation endpoints.
create index if not exists reco_packages_anchor_active_idx
  on reco.product_recommendation_packages (anchor_product_id, is_active, priority);

create index if not exists reco_package_items_package_active_idx
  on reco.product_recommendation_package_items (package_id, is_active, display_priority);

create index if not exists reco_rules_anchor_active_idx
  on reco.quote_recommendation_rules (anchor_product_id, anchor_category, is_active, priority);

-- Stockroom / parts locator.
create index if not exists stockroom_layouts_status_store_idx
  on stockroom.layouts (store_id, status, updated_at desc);

create index if not exists stockroom_item_locations_active_item_idx
  on stockroom.item_locations (is_active, item_id);

-- Core analytics refresh history.
create index if not exists core_analytics_refresh_runs_started_idx
  on core.analytics_refresh_runs (started_at desc);

create index if not exists core_analytics_refresh_runs_initiated_idx
  on core.analytics_refresh_runs (initiated_by, started_at desc)
  where initiated_by is not null;

analyze catalog.products;
analyze catalog.product_prices;
analyze catalog.inventory_balances;
analyze catalog.inventory_movements;
analyze catalog.pricelist_import_staging;
analyze operations.sales_transactions;
analyze operations.sales_transaction_items;
analyze operations.service_orders;
analyze operations.service_order_items;
analyze operations.estimates;
analyze reco.product_recommendation_packages;
analyze reco.product_recommendation_package_items;
analyze reco.quote_recommendation_rules;
analyze stockroom.layouts;
analyze stockroom.item_locations;
analyze core.analytics_refresh_runs;
