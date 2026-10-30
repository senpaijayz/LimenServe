-- Keep implementation helpers available to the trusted backend, not direct clients.
revoke execute on function
 app.extract_vehicle_family(text),app.generate_document_number(text),
 app.infer_part_function(text),app.infer_service_group(text),
 app.sync_stockroom_item_from_product(),catalog.set_updated_at(),
 cms.touch_updated_at(),core.touch_updated_at(),
 operations.snapshot_service_estimate(),operations.validate_new_mechanic_assignment(),
 operations.workshop_hours(date)
from public,anon,authenticated;
grant execute on function
 app.extract_vehicle_family(text),app.generate_document_number(text),
 app.infer_part_function(text),app.infer_service_group(text),
 app.sync_stockroom_item_from_product(),catalog.set_updated_at(),
 cms.touch_updated_at(),core.touch_updated_at(),
 operations.snapshot_service_estimate(),operations.validate_new_mechanic_assignment(),
 operations.workshop_hours(date)
to service_role;
-- New application functions created by the migration owner must opt into client
-- access explicitly. Auth/extension schemas and table policies are unchanged.
alter default privileges for role postgres in schema public,app,catalog,cms,core,operations,stockroom
 revoke execute on functions from public;
alter default privileges for role postgres in schema public,app,catalog,cms,core,operations,stockroom
 grant execute on functions to service_role;
