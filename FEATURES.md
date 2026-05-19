# LimenServe Features

## Receive Stock from Supplier Invoice

Staff can post incoming supplier invoices from `Inventory > Add Stock > Scan Parts Invoice`. The frontend captures or uploads the invoice image, then sends it to the backend route `POST /catalog/stock/invoice-ocr` for PaddleOCR processing. The backend extracts only invoice number, order number, date, stock number, and quantity, then separates detected rows into existing products and new product part numbers before any stock is posted.

Posting is handled by the Supabase RPC `receive_supplier_invoice_stock`, which runs product upserts, inventory balance updates, inventory movement creation, receipt item creation, supplier linking, cost-price history updates, and receiving logs in a single database transaction.

OCR-posted receipts use `receive_existing_supplier_invoice_stock`, a stricter RPC wrapper that rejects any part number not already present in `catalog.products`. New product part numbers are shown separately in the UI for manual product creation and are not auto-created by OCR.

After a receipt is posted, the Add Stock success screen summarizes the received item count and total quantity. The recommended next action, `Assign Locations in 3D Stockroom`, stores the newly received items in the existing locator Zustand store and opens `/locator-3d?mode=stock-receipt`. The 3D stockroom highlights matching products and shows a focused assignment panel so staff can update aisle, shelf, and bin mappings.

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

Backend OCR dependencies:

```bash
cd backend
npm install ppu-paddle-ocr onnxruntime-node multer
```

The OCR endpoint accepts `multipart/form-data` with an `invoice` image field. Supported image types are JPG, PNG, and WEBP.

### Verification Checklist

- Post a sample Diamond Motor Corporation invoice with at least two line items.
- Confirm duplicate part numbers are merged into one posted receipt item.
- Confirm new products are created and existing products keep their description unless it was empty.
- Confirm `catalog.inventory_balances.on_hand` increases by the received quantity.
- Confirm `catalog.inventory_movements` contains `stock_in` rows with `reference_type = 'supplier_invoice'`.
- Confirm `catalog.stock_receipts` and `catalog.stock_receipt_items` contain the posted receipt.
- Use `Assign Locations in 3D Stockroom` and verify newly received products are highlighted.
- Assign or update at least one aisle, shelf, and bin location, then reload and confirm it persists.
