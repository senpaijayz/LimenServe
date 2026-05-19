# LimenServe

LimenServe is now structured around the deployment stack you specified:

- Vercel: hosts the React + Vite frontend in `web-app`
- Render: hosts the Node.js + Express API in `backend`
- Supabase: hosts PostgreSQL, authentication, RPCs, warehouse tables, mining outputs, and forecasts in `supabase`

## Current Production Feature

The inventory module includes **Receive Stock from Supplier Invoice** inside the existing Add Stock workflow, with camera/upload OCR for printed supplier invoices, product upserts, stock-in movements, inventory balance updates, and 3D stockroom aisle/shelf/bin assignment.

See [FEATURES.md](FEATURES.md) for rollout notes, environment variables, and the production verification checklist.
