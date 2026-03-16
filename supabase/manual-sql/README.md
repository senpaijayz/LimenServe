# Manual SQL Setup

Use these files in Supabase `SQL Editor` one by one, in this exact order:

1. `01_login_and_roles.sql`
2. `02_inventory_and_catalog.sql`
3. `03_estimation_and_services.sql`
4. `04_sales_service_and_upsell.sql`
5. `05_data_warehouse_tables.sql`
6. `06_operational_functions.sql`
7. `07_analytics_and_refresh_functions.sql`
8. `08_public_rpcs.sql`
9. `08b_user_profile_rpc.sql`
10. `09_security_and_permissions.sql`
11. `10_auth_profile_sync.sql`
12. `11_demo_seed.sql`

## What each file contains

- `01_login_and_roles.sql`
  Creates schemas, the `app.user_profiles` table, and role helper functions used by authentication and RLS.
- `02_inventory_and_catalog.sql`
  Creates product, pricing, inventory balance, and inventory movement tables.
- `03_estimation_and_services.sql`
  Creates customer, vehicle, service, estimate, and estimate item tables.
- `04_sales_service_and_upsell.sql`
  Creates sales transactions, service orders, analytics refresh logs, and upsell event tables.
- `05_data_warehouse_tables.sql`
  Creates `dw` dimensions/facts plus `ml` rule and forecast tables.
- `06_operational_functions.sql`
  Creates estimate creation and estimate conversion functions.
- `07_analytics_and_refresh_functions.sql`
  Creates ETL loaders, analytics refresh functions, mining logic, forecast logic, and analytics views.
- `08_public_rpcs.sql`
  Creates the public RPCs used by the frontend/backend.
- `08b_user_profile_rpc.sql`
  Creates the public RPC used by the backend to load authenticated user profiles safely.
- `09_security_and_permissions.sql`
  Enables RLS, creates policies, and grants access to schemas/functions.
- `10_auth_profile_sync.sql`
  Syncs Supabase Auth users into `app.user_profiles` automatically.
- `11_demo_seed.sql`
  Creates demo seed data and runs the first analytics refresh.

## Verification queries

After all 12 files run successfully, verify with:

```sql
select count(*) from app.products;
```

```sql
select count(*) from app.estimates;
```

```sql
select count(*) from ml.product_monthly_forecasts;
```

## Admin role example

After creating a Supabase Auth user, promote it with:

```sql
update app.user_profiles
set role = 'admin'
where email = 'your-email@example.com';
```
