-- Additive wrapper; existing clients keep their original creation RPC.
create table operations.service_intake_requests (
  actor_id uuid not null,
  request_id uuid not null,
  payload_hash text not null,
  service_order_id uuid not null references operations.service_orders(id),
  created_at timestamptz not null default now(),
  primary key(actor_id,request_id)
);
create index service_intake_requests_order_idx on operations.service_intake_requests(service_order_id);
alter table operations.service_intake_requests enable row level security;
revoke all on operations.service_intake_requests from public,anon,authenticated;
grant select,insert on operations.service_intake_requests to service_role;
create policy backend_read on operations.service_intake_requests for select to service_role using(true);
create policy backend_insert on operations.service_intake_requests for insert to service_role with check(true);

create function public.limen_create_service_intake(p_payload jsonb,p_actor uuid,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $body$
declare saved operations.service_intake_requests%rowtype; result jsonb; order_id uuid;
  priority_value text:=coalesce(p_payload->>'priority','normal');
begin
  perform operations.assert_workshop_staff(p_actor);
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode='22023',message='A valid intake request is required.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('service-intake:'||p_actor::text||':'||p_request_id::text,0));
  select * into saved from operations.service_intake_requests where actor_id=p_actor and request_id=p_request_id;
  if found then
    if saved.payload_hash<>pg_catalog.md5(p_payload::text) then
      raise exception using errcode='PT409',message='This intake already created job '||saved.service_order_id::text||'. Open that job before changing its details.';
    end if;
    return public.limen_service_order_json(saved.service_order_id);
  end if;
  if coalesce(p_payload->>'status','pending')<>'pending' or priority_value not in ('low','normal','high','urgent') then
    raise exception using errcode='22023',message='New jobs must start Pending with a valid priority.';
  end if;
  if nullif(p_payload->>'mechanicId','') is not null then
    perform operations.assert_assignment_admin(p_actor);
  end if;
  result:=public.limen_create_service_order(p_payload);
  order_id:=(result->>'id')::uuid;
  update operations.service_orders set priority=priority_value where id=order_id;
  if nullif(p_payload->>'mechanicId','') is not null then
    -- Existing trigger enforces Manila hours, future times and mechanic shifts;
    -- existing exclusion constraint prevents overlapping appointments.
    perform public.assign_mechanic_to_service_order(order_id,(p_payload->>'mechanicId')::uuid,
      (p_payload->>'scheduledStart')::timestamptz,(p_payload->>'scheduledEnd')::timestamptz,p_actor,null);
  end if;
  insert into operations.service_intake_requests(actor_id,request_id,payload_hash,service_order_id)
    values(p_actor,p_request_id,pg_catalog.md5(p_payload::text),order_id);
  return public.limen_service_order_json(order_id);
end;
$body$;
revoke all on function public.limen_create_service_intake(jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.limen_create_service_intake(jsonb,uuid,uuid) to service_role;
