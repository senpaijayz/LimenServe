alter function app.generate_document_number(text)
  set search_path = app, public;

alter function app.touch_updated_at()
  set search_path = app, public;

alter function app.infer_service_group(text)
  set search_path = app, public;

alter function app.extract_vehicle_family(text)
  set search_path = app, public;

alter function app.infer_part_function(text)
  set search_path = app, public;
