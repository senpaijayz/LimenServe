-- Conflicts must reach HTTP callers, not trigger PostgREST transaction retries.
-- All fixtures and attempted writes are rolled back.
begin;
do $test$
declare
  layout jsonb;
  objects jsonb := '[{"id":"floor","type":"floor","position":[0,0,0],"dimensions":{"width":24,"depth":16,"height":4.5}}]';
  name text := 'Conflict test ' || gen_random_uuid();
  signature text;
begin
  foreach signature in array array[
    'public.limen_locator_command(text,jsonb,uuid)',
    'public.limen_stockroom_create_layout_draft(uuid,bigint,text,uuid,text)',
    'public.limen_stockroom_update_layout_draft(uuid,bigint,jsonb,uuid,text)',
    'public.limen_stockroom_publish_layout(uuid,bigint,uuid,text)',
    'private.enforce_stockroom_layout_revision()'
  ] loop
    if position(quote_literal('40001') in pg_get_functiondef(signature::regprocedure)) > 0 then
      raise exception 'Application conflict still retries in %', signature;
    end if;
  end loop;
  if has_function_privilege('anon','public.limen_locator_command(text,jsonb,uuid)','execute')
    or has_function_privilege('authenticated','public.limen_locator_command(text,jsonb,uuid)','execute') then
    raise exception 'Conflict fix expanded browser privileges';
  end if;
  layout := public.limen_locator_command('save',jsonb_build_object('name',name,'objects',objects));
  begin
    perform public.limen_locator_command('save',jsonb_build_object('name',name,'objects',objects));
    raise exception 'Duplicate draft accepted';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.limen_locator_command('save',jsonb_build_object('layoutId',layout->>'id','name',name,'expectedRevision',0,'objects',objects));
    raise exception 'Stale revision accepted';
  exception when sqlstate 'PT409' then null;
  end;
  if (select revision from stockroom.layouts where id=(layout->>'id')::uuid) <> (layout->>'revision')::bigint then
    raise exception 'Conflict changed the saved design';
  end if;
end $test$;
rollback;
