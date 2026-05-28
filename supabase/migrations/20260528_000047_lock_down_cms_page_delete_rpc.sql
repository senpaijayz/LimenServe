-- The CMS page delete RPC is only called from the trusted backend service client.
-- Keep it out of direct browser/client RPC access.

revoke execute on function public.cms_admin_delete_page(text, uuid) from public;
revoke execute on function public.cms_admin_delete_page(text, uuid) from anon;
revoke execute on function public.cms_admin_delete_page(text, uuid) from authenticated;
grant execute on function public.cms_admin_delete_page(text, uuid) to service_role;
