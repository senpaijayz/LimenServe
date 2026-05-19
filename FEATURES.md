# LimenServe Features

## Receive Stock from Supplier Invoice

Staff can post incoming supplier invoices into inventory from `Inventory > Receive Stock`. The flow captures invoice header details, merges duplicate part numbers, validates line quantities and unit costs, then posts the receipt through the backend route `POST /catalog/stock/receive-invoice`.

Posting is handled by the Supabase RPC `receive_supplier_invoice_stock`, which runs product upserts, inventory balance updates, inventory movement creation, receipt item creation, supplier linking, cost-price history updates, and receiving logs in a single database transaction.

After a receipt is posted, the success screen summarizes the received item count and total quantity. The recommended next action, `Assign Locations in 3D Stockroom`, stores the newly received items in the existing locator Zustand store and opens `/locator-3d?mode=stock-receipt`. The 3D stockroom highlights matching products and shows a focused assignment panel so staff can update aisle, shelf, and bin mappings.

### Production Rollout

1. Apply Supabase migrations in order, with `20260519_000032_supplier_invoice_stock_receipts.sql` after the existing catalog, inventory, and 3D locator migrations.
2. Deploy the backend route changes before promoting the frontend, so the receive-stock page has a working API endpoint.
3. Deploy the Vercel preview for the frontend and test posting a small receipt against staging or a production branch database.
4. Promote the Vercel deployment only after the receipt, inventory movement, product balance, and 3D location handoff are verified.

### Environment Variables

No new frontend environment variables are required. The feature uses the existing API base URL and Supabase configuration already used by LimenServe.

Required existing variables:

- Frontend: `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, auth/JWT configuration already used by existing protected routes

Never expose `SUPABASE_SERVICE_ROLE_KEY` in Vercel frontend variables.

### Verification Checklist

- Post a sample Diamond Motor Corporation invoice with at least two line items.
- Confirm duplicate part numbers are merged into one posted receipt item.
- Confirm new products are created and existing products keep their description unless it was empty.
- Confirm `catalog.inventory_balances.on_hand` increases by the received quantity.
- Confirm `catalog.inventory_movements` contains `stock_in` rows with `reference_type = 'supplier_invoice'`.
- Confirm `catalog.stock_receipts` and `catalog.stock_receipt_items` contain the posted receipt.
- Use `Assign Locations in 3D Stockroom` and verify newly received products are highlighted.
- Assign or update at least one aisle, shelf, and bin location, then reload and confirm it persists.
