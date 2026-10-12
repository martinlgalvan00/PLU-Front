-- Incidentes de puerta — PLU ARG
--
-- El personal de seguridad detecta cosas que ningún escaneo registra: un QR que
-- ya ingresó y alguien vuelve a mostrar, una persona sin credencial que insiste,
-- un DNI que no coincide con la entrada. Hoy eso se resuelve de palabra y queda
-- sin rastro: el organizador no se entera hasta que alguien se lo cuenta.
--
-- Esta tabla es el parte de incidentes del evento: lo carga quien está en el
-- puesto (con su zona y su cuenta, nunca desde el cuerpo del request) y lo ve y
-- cierra quien administra el meet.
--
-- No es `checkin_scan_events`: un incidente no es un intento de escaneo (muchas
-- veces ni hay QR), y esa tabla es append-only con outcomes cerrados. Tampoco
-- `operational_event_logs`, que sólo admite las fuentes identity y payment.
--
-- Mismo criterio de privacidad que el rastro de escaneos: del QR sólo se guarda
-- el fingerprint (sha256), nunca el token crudo (es una credencial al portador),
-- y no se guarda DNI ni nombre -- el ticket se referencia por FK.

create table if not exists public.checkin_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in (
    'duplicate_qr', 'unknown_qr', 'no_credential', 'identity_mismatch',
    'wrong_zone_attempt', 'other'
  )),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'open' check (status in ('open', 'resolved')),
  gate text,
  zone_scope text,
  ticket_id uuid references public.tickets(id) on delete set null,
  qr_fingerprint text,
  reported_by text not null,
  reported_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 300),
  constraint checkin_incidents_resolution_consistent check (
    (status = 'open' and resolved_at is null and resolved_by is null)
    or (status = 'resolved' and resolved_at is not null and resolved_by is not null)
  )
);

comment on table public.checkin_incidents is
  'Parte de incidentes de puerta: lo carga el staff desde su puesto y lo cierra el organizador.';
comment on column public.checkin_incidents.qr_fingerprint is
  'sha256 del token/código, nunca el valor crudo -- el QR es una credencial al portador.';
comment on column public.checkin_incidents.reported_by is
  'Etiqueta de la cuenta que reportó (id:email), resuelta por el servidor desde la sesión.';

create index if not exists checkin_incidents_event_status_idx
  on public.checkin_incidents(event_id, status, reported_at desc);
create index if not exists checkin_incidents_event_fingerprint_idx
  on public.checkin_incidents(event_id, qr_fingerprint)
  where qr_fingerprint is not null;

alter table public.checkin_incidents enable row level security;

revoke all on public.checkin_incidents from public, anon, authenticated;
-- Supabase concede ALL a service_role por defecto en tablas nuevas: se revoca
-- todo y se vuelve a conceder sólo lo que el parte necesita.
revoke all on public.checkin_incidents from service_role;
grant select, insert on public.checkin_incidents to service_role;
-- Cerrar un incidente sólo toca estas columnas: el resto del parte es evidencia.
grant update (status, resolved_by, resolved_at, resolution_note)
  on public.checkin_incidents to service_role;

do $verification$
begin
  if to_regclass('public.checkin_incidents') is null then
    raise exception 'Falta la tabla checkin_incidents.';
  end if;
  if has_table_privilege('authenticated', 'public.checkin_incidents', 'select') then
    raise exception 'checkin_incidents no debe ser legible por authenticated.';
  end if;
  if has_table_privilege('service_role', 'public.checkin_incidents', 'delete') then
    raise exception 'checkin_incidents es un parte: no se borra.';
  end if;
end
$verification$;
