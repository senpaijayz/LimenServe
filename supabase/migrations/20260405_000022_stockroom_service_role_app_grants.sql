grant usage on schema app to service_role;

grant select, insert, update, delete on table app.stores to service_role;
grant select, insert, update, delete on table app.layouts to service_role;
grant select, insert, update, delete on table app.floors to service_role;
grant select, insert, update, delete on table app.zones to service_role;
grant select, insert, update, delete on table app.aisles to service_role;
grant select, insert, update, delete on table app.shelves to service_role;
grant select, insert, update, delete on table app.shelf_levels to service_role;
grant select, insert, update, delete on table app.shelf_slots to service_role;
grant select, insert, update, delete on table app.items to service_role;
grant select, insert, update, delete on table app.admin_users to service_role;
grant select, insert, update, delete on table app.item_locations to service_role;
grant select on table app.products to service_role;
grant select on table app.inventory_balances to service_role;
