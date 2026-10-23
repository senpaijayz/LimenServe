revoke all on function operations.assert_workshop_staff(uuid) from public, anon, authenticated;
grant execute on function operations.assert_workshop_staff(uuid) to service_role;

create index if not exists service_work_state_customer_approval_actor_idx
  on operations.service_work_state(customer_approval_recorded_by)
  where customer_approval_recorded_by is not null;
create index if not exists service_work_state_payment_actor_idx
  on operations.service_work_state(payment_verified_by)
  where payment_verified_by is not null;
create index if not exists service_work_events_actor_idx
  on operations.service_work_events(actor_user_id)
  where actor_user_id is not null;
create index if not exists service_work_lines_actor_idx
  on operations.service_work_lines(recorded_by)
  where recorded_by is not null;
