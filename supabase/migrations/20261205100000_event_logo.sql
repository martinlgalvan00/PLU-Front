-- Logo / foto del evento — PLU ARG
--
-- Hasta acá el logo de un meet era un asset del repo (solo Pitbull Classic) y el
-- resto del panel mostraba iniciales. Esto agrega la imagen propia de cada evento:
--
--   * `events.logo_path`: ruta dentro del bucket `event-logos`. NULL = sin logo.
--   * bucket `event-logos`: público de lectura (el logo se muestra en el panel y,
--     más adelante, en el sitio), escritura solo con URL firmada que emite la API.
--
-- No toca `staff_upsert_event` ni `staff_set_event_state` a propósito: la imagen se
-- cambia por su propio endpoint y NO bumpea `updated_at`, que es el token de
-- concurrencia del editor (`expectedUpdatedAt`). Cambiar el logo mientras alguien
-- tiene el formulario abierto no puede convertir su próximo guardado en un 409.

alter table public.events
  add column if not exists logo_path text;

alter table public.events
  drop constraint if exists events_logo_path_format;

alter table public.events
  add constraint events_logo_path_format
  check (
    logo_path is null
    or (
      char_length(logo_path) <= 200
      and logo_path ~ '^[A-Za-z0-9._()+/-]+$'
      and logo_path not like '%..%'
    )
  );

comment on column public.events.logo_path is
  'Ruta del logo o foto del evento dentro del bucket event-logos. NULL = sin imagen.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-logos',
  'event-logos',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'logo_path'
  ) then
    raise exception 'La columna events.logo_path no quedó creada.' using errcode = 'PLU01';
  end if;
  if not exists (select 1 from storage.buckets where id = 'event-logos') then
    raise exception 'El bucket event-logos no quedó creado.' using errcode = 'PLU01';
  end if;
end $$;
