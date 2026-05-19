# LimenServe

LimenServe is now structured around the deployment stack you specified:

- Vercel: hosts the React + Vite frontend in `web-app`
- Render: hosts the Node.js + Express API in `backend`
- Supabase: hosts PostgreSQL, authentication, RPCs, warehouse tables, mining outputs, and forecasts in `supabase`

## Current Production Feature

The inventory module includes **Receive Stock from Supplier Invoice**, a stock-in workflow for posting printed supplier invoices, upserting products, creating stock-in movements, updating inventory balances, and handing newly received products to the 3D stockroom locator for aisle/shelf/bin assignment.

See [FEATURES.md](FEATURES.md) for rollout notes, environment variables, and the production verification checklist.
