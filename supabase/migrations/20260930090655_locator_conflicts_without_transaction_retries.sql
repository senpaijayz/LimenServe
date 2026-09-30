-- Business revision conflicts are permanent for this request, not serialization
-- failures. PostgREST retries SQLSTATE 40001 indefinitely on affected versions.
-- Preserve the existing bodies, locking, audit history, owner and grants; replace
-- only the explicit application conflict code with HTTP 409 (PT409).
do $migration$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'public.limen_locator_command(text,jsonb,uuid)',
    'public.limen_stockroom_create_layout_draft(uuid,bigint,text,uuid,text)',
    'public.limen_stockroom_update_layout_draft(uuid,bigint,jsonb,uuid,text)',
    'public.limen_stockroom_publish_layout(uuid,bigint,uuid,text)',
    'private.enforce_stockroom_layout_revision()'
  ] loop
    select pg_catalog.pg_get_functiondef(signature::regprocedure) into definition;
    execute replace(definition, quote_literal('40001'), quote_literal('PT409'));
  end loop;
end $migration$;
