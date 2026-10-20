# Inventory receiving and locator rollout

## Implemented

- `/inventory/receive`: separate receiving workspace, barcode/search, 1–100 distinct products, consolidated duplicates, integer quantities, review step, optional supplier/reference, and user-scoped device drafts.
- One transactional batch RPC records all stock lines, movements and receiving logs. It acquires deterministic product locks and retains completed responses for idempotent replay. Interrupted requests retain their exact identity; confirmed validation failures allow correction.
- Invoice OCR remains available separately. Its draft and submitted request identity survive closing/reopening the form. No placeholder supplier row is created when supplier details are omitted.
- Confirmed receipts provide a recent-products handoff to the locator. Receiving drafts are never presented as received stock.
- Mobile Inventory has a filter panel, visible grid/list controls, compact cards/rows, and explicit edit/location actions. Inventory uses the published stockroom mapping rather than the old balance-location snapshot.
- Movement history uses database filtering and pagination, signed quantities, recorded balances, staff, suppliers and references. Unknown historical balances remain unknown. CSV/PDF actions explicitly export the displayed page only.
- Notifications and the mobile sidebar cannot remain open together. Notifications use the shared scrollable dialog with keyboard focus containment and restoration.
- The locator shares layer/bin geometry between rendering and camera targeting, highlights the exact slot without requiring bloom, supports cabinet slots, previews assignments, and provides explicit shelf selection and safe removal. Layer 1 is the bottom layer.
- Camera candidates account for nearby fixture/wall obstruction. Recovery copies warn about revision differences; restoring historical geometry retains current mappings and is rejected if incompatible.
- The WebGL renderer loads separately from the controls/2D floor plan. Existing bundle limits were not raised.

## Database rollout

Applied to the connected LimenServe project:

`20261020220012_inventory_receiving_workspace_and_locator_safety.sql`

This migration changes functions only. It does not clear, reset, truncate or replace business records, stockroom layouts or mappings. New RPCs are executable only by `service_role`; staff permissions remain enforced by the backend. Read-only verification confirmed grants, optional supplier validation, mapping-preserving restore, and a real movement-history response.

No additional migration is pending for this change. Existing Supabase advisor notices remain: RLS-enabled tables without direct-client policies, foreign-key/index notices, and the previously acknowledged leaked-password-protection setting. No new table policy was added.

## Verification and limitations

Production Vite build and its environment/bundle checks passed. Backend JavaScript syntax and Git whitespace checks passed. Automated test suites and optional test workflows were deliberately not run, as requested. No synthetic receiving or layout writes were performed against production.

Real-device WebGL, camera positioning, keyboard/scanner behavior, concurrency, and receipt failure/recovery still need the manual checks below. Device drafts depend on browser storage; clearing browser data removes them. Browser storage is not a cross-device backup. Movement exports currently cover one clearly labeled page, not every matching record.

## Manual verification checklist

1. Receive two products with no supplier; verify both balances and movement entries. Do this only with intended business stock.
2. Add the same part twice; confirm one consolidated line. Check invalid and oversized quantities.
3. Leave/reopen an unfinished receipt and invoice; confirm user-scoped recovery. For an interrupted submitted receipt, use **Check / retry** without changing its details and confirm stock is not duplicated.
4. Assign a product to Layer 3 / Bin 4 on a shelf with sufficient slots. Confirm its exact highlight and camera target, then reassign and remove it. Verify Inventory follows the published mapping.
5. Move/rotate a mapped shelf, save the draft, then publish. Confirm slot identity survives. Confirm reducing occupied layers/bins or deleting mapped shelves is blocked.
6. In separate browser sessions, check stale revision conflicts, safe save reconciliation after a disconnected response, and historical restore with current mappings.
7. On a real phone, check compact Inventory views, filters, scanner, notification/sidebar exclusion, receiving footer, locator controls, low-quality highlighting and reduced motion.
8. Filter/page movement history and compare the displayed page with CSV/PDF output. Historical entries without recorded balances must not show invented values.

Deployment commit and live-service status are reported in the accompanying delivery message.
