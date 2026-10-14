# Reservation orders and dependency guards

“Reserve for customer” accepts up to 50 different parts, each with a quantity from 1 to 999. Adding a selected part again increases its quantity. Prices and totals are calculated from the current retail prices on the server. Queue cards group the parts under one reservation order.

Approve and allocate each part as before. Once every remaining part is available, select **Checkout order**, review current selling prices, choose Cash, GCash, or Bank transfer, and confirm payment. The order becomes one normal POS sale with multiple lines, a customer link, sales history/receipt data, and stock movements. Inventory release and sale creation happen in one database transaction. Repeating checkout returns the original sale. Cancelling or rejecting a part releases its allocation and excludes it from checkout.

Creation does not record revenue. The existing payment-status field remains an informational record; it is not a deposit ledger. Checkout records the complete order's payment once. Earlier completed reservations are retained without retroactively adding sales, which could duplicate previously encoded revenue.

## Checks for records in use

- Products cannot be archived with active reservations, reserved stock, or open service orders. Products with stock or operational history cannot be hard-deleted.
- Ordinary POS sales can consume only unreserved units.
- Suppliers linked to products or receiving history cannot be deleted. Supplier deletion no longer removes product links first.
- Categories assigned to products cannot be deleted.
- Quotations linked to sales or service orders cannot be deleted.
- Mechanics with open assignments cannot be deactivated; profiles with service history cannot be deleted.
- Occupied stockroom zones, aisles, shelves, levels, and slots cannot be deleted until products are moved.

Blocked actions return an HTTP 409 with an explanation, rather than a generic server failure. Guards also apply to database writes and pricelist changes that attempt to archive a reserved product.

## Rollout

The migration `supabase/migrations/20261014105041_reservation_orders_and_active_product_guard.sql` was applied to the hosted Supabase database on October 14, 2026. Deploy the backend and frontend together. The migration groups existing reservations into one-part orders and keeps their identities, statuses, timestamps, and event history. All new tables have RLS and restricted access. The new checkout and creation RPCs are callable only by the backend service role and verify administrator authorization.

The new website code has not yet been deployed. Coordinate deployment so the older stock-only completion screen is replaced by order checkout. The database now rejects the previous stock-only completion action and directs callers to order checkout.

## Verification

- Backend: `npm test` from `backend`.
- Frontend: `npx vitest run src/tests/reservationOrders.test.jsx src/tests/dashboardApi.test.js src/tests/productCatalogQueries.test.js` from `web-app`.
- Production build: `npm run build` from `web-app`.
- PostgreSQL behavior: install `@electric-sql/pglite@0.3.14` in a temporary folder outside the repository, set `PGLITE_MODULE` to its `dist/index.js`, and run `node backend/scripts/verify-reservation-orders.mjs` from the repository root. The runner uses an isolated PostgreSQL database and synthetic records; it does not connect to production. It checks price changes, failed-sale rollback, duplicate checkout, reservations with a cancelled line, reserved-stock protection, and dependency guards. Multi-session concurrency still needs verification in a staging PostgreSQL instance.
