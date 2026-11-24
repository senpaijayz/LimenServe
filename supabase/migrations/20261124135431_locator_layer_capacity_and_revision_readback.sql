-- Additive stockroom safeguards and read-only historical revision access.
-- No tables, rows, policies, triggers, or existing assignments are removed.

create or replace function public.limen_locator_revision_snapshot(
  p_layout_id uuid,
  p_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if p_layout_id is null or p_revision is null or p_revision < 1 then
    raise exception using errcode = '22023', message = 'A layout and revision are required.';
  end if;

  select history.new_snapshot
    into v_snapshot
    from stockroom.layout_audit_history as history
    join stockroom.layouts as layout on layout.id = history.layout_id
   where history.layout_id = p_layout_id
     and history.revision = p_revision
     and layout.metadata->>'locator' = 'true';

  if v_snapshot is null then
    raise exception using errcode = 'P0002', message = 'Layout revision not found.';
  end if;

  return v_snapshot;
end;
$$;

revoke all on function public.limen_locator_revision_snapshot(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.limen_locator_revision_snapshot(uuid, bigint)
  to service_role;

-- Preserve the live, versioned locator RPC while adding layer-capacity checks
-- and allowing a restore to target a distinct draft name. A strict replacement
-- check prevents silently patching an unexpected production function body.
do $migration$
declare
  original text;
  revised text;
  old_declaration text := 'v_store uuid; objects jsonb; locations jsonb; history_snapshot jsonb; result jsonb;';
  new_declaration text := 'v_store uuid; objects jsonb; locations jsonb; history_snapshot jsonb; result jsonb; assignment_shelf jsonb; assignment_layer integer; layer_capacity integer; assigned_count integer;';
  old_restore_name text := 'target_name := case when p_action=''save'' then coalesce(nullif(btrim(p_payload->>''name''),''''),current_layout.name) else current_layout.name end;';
  new_restore_name text := 'target_name := case when p_action in (''save'',''restore'') then coalesce(nullif(btrim(p_payload->>''name''),''''),current_layout.name) else current_layout.name end;';
  old_assignment text := '    select coalesce(jsonb_agg(x),''[]'') into locations from jsonb_array_elements(locations) x where x->>''productId''<>(p_payload#>>''{location,productId}'');';
  new_assignment text := $code$    assignment_layer := coalesce(nullif(p_payload#>>'{location,layerNumber}','')::integer, 1);
    select object into assignment_shelf
      from jsonb_array_elements(objects) as object
     where object->>'id' = p_payload#>>'{location,shelfObjectId}'
       and object->>'type' in ('shelf','shelf-2-layer','shelf-4-layer','parts-cabinet');
    if assignment_shelf is null then
      raise exception using errcode='22023', message='Choose a valid shelf before assigning this product.';
    end if;
    if assignment_layer not between 1 and coalesce((assignment_shelf->>'layerCount')::integer,
      case assignment_shelf->>'type' when 'shelf-2-layer' then 2 else 4 end) then
      raise exception using errcode='22023', message='Choose a valid shelf layer.';
    end if;
    layer_capacity := coalesce(
      (assignment_shelf->'layerCapacities'->>assignment_layer::text)::integer,
      least(5, greatest(3, coalesce((assignment_shelf->>'binCount')::integer, 5)))
    );
    if layer_capacity not between 3 and 5 then
      raise exception using errcode='22023', message='Shelf layer capacity must be between 3 and 5.';
    end if;
    select count(*) into assigned_count
      from jsonb_array_elements(locations) as assigned
     where assigned->>'shelfObjectId' = p_payload#>>'{location,shelfObjectId}'
       and coalesce(nullif(assigned->>'layerNumber','')::integer, 1) = assignment_layer
       and assigned->>'productId' <> p_payload#>>'{location,productId}';
    if assigned_count >= layer_capacity then
      raise exception using errcode='23514', message='This shelf layer has reached its configured capacity. Choose another layer or increase the capacity.';
    end if;
    select coalesce(jsonb_agg(x),'[]') into locations from jsonb_array_elements(locations) x where x->>'productId'<>(p_payload#>>'{location,productId}');$code$;
begin
  original := pg_catalog.pg_get_functiondef('public.limen_locator_command(text,jsonb,uuid)'::regprocedure);
  revised := replace(original, old_declaration, new_declaration);
  if revised = original then
    raise exception 'Locator command declaration changed; review before applying this migration.';
  end if;
  original := revised;
  revised := replace(original, old_restore_name, new_restore_name);
  if revised = original then
    raise exception 'Locator restore naming changed; review before applying this migration.';
  end if;
  original := revised;
  revised := replace(original, old_assignment, new_assignment);
  if revised = original then
    raise exception 'Locator assignment validation changed; review before applying this migration.';
  end if;
  execute revised;
end;
$migration$;

notify pgrst, 'reload schema';
