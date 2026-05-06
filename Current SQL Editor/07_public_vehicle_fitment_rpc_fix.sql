drop function if exists public.get_public_vehicle_fitments();

create or replace function public.get_public_vehicle_fitments()
returns table (
  model_name text,
  vehicle_family text,
  year integer,
  engine text,
  sort_order integer
)
language sql
security definer
set search_path = public, app
as $$
  select
    fitment.model_name,
    fitment.vehicle_family,
    fitment.year,
    fitment.engine,
    fitment.sort_order
  from app.public_vehicle_fitments fitment
  where fitment.is_active = true
  order by fitment.sort_order asc, fitment.model_name asc, fitment.year desc, fitment.engine asc;
$$;

grant execute on function public.get_public_vehicle_fitments() to anon, authenticated, service_role;
