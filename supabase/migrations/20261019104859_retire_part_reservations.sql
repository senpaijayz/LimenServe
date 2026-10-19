-- Retire part reservations without deleting the audit trail.
-- Outstanding holds are cancelled and released, and the RPC entry points and
-- auto-allocation trigger are disabled.

drop trigger if exists trg_allocate_part_reservations_after_restock
  on catalog.inventory_balances;

do $retire_reservations$
declare
  reservation_row operations.part_reservations%rowtype;
begin
  for reservation_row in
    select *
    from operations.part_reservations
    where status in (
      'pending', 'approved', 'waiting_for_stock',
      'partially_available', 'available'
    )
    for update
  loop
    update operations.part_reservations
    set status = 'cancelled',
        allocated_quantity = 0,
        cancelled_at = coalesce(cancelled_at, timezone('utc', now())),
        last_processed_at = timezone('utc', now()),
        admin_note = concat_ws(
          E'\n',
          nullif(btrim(admin_note), ''),
          'Cancelled because part reservations were retired.'
        )
    where id = reservation_row.id;

    insert into operations.part_reservation_events (
      reservation_id,
      event_type,
      from_status,
      to_status,
      quantity,
      note
    ) values (
      reservation_row.id,
      'feature_retired',
      reservation_row.status,
      'cancelled',
      reservation_row.allocated_quantity,
      'Part reservations were retired; any inventory hold was released. Historical records were retained.'
    );
  end loop;
end;
$retire_reservations$;

update catalog.inventory_balances
set reserved = 0,
    updated_at = timezone('utc', now()),
    as_of_date = current_date,
    business_date = current_date
where reserved <> 0;

do $disable_reservation_rpcs$
declare
  function_row record;
begin
  for function_row in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'operations')
      and p.proname ilike '%reservation%'
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, service_role',
      function_row.signature
    );
  end loop;
end;
$disable_reservation_rpcs$;
