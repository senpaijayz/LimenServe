alter table if exists public.pricelist enable row level security;

revoke all on table public.pricelist from anon;
revoke all on table public.pricelist from authenticated;

drop policy if exists pricelist_service_role_all on public.pricelist;
create policy pricelist_service_role_all
on public.pricelist
for all
to service_role
using (true)
with check (true);
