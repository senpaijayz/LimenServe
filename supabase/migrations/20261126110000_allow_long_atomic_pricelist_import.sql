-- Long imports run over the backend's direct PostgreSQL connection, not the
-- time-limited REST API. Keep the entire import and activation in one atomic
-- transaction, with an explicit upper bound for a genuinely stuck operation.
alter function public.import_and_activate_pricelist_upload(uuid, jsonb, integer, date, text, text, text, uuid, uuid)
  set statement_timeout to '10min';
alter function public.activate_retail_pricelist_version(uuid, uuid)
  set statement_timeout to '10min';
