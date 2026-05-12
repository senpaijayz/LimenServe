create index if not exists store_layouts_created_by_idx
  on public.store_layouts (created_by);

create index if not exists store_layouts_updated_by_idx
  on public.store_layouts (updated_by);

create index if not exists store_layouts_updated_at_idx
  on public.store_layouts (updated_at desc);

create index if not exists product_locations_created_by_idx
  on public.product_locations (created_by);

create index if not exists product_locations_updated_by_idx
  on public.product_locations (updated_by);

create index if not exists product_locations_shelf_lookup_idx
  on public.product_locations (floor, aisle, shelf_number, bin_number);

create index if not exists product_locations_updated_at_idx
  on public.product_locations (updated_at desc);
