-- Keep the security-definer helpers isolated from mutable schemas.  The
-- trigger still runs for service-role inserts, while direct client execution
-- remains unavailable.

alter function app.assign_random_estimate_number()
  set search_path = pg_catalog;
revoke all on function app.assign_random_estimate_number()
  from public, anon, authenticated;
grant execute on function app.assign_random_estimate_number() to service_role;

alter function public.list_estimates(text, integer)
  set search_path = pg_catalog;
revoke all on function public.list_estimates(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_estimates(text, integer) to service_role;
