revoke all privileges on public.store_layouts from anon, authenticated;
revoke all privileges on public.product_locations from anon, authenticated;
revoke all privileges on public.store_layouts from public;
revoke all privileges on public.product_locations from public;

grant select, insert, update, delete on public.store_layouts to authenticated;
grant select, insert, update, delete on public.product_locations to authenticated;
