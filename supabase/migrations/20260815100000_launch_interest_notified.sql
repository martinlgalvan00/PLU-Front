-- Agregar columna de notificacion y permitir múltiples suscripciones (una por cada source).

-- 1. Quitar el constraint UNIQUE anterior que solo permitia un email en toda la tabla.
alter table public.launch_interest drop constraint if exists launch_interest_email_unique;

-- 2. Agregar constraint para que un usuario no pueda suscribirse 2 veces AL MISMO SOURCE.
alter table public.launch_interest add constraint launch_interest_email_source_unique unique (email, source);

-- 3. Agregar columna para saber si el aviso ya fue enviado y evitar spam.
alter table public.launch_interest add column if not exists notified_at timestamptz;

-- 4. Crear indice parcial para queries rapidas al momento de notificar.
create index if not exists launch_interest_pending_notify_idx
  on public.launch_interest (source)
  where notified_at is null;
