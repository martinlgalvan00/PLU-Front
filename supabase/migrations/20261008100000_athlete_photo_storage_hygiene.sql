-- Ciclo E: higiene de Storage y lectura barata del padrón de fotos.
--
-- 1) Índice para listar atletas con foto (recompress / auditoría).
-- 2) Función de conteo de fotos referenciadas (monitoreo, sin bajar filas).

create index if not exists athletes_with_photo_updated_idx
  on public.athletes (updated_at desc)
  where photo_path is not null;

create or replace function public.count_athlete_photos()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.athletes
  where photo_path is not null;
$$;

revoke all on function public.count_athlete_photos() from public;
grant execute on function public.count_athlete_photos() to service_role;

comment on function public.count_athlete_photos() is
  'Cuenta atletas con photo_path. Usado por scripts de higiene de Storage.';
