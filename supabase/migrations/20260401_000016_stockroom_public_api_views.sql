create or replace view public.stores as
select * from app.stores;

create or replace view public.layouts as
select * from app.layouts;

create or replace view public.floors as
select * from app.floors;

create or replace view public.zones as
select * from app.zones;

create or replace view public.aisles as
select * from app.aisles;

create or replace view public.shelves as
select * from app.shelves;

create or replace view public.shelf_levels as
select * from app.shelf_levels;

create or replace view public.shelf_slots as
select * from app.shelf_slots;

create or replace view public.items as
select * from app.items;

create or replace view public.admin_users as
select * from app.admin_users;

create or replace view public.item_locations as
select * from app.item_locations;

create or replace view public.products as
select * from app.products;

create or replace view public.inventory_balances as
select * from app.inventory_balances;

grant select, insert, update, delete on public.stores to authenticated, service_role;
grant select, insert, update, delete on public.layouts to authenticated, service_role;
grant select, insert, update, delete on public.floors to authenticated, service_role;
grant select, insert, update, delete on public.zones to authenticated, service_role;
grant select, insert, update, delete on public.aisles to authenticated, service_role;
grant select, insert, update, delete on public.shelves to authenticated, service_role;
grant select, insert, update, delete on public.shelf_levels to authenticated, service_role;
grant select, insert, update, delete on public.shelf_slots to authenticated, service_role;
grant select, insert, update, delete on public.items to authenticated, service_role;
grant select, insert, update, delete on public.admin_users to authenticated, service_role;
grant select, insert, update, delete on public.item_locations to authenticated, service_role;
grant select on public.products to authenticated, service_role;
grant select on public.inventory_balances to authenticated, service_role;
