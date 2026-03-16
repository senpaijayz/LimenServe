# Supabase Backend

This directory contains the database implementation for the LimenServe transactional backend, warehouse, data-mining rules, and forecasting pipeline.

## Files

- `migrations/20260316_000001_core_schema.sql`
  Creates the `app`, `dw`, and `ml` schemas plus all core tables.
- `migrations/20260316_000002_operational_and_etl_functions.sql`
  Adds transactional workflow functions and ETL loaders.
- `migrations/20260316_000003_analytics_rpc.sql`
  Adds association-rule mining, forecasts, views, and RPCs.
- `migrations/20260316_000004_seed_and_security.sql`
  Adds demo seed data, triggers, RLS, and grants.
- `migrations/20260316_000007_auth_profile_sync.sql`
  Keeps `app.user_profiles` aligned with Supabase Auth users automatically.
- `seed.sql`
  Seeds demo data and runs the first analytics refresh.
- `generated/setup_full.sql`
  Combines all migrations plus the full seed into one SQL file for manual SQL Editor deployment.

## Expected flow

1. Apply the migrations in order with the Supabase CLI or SQL editor.
2. Run `seed.sql` in a development environment.
3. Call `run_full_analytics_refresh` after loading new transactional history.

## Smaller manual SQL files

If you prefer smaller files in Supabase SQL Editor instead of one large setup script, use:

- `manual-sql/README.md`
- `manual-sql/01_login_and_roles.sql`
- `manual-sql/02_inventory_and_catalog.sql`
- `manual-sql/03_estimation_and_services.sql`
- `manual-sql/04_sales_service_and_upsell.sql`
- `manual-sql/05_data_warehouse_tables.sql`
- `manual-sql/06_operational_functions.sql`
- `manual-sql/07_analytics_and_refresh_functions.sql`
- `manual-sql/08_public_rpcs.sql`
- `manual-sql/09_security_and_permissions.sql`
- `manual-sql/10_auth_profile_sync.sql`
- `manual-sql/11_demo_seed.sql`

The ERD is available in:

- `manual-sql/ERD.md`

## Catalog seeding from the current frontend data

To convert the existing curated product catalog into SQL seed statements:

```bash
node supabase/scripts/export-product-seed.mjs supabase/generated/product_catalog_seed.sql
```

Then run the generated SQL file before `seed.sql` if you want the live app catalog to come from Supabase instead of the local fallback data.

If you want a single SQL file that includes both the product catalog seed and the demo analytics seed, use:

- `generated/seed_full.sql`

If you want one SQL file that sets up the schemas, functions, RPCs, security, auth-profile sync, and seed data in one run, use:

- `generated/setup_full.sql`

## Main RPCs

- `get_product_catalog`
- `create_estimate`
- `convert_estimate_to_sale`
- `convert_estimate_to_service_order`
- `record_upsell_action`
- `get_product_upsell_recommendations`
- `get_monthly_product_forecasts`
- `get_monthly_service_forecasts`
- `get_analytics_dashboard_snapshot`
- `run_full_analytics_refresh`
