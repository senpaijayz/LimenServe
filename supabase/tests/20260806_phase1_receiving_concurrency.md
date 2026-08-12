# Phase 1 stock-receiving concurrency check

True lock contention needs separate database transactions; the single-session SQL flow test cannot manufacture it. The automated harness uses concurrent PostgREST RPC calls and hard-refuses every Supabase hostname except `localhost`, `127.0.0.1`, and `::1`.

After applying the Phase 1 migration to an isolated local Supabase database, run from `backend`:

```powershell
$env:RUN_LOCAL_SUPABASE_INTEGRATION_TESTS = 'true'
$env:LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:LOCAL_SUPABASE_SERVICE_ROLE_KEY = '<local service-role key>'
npm run test:db:stock-concurrency
```

The harness creates six UUID-namespaced products, exercises 20 simultaneous distinct-key increments, 20 simultaneous same-key calls, changed-payload conflict, late-failure rollback, and two concurrent multi-product invoices whose line orders are exact inverses (`A/B` and `B/A`). The invoices use different suppliers so a shared supplier-row lock cannot accidentally serialize the calls before they reach the product rows. Product B intentionally starts without an inventory-balance row. Both invoice calls must finish without SQLSTATE `40P01`, create four movement/audit/receipt-item rows in total, and produce the exact combined balances.

It then submits one manual receipt and one invoice receipt concurrently for the same sixth product. Those calls also use distinct suppliers, so they contend on the shared product/balance resources instead of being accidentally serialized by a supplier row. Both must finish without `40P01`, increase the balance from `50` to `61`, create exactly two movements and two audit rows, and create only the invoice-side receipt/item. Its `finally` path deletes only the exact receipt, product, supplier, price, movement, audit, and balance fixtures from that UUID run.

The idempotency table deliberately has no direct service-role table grant, so the harness verifies it indirectly through replay responses, movement/audit cardinality, conflicts, and final balances. UUID-prefixed replay-ledger rows remain only in this disposable local database; reset the local database between integration runs rather than weakening the production privilege boundary.

For manual lock inspection, the equivalent two-session sequence is:

1. Insert a disposable active `catalog.products` row and an `inventory_balances` row with `on_hand = 10`. Record the product UUID.
2. Open two `psql` sessions to the same test database.
3. In session A, begin a transaction and call `public.receive_catalog_stock` for quantity `3` with key `concurrency-a-<uuid>`. Do not commit yet.
4. In session B, call the same RPC for the same product with quantity `4` and key `concurrency-b-<uuid>`. It must wait on the balance-row lock.
5. Commit session A. Session B must then finish with `previousStock = 13` and `updatedStock = 17`.
6. Assert the final balance is `17`, with exactly two matching movements and two receiving-log rows.

Repeat with the same key and byte-equivalent JSON payload in both sessions. Session B must wait for session A, then return the original movement/response with `idempotentReplay = true`; the balance, movement ledger, supplier link, and receiving log must each reflect one receipt only.

Finally, reuse that key with a different quantity. The call must fail with SQLSTATE `22023` and message token `IDEMPOTENCY_KEY_REUSED`, without changing any receipt table.

For the invoice deadlock regression, create existing products A and B, but omit B's balance row. Submit two calls to `public.receive_supplier_invoice_stock_idempotent` at the same time with distinct suppliers, keys, and invoice numbers: the first lists A then B, and the second lists B then A. The wrappers derive sorted transaction-level advisory keys through `private.catalog_stock_receipt_product_lock_key`, then acquire product rows, the supplier row, and balance rows in that shared order before delegating to the legacy receiver. Both calls must complete, B's balance must be initialized atomically, and the final balances must equal the starting quantities plus both invoices. A `40P01` from either call is a test failure.

For the cross-path regression, create one existing product and balance, then concurrently submit `public.receive_catalog_stock` and `public.receive_supplier_invoice_stock_idempotent` for that SKU using distinct supplier names. A shared product advisory key must serialize the paths before either takes its product, supplier, or balance row locks. Any `40P01`, final-balance mismatch, missing/duplicate movement, or missing/duplicate audit row is a failure.

The older `catalog.receive_supplier_invoice_stock`, `public.receive_supplier_invoice_stock`, `catalog.receive_existing_supplier_invoice_stock`, and `public.receive_existing_supplier_invoice_stock` functions do not provide Phase 1 idempotency and do not enter the shared advisory-lock namespace. The Phase 1 backend calls only the idempotent wrapper. The live audit found that the two historical `public.*` wrappers also still had client-role grants; the reviewed forward migration `20260812142000_phase2_revoke_legacy_receiving_client_grants.sql` removes `anon`/`authenticated` execution while retaining service-role compatibility. Any other service-role integration that invokes a legacy function directly can still bypass these guarantees and must be inventoried before those compatibility grants are retired.

The automated rollback case is covered by `20260806_phase1_database_flows.sql`, which forces a foreign-key failure after the balance and supplier-link statements and verifies the entire function call was rolled back.
