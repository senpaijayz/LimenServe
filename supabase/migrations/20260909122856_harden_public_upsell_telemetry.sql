-- Close legacy direct Data API write paths. The browser now reaches these
-- operations through the Express API, where payload validation, authoritative
-- pricing, request logging, and shared rate limiting are enforced.

revoke execute on function public.create_estimate(jsonb)
  from public, anon, authenticated;
grant execute on function public.create_estimate(jsonb) to service_role;

revoke execute on function public.record_upsell_action(
  text, uuid, uuid, uuid, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.record_upsell_action(
  text, uuid, uuid, uuid, uuid, text, uuid, text
) to service_role;
