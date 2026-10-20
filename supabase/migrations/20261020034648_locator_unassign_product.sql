-- Keep the existing revision lock, audit trail, hierarchy sync, and grants.
-- Unassigning a part removes only its shelf mapping, not its catalog record.
do $migration$
declare
  definition text;
  action_guard text := $snippet$if p_action not in ('save','assign','publish','restore')$snippet$;
  draft_guard text := $snippet$(current_layout.status<>'draft' and p_action<>'assign')$snippet$;
  insertion_point text := '  if target_id is null or target_name<>current_layout.name';
begin
  select pg_catalog.pg_get_functiondef('public.limen_locator_command(text,jsonb,uuid)'::regprocedure) into definition;
  if position(action_guard in definition)=0 or position(draft_guard in definition)=0
     or position(insertion_point in definition)=0 then
    raise exception 'Locator command body changed; review unassign migration before applying.';
  end if;
  definition := replace(definition, action_guard,
    $snippet$if p_action not in ('save','assign','unassign','publish','restore')$snippet$);
  definition := replace(definition, draft_guard,
    $snippet$(current_layout.status<>'draft' and p_action not in ('assign','unassign'))$snippet$);
  definition := replace(definition, insertion_point,
    E'  if p_action=\'unassign\' then\n'
    || E'    if nullif(p_payload->>\'productId\',\'\') is null then raise exception using errcode=\'22023\',message=\'A product is required.\'; end if;\n'
    || E'    if not exists(select 1 from jsonb_array_elements(locations) x where x->>\'productId\'=p_payload->>\'productId\') then raise exception using errcode=\'P0002\',message=\'Product location not found.\'; end if;\n'
    || E'    select coalesce(jsonb_agg(x),\'[]\') into locations from jsonb_array_elements(locations) x where x->>\'productId\'<>p_payload->>\'productId\';\n'
    || E'  end if;\n'
    || insertion_point);
  execute definition;
end $migration$;
notify pgrst,'reload schema';
