-- A BEFORE DELETE trigger must return OLD. Returning NEW (NULL for DELETE)
-- silently skips the row while Supabase Auth reports a successful deletion.
create or replace function core.guard_protected_admin_identity()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if exists (select 1 from private.protected_admin_identities p where p.user_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;
    if new.id is distinct from old.id
      or pg_catalog.lower(new.email) is distinct from 'admin@limen.com'
      or new.raw_user_meta_data is distinct from old.raw_user_meta_data
      or new.raw_app_meta_data is distinct from old.raw_app_meta_data
      or new.banned_until is distinct from old.banned_until then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

create or replace function core.guard_protected_admin_profile()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if exists (select 1 from private.protected_admin_identities p where p.user_id = old.user_id) then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;
    if new.user_id is distinct from old.user_id
      or pg_catalog.lower(new.email) is distinct from 'admin@limen.com'
      or new.role is distinct from 'admin' then
      raise exception using errcode = '23514', message = 'ADMIN_ACCOUNT_PROTECTED';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

-- Older orders could be marked completed without collecting payment. Move only
-- real, unpaid, unposted orders back to the active billing queue. Preserve
-- their original repair-completion timestamp in the immutable work history.
insert into operations.service_work_events
  (service_order_id, event_type, note, occurred_at)
select so.id, 'work_completed',
  'Repair was marked complete before payment was recorded.',
  coalesce(so.completed_at, so.updated_at, so.created_at)
from operations.service_orders so
left join operations.customers c on c.id = so.customer_id
where so.status = 'completed' and so.payment_status = 'unpaid'
  and coalesce(so.order_number, '') not ilike 'SVC-DEMO-%'
  and coalesce(c.name, '') not ilike 'demo customer%'
  and coalesce(so.note, '') not ilike '%demo service order%'
  and not exists (select 1 from operations.sales_transactions st
    where st.original_reference = 'SERVICE-' || coalesce(so.order_number, so.id::text))
  and not exists (select 1 from operations.service_work_events e
    where e.service_order_id = so.id and e.event_type = 'work_completed');

insert into operations.service_work_state
  (service_order_id, stage, work_completed_at)
select so.id, 'work_completed', coalesce(so.completed_at, so.updated_at, so.created_at)
from operations.service_orders so
left join operations.customers c on c.id = so.customer_id
where so.status = 'completed' and so.payment_status = 'unpaid'
  and coalesce(so.order_number, '') not ilike 'SVC-DEMO-%'
  and coalesce(c.name, '') not ilike 'demo customer%'
  and coalesce(so.note, '') not ilike '%demo service order%'
  and not exists (select 1 from operations.sales_transactions st
    where st.original_reference = 'SERVICE-' || coalesce(so.order_number, so.id::text))
on conflict (service_order_id) do update
set stage = 'work_completed',
    work_completed_at = coalesce(operations.service_work_state.work_completed_at,
      excluded.work_completed_at), updated_at = now();

update operations.service_orders so
set status = 'in_progress', completed_at = null, updated_at = now()
from operations.customers c
where c.id = so.customer_id
  and so.status = 'completed' and so.payment_status = 'unpaid'
  and coalesce(so.order_number, '') not ilike 'SVC-DEMO-%'
  and coalesce(c.name, '') not ilike 'demo customer%'
  and coalesce(so.note, '') not ilike '%demo service order%'
  and not exists (select 1 from operations.sales_transactions st
    where st.original_reference = 'SERVICE-' || coalesce(so.order_number, so.id::text));
