-- Fase 6: foto de perfil opcional del atleta, usada en la card compartible
-- (EventShareCard) y en el perfil. Opt-in -- sin foto, la card sigue
-- mostrando el monograma de iniciales que ya funcionaba.
--
-- Mismo patron que 20260707100000_ticket_payment_proofs.sql: el archivo va
-- a Storage, la ruta se registra en la tabla via RPC SECURITY DEFINER. La
-- diferencia es que este bucket es publico (la foto tiene que poder
-- mostrarse en una card que cualquiera puede descargar/reposteatear), asi
-- que no hace falta una policy de select -- Storage sirve los objetos de
-- buckets publicos por su URL publica sin pasar por RLS.

alter table public.athletes
  add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-photos',
  'athlete-photos',
  true,
  3145728, -- 3 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Mismo criterio de "confianza" que el resto del dominio athletes: no hay
-- sesion de Supabase Auth para atletas (ver update_athlete_profile), asi
-- que alcanza con que la carpeta del archivo coincida con un athlete_id
-- real -- no se puede validar "sos vos" mas alla de eso con este modelo.
create policy "athlete_photos_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'athlete-photos'
    and exists (
      select 1 from public.athletes where id::text = (storage.foldername(name))[1]
    )
  );

create policy "athlete_photos_update"
  on storage.objects for update
  to anon, authenticated
  using (
    bucket_id = 'athlete-photos'
    and exists (
      select 1 from public.athletes where id::text = (storage.foldername(name))[1]
    )
  );

create policy "athlete_photos_delete"
  on storage.objects for delete
  to anon, authenticated
  using (
    bucket_id = 'athlete-photos'
    and exists (
      select 1 from public.athletes where id::text = (storage.foldername(name))[1]
    )
  );

-- register_athlete_photo: registra (o borra, si p_photo_path es null) la
-- foto ya subida a Storage. Separada de update_athlete_profile a proposito
-- -- ese RPC no debe pisar la foto cuando el atleta solo edita contacto.
create or replace function public.register_athlete_photo(
  p_athlete_id uuid,
  p_photo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_folder text;
begin
  if p_photo_path is not null then
    v_folder := split_part(p_photo_path, '/', 1);
    if v_folder <> p_athlete_id::text then
      raise exception 'Ruta de foto invalida.' using errcode = 'PLU01';
    end if;
  end if;

  update public.athletes
    set photo_path = p_photo_path, updated_at = now()
    where id = p_athlete_id
    returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return to_jsonb(v_athlete);
end;
$$;

grant execute on function public.register_athlete_photo(uuid, text) to anon, authenticated;
