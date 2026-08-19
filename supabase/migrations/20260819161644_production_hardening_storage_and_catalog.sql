-- Storage buckets are infrastructure, not an application side effect. Keep the
-- production configuration idempotent and enforce the same size/type limits in
-- the database that the upload routes validate.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'mechanic-photos',
    'mechanic-photos',
    true,
    2097152,
    array['image/png', 'image/jpeg', 'image/webp']::text[]
  ),
  (
    'public-assets',
    'public-assets',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']::text[]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The 3D stockroom needs the complete catalogue. The existing paginated RPC
-- recomputes a total count for every page, which makes a 30k-row cold load take
-- hundreds of repeated scans. This query preserves the data shape but returns
-- it set-wise for the trusted backend only.
create or replace function public.get_full_product_catalog()
returns table(
  id uuid,
  sku text,
  name text,
  model text,
  category text,
  source_category text,
  price numeric,
  stock numeric,
  status text,
  uom text,
  brand text,
  location jsonb,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    product.id,
    product.sku,
    product.name,
    product.model_name as model,
    product.category,
    product.source_category,
    coalesce(price.amount, 0::numeric) as price,
    coalesce(balance.on_hand, 0::numeric) as stock,
    product.status,
    product.uom,
    product.brand,
    coalesce(balance.location, '{}'::jsonb) as location,
    coalesce(product.metadata, '{}'::jsonb) as metadata,
    product.created_at
  from catalog.products as product
  left join catalog.product_prices as price
    on price.product_id = product.id
    and price.price_type = 'retail'
    and price.is_current = true
  left join catalog.inventory_balances as balance
    on balance.product_id = product.id
  where product.is_active = true
  order by product.name asc nulls last, product.sku asc;
$function$;

revoke all on function public.get_full_product_catalog() from public, anon, authenticated;
grant execute on function public.get_full_product_catalog() to service_role;
