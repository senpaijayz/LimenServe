-- Reversible visibility only: no fulfillment status, stock or sale is changed.
alter table operations.part_reservations
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id);

create index part_reservations_unarchived_requested_idx
  on operations.part_reservations(requested_at) where archived_at is null;

create or replace function public.set_part_reservation_archived(p_reservation_id uuid, p_actor_user_id uuid, p_archived boolean)
returns jsonb language plpgsql security invoker
set search_path = ''
as $function$
declare
  reservation operations.part_reservations%rowtype;
begin
  perform operations.assert_reservation_admin(p_actor_user_id);
  if p_archived is null then
    raise exception using errcode = 'PT400', message = 'Choose Archive or Restore.';
  end if;
  select * into reservation from operations.part_reservations where id = p_reservation_id for update;
  if not found then
    raise exception using errcode = 'PT404', message = 'Reservation was not found.';
  end if;
  if p_archived and reservation.status not in ('completed', 'cancelled', 'rejected') then
    raise exception using errcode = 'PT409', message = 'Finish, cancel, or reject this reservation before archiving it.';
  end if;
  if p_archived and reservation.status <> 'completed' and reservation.allocated_quantity > 0 then
    raise exception using errcode = 'PT409', message = 'This reservation still holds stock. Release its allocated stock before archiving it.';
  end if;
  if (reservation.archived_at is not null) = p_archived then return to_jsonb(reservation); end if;
  update operations.part_reservations
  set archived_at = case when p_archived then now() else null end,
      archived_by = case when p_archived then p_actor_user_id else null end,
      updated_at = now()
  where id = p_reservation_id returning * into reservation;
  insert into operations.part_reservation_events(reservation_id, event_type, from_status, to_status, actor_user_id, note)
  values (p_reservation_id, case when p_archived then 'archived' else 'restored' end,
    reservation.status, reservation.status, p_actor_user_id,
    case when p_archived then 'Moved to archive. History and linked sales are retained.' else 'Restored from archive. Original status is unchanged.' end);
  return to_jsonb(reservation);
end;
$function$;
revoke all on function public.set_part_reservation_archived(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.set_part_reservation_archived(uuid,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
