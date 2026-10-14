-- Preserve archive protection, but report only dependencies that actually exist.
create or replace function catalog.prevent_archive_with_active_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  blockers text[] := array[]::text[];
  actions text[] := array[]::text[];
begin
  if old.is_active is true and new.is_active is false then
    if exists (
      select 1 from operations.part_reservations r
      where r.product_id = old.id
        and r.status in ('pending', 'approved', 'waiting_for_stock', 'partially_available', 'available')
    ) then
      blockers := array_append(blockers, 'active part reservation');
      actions := array_append(actions, 'Complete or cancel the reservation first.');
    end if;

    if exists (
      select 1 from catalog.inventory_balances b
      where b.product_id = old.id and b.reserved > 0
    ) then
      blockers := array_append(blockers, 'allocated stock');
      actions := array_append(actions, 'Release the allocated stock through its linked transaction first.');
    end if;

    if exists (
      select 1 from operations.service_order_items i
      join operations.service_orders s on s.id = i.service_order_id
      where i.product_id = old.id and s.status in ('pending', 'in_progress')
    ) then
      blockers := array_append(blockers, 'open service order');
      actions := array_append(actions, 'Complete or cancel the service order first.');
    end if;

    if cardinality(blockers) > 0 then
      raise exception using
        errcode = '23503',
        message = 'IN_USE: Cannot archive this product: ' ||
          array_to_string(blockers, '; ') || '. ' ||
          array_to_string(actions, ' ');
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function catalog.prevent_archive_with_active_reservations()
  from public, anon, authenticated;
