create schema if not exists operations;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mechanic-photos',
  'mechanic-photos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.list_mechanics()
returns setof operations.mechanics
language sql
security definer
set search_path = operations, public
as $$
  select *
  from operations.mechanics
  order by sort_order asc, full_name asc;
$$;

create or replace function public.get_public_mechanics()
returns setof operations.mechanics
language sql
security definer
set search_path = operations, public
as $$
  select *
  from operations.mechanics
  where is_public is true
  order by sort_order asc, full_name asc;
$$;

create or replace function public.upsert_mechanic(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = operations, public
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_user_id uuid := nullif(coalesce(p_payload ->> 'user_id', p_payload ->> 'userId'), '')::uuid;
  v_full_name text := nullif(coalesce(p_payload ->> 'full_name', p_payload ->> 'fullName'), '');
  v_specialization text := nullif(p_payload ->> 'specialization', '');
  v_status text := coalesce(nullif(coalesce(p_payload ->> 'availability_status', p_payload ->> 'availabilityStatus'), ''), 'available');
  v_shift_label text := nullif(coalesce(p_payload ->> 'shift_label', p_payload ->> 'shiftLabel'), '');
  v_location_name text := coalesce(nullif(coalesce(p_payload ->> 'location_name', p_payload ->> 'locationName'), ''), 'Limen');
  v_bio text := nullif(p_payload ->> 'bio', '');
  v_photo_url text := nullif(coalesce(p_payload ->> 'photo_url', p_payload ->> 'photoUrl'), '');
  v_is_public boolean := coalesce(nullif(p_payload ->> 'is_public', '')::boolean, nullif(p_payload ->> 'isPublic', '')::boolean, true);
  v_sort_order integer := coalesce(nullif(p_payload ->> 'sort_order', '')::integer, nullif(p_payload ->> 'sortOrder', '')::integer, 0);
begin
  if v_full_name is null then
    raise exception 'Mechanic full name is required.';
  end if;

  if v_specialization is null then
    raise exception 'Mechanic specialization is required.';
  end if;

  if v_status not in ('available', 'off_duty', 'booked') then
    v_status := 'available';
  end if;

  if v_id is null then
    insert into operations.mechanics (
      user_id,
      full_name,
      specialization,
      availability_status,
      shift_label,
      location_name,
      bio,
      photo_url,
      is_public,
      sort_order
    )
    values (
      v_user_id,
      v_full_name,
      v_specialization,
      v_status,
      v_shift_label,
      v_location_name,
      v_bio,
      v_photo_url,
      v_is_public,
      v_sort_order
    )
    returning id into v_id;
  else
    update operations.mechanics
    set
      user_id = v_user_id,
      full_name = v_full_name,
      specialization = v_specialization,
      availability_status = v_status,
      shift_label = v_shift_label,
      location_name = v_location_name,
      bio = v_bio,
      photo_url = coalesce(v_photo_url, photo_url),
      is_public = v_is_public,
      sort_order = v_sort_order,
      updated_at = timezone('utc', now())
    where id = v_id;

    if not found then
      raise exception 'Mechanic % was not found.', v_id;
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.delete_mechanic(p_mechanic_id uuid)
returns boolean
language plpgsql
security definer
set search_path = operations, public
as $$
begin
  delete from operations.mechanics
  where id = p_mechanic_id;

  return found;
end;
$$;

grant execute on function public.list_mechanics() to anon, authenticated, service_role;
grant execute on function public.get_public_mechanics() to anon, authenticated, service_role;
grant execute on function public.upsert_mechanic(jsonb) to authenticated, service_role;
grant execute on function public.delete_mechanic(uuid) to authenticated, service_role;
