-- Fase C egress: lecturas de retrato y cupo de storage alineados al app.
--
-- 1) Índice parcial en photo_path: el proxy público valida
--    `athletes.photo_path = $p` en cada miss de visibilidad.
-- 2) Tope del bucket a 2 MB (igual que uploadSchema / athletePhotoService).
-- 3) Índice de soporte para “¿tiene inscripción pública?” del mismo proxy.

create index if not exists athletes_photo_path_idx
  on public.athletes (photo_path)
  where photo_path is not null;

create index if not exists event_registrations_public_visible_athlete_idx
  on public.event_registrations (athlete_id)
  where public_visible = true;

update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'athlete-photos';
