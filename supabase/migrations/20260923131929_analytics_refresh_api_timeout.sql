-- The dashboard refresh is a heavyweight maintenance RPC. Give only this public
-- entrypoint enough time to finish through PostgREST; keep role-wide limits low.
alter function public.run_full_analytics_refresh(text)
  set statement_timeout = '60s';
