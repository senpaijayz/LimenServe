-- The current web app uses authenticated backend routes for all business writes.
-- Retain existing reads/RLS, Auth and Storage; remove direct table-write bypasses.
do $acl$
declare r record;
begin
 for r in select n.nspname,c.relname from pg_class c
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('public','app','catalog','cms','core','operations','stockroom')
     and c.relkind in ('r','p')
 loop
   execute format('revoke insert,update,delete,truncate,references,trigger on table %I.%I from public,anon,authenticated',r.nspname,r.relname);
 end loop;
end; $acl$;
alter default privileges for role postgres in schema public,app,catalog,cms,core,operations,stockroom
 revoke insert,update,delete,truncate,references,trigger on tables from public,anon,authenticated;
