-- Keep the intake estimate even after service_orders.total_amount becomes the final bill.
alter table operations.service_work_state add column if not exists estimate_total numeric(12,2);
update operations.service_work_state state
set estimate_total = orders.total_amount
from operations.service_orders orders
where orders.id = state.service_order_id and state.estimate_total is null;

create or replace function operations.snapshot_service_estimate()
returns trigger language plpgsql
set search_path = pg_catalog, operations
as $$
begin
  if new.estimate_total is null then
    select total_amount into new.estimate_total
    from operations.service_orders where id = new.service_order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_service_estimate on operations.service_work_state;
create trigger trg_snapshot_service_estimate before insert on operations.service_work_state
for each row execute function operations.snapshot_service_estimate();
