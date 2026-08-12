# Caching and session strategy

## Sessions and cookies

Supabase Auth remains the only session authority. The browser uses the existing Supabase client session persistence and sends the access token to Render as a bearer token. The application does not create a second authentication cookie and never stores passwords, access tokens, or private profile data in a preference cookie.

No new preference cookie is currently needed. Theme and sidebar state remain local, device-specific interface preferences. If a server-rendered preference is added later, it must be non-sensitive and use `Secure`, `SameSite=Lax`, a narrow path, and a documented expiry; `HttpOnly` is required only when browser JavaScript does not need to read it.

## Cache ownership and public cache durations

One layer owns each concern. React Query owns UI freshness and invalidation for
paginated product queries. `catalogApi` owns the short browser-memory catalogue
cache and in-flight deduplication for non-React consumers. The generic Axios
cache owns other public reads, such as CMS, fitment, packages, services, and
mechanics; it intentionally does not cache `/catalog/products` again. Render
owns the short shared process cache. Browser HTTP caches own the response
headers below. Vercel owns only the static frontend deployment because hosted
builds now call the environment-specific Render API directly; it is not an API
cache proxy in this topology.

Every Render public-cache invalidation increments `X-Limen-Cache-Version` and
retains the affected cache tags. Catalogue mutations, receipts, and reservation
changes call `invalidateCatalogClientCaches`, which clears the catalogue service
cache and invalidates React Query's `product-catalog` key. CMS mutations clear
the browser CMS cache and the Render public cache. A different browser may see
an older immutable response only until the documented HTTP shared-cache TTL
expires; mutations still revalidate stock server-side.

| Data | Browser | Shared HTTP cache | Stale while revalidate | Render memory |
| --- | ---: | ---: | ---: | ---: |
| CMS site/pages | 30s | 180s | 900s | 60s |
| Public mechanics | 5s | 15s | 30s | 15s |
| Vehicle fitment options | 1h | 24h | 7d | 10m |
| Vehicle packages | 2m | 15m | 1h | 5m |
| Services | 2m | 30m | 1h | 5m |
| Product catalog | 30s | 2m | 10m | 45s |
| Recommendations | 2m | 15m | 1h | 5m |

The Vite client keeps short in-memory copies: products 2 minutes in `catalogApi`
plus React Query's 30-second view freshness, services 5 minutes, public
mechanics 15 seconds, and recommendations 5 minutes.

## Private data

Reservation, assignment, user, service-order, point-of-sale, and dashboard requests use `Cache-Control: no-store`. No user-specific response is eligible for the public in-memory cache or Vercel CDN cache.

## Invalidation

- Product create/update/archive, stock receipt/adjustment, reservation allocation/release/completion: invalidate `catalog-products` and `recommendations`.
- Mechanic create/update/delete or availability change: invalidate `public-mechanics`.
- CMS updates: invalidate only CMS tags through the existing CMS mutation flow.
- Customer reservation creation and pending cancellation do not change allocated inventory, so product caches are unchanged.
- Admin approval/allocation/rejection/cancellation/completion invalidates product data because `reserved` or `available` stock can change.

The database allocation trigger processes approved reservations whenever `inventory_balances.on_hand` increases. Render invalidation is still required after the stock mutation returns so public catalog quantities do not remain stale.

Render's tagged in-memory entries are removed immediately and the cache version
changes. A browser or intermediary may retain an already-cached catalog response
only until its two-minute shared TTL; reservation and completion RPCs always
recheck locked database balances, so a stale public card cannot oversell
inventory or make stock negative.
