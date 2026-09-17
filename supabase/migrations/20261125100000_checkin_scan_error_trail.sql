-- Rastro de intentos de escaneo en la puerta — PLU ARG
--
-- Cada rechazo de check-in (QR vencido, zona incorrecta, ya usada, sin pago,
-- token desconocido) hoy no deja rastro: en la RPC es un `raise exception`
-- que revierte la transacción, y en el navegador vive sólo en memoria (15
-- entradas, se pierde al recargar, por dispositivo). Después de un evento
-- nadie puede responder "cuánta gente llegó con un QR vencido", "se
-- configuró mal una zona" o "alguien probó el mismo QR varias veces".
--
-- Esta migración agrega una tabla propia — no `domain_audit_logs` ni
-- `operational_event_logs` — porque el volumen (miles de escaneos por
-- evento, con rechazos que se repiten) y la forma de las consultas
-- (agregar por outcome/puerta/hora, detectar el mismo QR rechazado varias
-- veces) no conviven bien con esas bitácoras genéricas ni con el feed de
-- auditoría que ya pagina el panel de Auditoría.
--
-- `evidence` distingue lo que el servidor observó (`server`, autoritativo)
-- de lo que un dispositivo de puerta reportó sobre un veredicto resuelto en
-- el navegador (`operator`, telemetría). El servidor nunca confía en un
-- outcome que no haya podido resolver él mismo contra la base.
--
-- No se guarda el QR crudo (es una credencial al portador) ni DNI: sólo un
-- fingerprint del token y los FKs de ticket/inscripción, en la misma lógica
-- que dejó de exponer DNI en la proyección pública del QR
-- (20261123100000, get_ticket_by_qr_token).

create table if not exists public.checkin_scan_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict
    default '00000000-0000-4000-8000-000000000001'::uuid,
  event_id uuid not null references public.events(id) on delete cascade,
  outcome text not null check (outcome in (
    'checked_in', 'ready', 'already_used', 'not_ready', 'not_found',
    'invalid', 'wrong_zone', 'not_yet_valid', 'expired', 'no_registration'
  )),
  kind text not null check (kind in ('ticket', 'registration', 'unknown')),
  evidence text not null check (evidence in ('server', 'operator')),
  ticket_id uuid references public.tickets(id) on delete set null,
  registration_id uuid references public.event_registrations(id) on delete set null,
  qr_fingerprint text,
  gate text,
  zone_scope text,
  actor_label text,
  device_id text,
  client_id uuid,
  offline boolean not null default false,
  error_code text,
  scanned_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.checkin_scan_events is
  'Telemetría de puerta: cada intento de escaneo, admitido o rechazado. No es evidencia legal por sí sola cuando evidence = operator (ver columna).';
comment on column public.checkin_scan_events.evidence is
  'server: el servidor observó el rechazo/admisión. operator: un dispositivo de puerta reportó un veredicto que resolvió el navegador.';
comment on column public.checkin_scan_events.qr_fingerprint is
  'sha256 del token/código, nunca el valor crudo -- el QR es una credencial al portador.';
comment on column public.checkin_scan_events.scanned_at is
  'Reloj del dispositivo que escaneó. Acotado por el servidor antes de insertar (ver scanEventRecorder.js); no se usa para retención.';
comment on column public.checkin_scan_events.recorded_at is
  'Reloj del servidor al insertar la fila. Es la columna que usa la purga de histórico operativo.';

create index if not exists checkin_scan_events_event_scanned_idx
  on public.checkin_scan_events(event_id, scanned_at desc);
create index if not exists checkin_scan_events_event_outcome_idx
  on public.checkin_scan_events(event_id, outcome, scanned_at desc);
create index if not exists checkin_scan_events_event_gate_idx
  on public.checkin_scan_events(event_id, gate, scanned_at desc);
create index if not exists checkin_scan_events_event_fingerprint_idx
  on public.checkin_scan_events(event_id, qr_fingerprint, scanned_at desc)
  where qr_fingerprint is not null;

-- Idempotencia de reintento: un lote reenviado por el dispositivo (por ejemplo
-- tras perder la respuesta 202) no duplica filas. Sin condición `where`: en
-- Postgres cada NULL es distinto de cualquier otro NULL, así que las filas
-- server-autoritativas (sin device_id/client_id) nunca chocan entre sí, y el
-- índice sigue siendo un target válido para `ON CONFLICT` desde PostgREST
-- (un índice único parcial no lo es, salvo que el conflicto repita el mismo
-- predicado, y la librería de Supabase no lo permite especificar).
create unique index if not exists checkin_scan_events_device_client_idx
  on public.checkin_scan_events(device_id, client_id);

alter table public.checkin_scan_events enable row level security;

revoke all on public.checkin_scan_events from public, anon, authenticated;
grant select, insert on public.checkin_scan_events to service_role;

-- Bitácora append-only: sin políticas de update/delete para ningún rol, y sin
-- grant de esas operaciones ni siquiera a service_role.

-- ── Retención: sumar la tabla nueva a la purga de histórico operativo ──────
-- `purge_operational_history` (20260818150000) resuelve la columna de fecha
-- contra information_schema por catálogo de candidatas. Esta tabla no tiene
-- `created_at`: se purga por `recorded_at` (reloj del servidor), nunca por
-- `scanned_at` (reloj del dispositivo, manipulable).
create or replace function public.purge_operational_history(
  p_audit_days integer default 365,
  p_email_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_target record;
  v_column text;
  v_count integer;
begin
  for v_target in
    select *
    from (values
      ('operational_event_logs',     greatest(30, coalesce(p_audit_days, 365))),
      ('domain_audit_logs',          greatest(30, coalesce(p_audit_days, 365))),
      ('payment_integration_events', greatest(30, coalesce(p_audit_days, 365))),
      ('transactional_email_logs',   greatest(30, coalesce(p_email_days, 180))),
      ('checkin_scan_events',        greatest(30, coalesce(p_audit_days, 365)))
    ) as t(table_name, retention_days)
  loop
    if to_regclass('public.' || v_target.table_name) is null then
      continue;
    end if;

    select c.column_name into v_column
    from information_schema.columns c
    join unnest(array['created_at', 'received_at', 'occurred_at', 'sent_at', 'recorded_at']) with ordinality as p(name, priority)
      on p.name = c.column_name
    where c.table_schema = 'public'
      and c.table_name = v_target.table_name
      and c.data_type like 'timestamp%'
    order by p.priority
    limit 1;

    if v_column is null then
      v_result := v_result || jsonb_build_object(v_target.table_name, 'sin columna de fecha');
      continue;
    end if;

    begin
      execute format(
        'delete from public.%I where %I < now() - make_interval(days => $1)',
        v_target.table_name, v_column
      ) using v_target.retention_days;
      get diagnostics v_count = row_count;
      v_result := v_result || jsonb_build_object(v_target.table_name, v_count);
    exception when others then
      v_result := v_result || jsonb_build_object(v_target.table_name, 'error: ' || sqlerrm);
    end;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.purge_operational_history(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_operational_history(integer, integer) to service_role;

-- ── Lectura: informe de errores de escaneo por evento ──────────────────────
-- Admin-only (admin.audit.read en la API): resumen por outcome, desglose por
-- puerta, por hora, QR con rechazos repetidos y los intentos más recientes.
-- Sin ventana, se deriva de las jornadas del evento (o de sus fechas si no
-- tiene jornadas cargadas).
create or replace function public.staff_get_event_scan_error_report(
  p_event_slug text,
  p_from timestamptz default null,
  p_until timestamptz default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_from timestamptz;
  v_until timestamptz;
  v_limit integer;
  v_summary jsonb;
  v_by_outcome jsonb;
  v_by_gate jsonb;
  v_by_hour jsonb;
  v_repeated jsonb;
  v_recent jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 200);

  if p_from is not null and p_until is not null then
    v_from := p_from;
    v_until := p_until;
  else
    select
      coalesce(min(d.date)::timestamp at time zone 'America/Argentina/Buenos_Aires', v_event.starts_at),
      coalesce((max(d.date) + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires', v_event.ends_at)
    into v_from, v_until
    from public.event_days d
    where d.event_id = v_event.id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('outcome', outcome, 'count', total)), '[]'::jsonb)
  into v_by_outcome
  from (
    select outcome, count(*) as total
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by outcome
    order by total desc
  ) t;

  select jsonb_build_object(
    'total', coalesce(sum(total), 0),
    'admitted', coalesce(sum(total) filter (where outcome in ('checked_in', 'ready')), 0),
    'rejected', coalesce(sum(total) filter (where outcome not in ('checked_in', 'ready')), 0)
  )
  into v_summary
  from (
    select outcome, count(*) as total
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by outcome
  ) t;
  v_summary := v_summary || jsonb_build_object('byOutcome', v_by_outcome);

  select coalesce(jsonb_agg(jsonb_build_object(
    'gate', gate, 'zoneScope', zone_scope, 'total', total, 'rejected', rejected
  )), '[]'::jsonb)
  into v_by_gate
  from (
    select
      coalesce(gate, '—') as gate,
      zone_scope,
      count(*) as total,
      count(*) filter (where outcome not in ('checked_in', 'ready')) as rejected
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by coalesce(gate, '—'), zone_scope
    order by total desc
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('hour', hour, 'total', total, 'rejected', rejected)), '[]'::jsonb)
  into v_by_hour
  from (
    select
      date_trunc('hour', scanned_at at time zone 'America/Argentina/Buenos_Aires') as hour,
      count(*) as total,
      count(*) filter (where outcome not in ('checked_in', 'ready')) as rejected
    from public.checkin_scan_events
    where event_id = v_event.id and scanned_at >= v_from and scanned_at < v_until
    group by 1
    order by 1
  ) t;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_repeated
  from (
    select jsonb_build_object(
      'qrFingerprint', s.qr_fingerprint,
      'attempts', s.attempts,
      'gates', s.gates,
      'outcomes', s.outcomes,
      'firstAt', s.first_at,
      'lastAt', s.last_at,
      'ticketCode', t.ticket_code,
      'credentialLabel', t.credential_label
    ) as row
    from (
      select
        qr_fingerprint,
        count(*) as attempts,
        array_agg(distinct gate) filter (where gate is not null) as gates,
        array_agg(distinct outcome) as outcomes,
        min(scanned_at) as first_at,
        max(scanned_at) as last_at,
        (array_agg(ticket_id order by scanned_at desc))[1] as last_ticket_id
      from public.checkin_scan_events
      where event_id = v_event.id
        and scanned_at >= v_from and scanned_at < v_until
        and qr_fingerprint is not null
      group by qr_fingerprint
      having count(*) >= 2 and bool_or(outcome <> 'checked_in')
      order by count(*) desc
      limit 20
    ) s
    left join public.tickets t on t.id = s.last_ticket_id
  ) rows;

  select coalesce(jsonb_agg(row), '[]'::jsonb) into v_recent
  from (
    select jsonb_build_object(
      'id', e.id,
      'scannedAt', e.scanned_at,
      'outcome', e.outcome,
      'kind', e.kind,
      'evidence', e.evidence,
      'gate', e.gate,
      'zoneScope', e.zone_scope,
      'actorLabel', e.actor_label,
      'deviceId', e.device_id,
      'offline', e.offline,
      'errorCode', e.error_code,
      'ticketCode', t.ticket_code,
      'credentialLabel', t.credential_label,
      'ticketTypeName', tt.name
    ) as row
    from public.checkin_scan_events e
    left join public.tickets t on t.id = e.ticket_id
    left join public.ticket_types tt on tt.id = t.ticket_type_id
    where e.event_id = v_event.id and e.scanned_at >= v_from and e.scanned_at < v_until
    order by e.scanned_at desc
    limit v_limit
  ) rows;

  return jsonb_build_object(
    'event', jsonb_build_object(
      'slug', v_event.slug, 'title', v_event.title, 'from', v_from, 'until', v_until
    ),
    'summary', v_summary,
    'byGate', v_by_gate,
    'byHour', v_by_hour,
    'repeated', v_repeated,
    'recent', v_recent
  );
end;
$$;

revoke all on function public.staff_get_event_scan_error_report(text, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.staff_get_event_scan_error_report(text, timestamptz, timestamptz, integer)
  to service_role;

do $verification$
begin
  if to_regclass('public.checkin_scan_events') is null then
    raise exception 'Falta la tabla checkin_scan_events.';
  end if;
  if to_regprocedure('public.staff_get_event_scan_error_report(text,timestamptz,timestamptz,integer)') is null then
    raise exception 'Falta staff_get_event_scan_error_report.';
  end if;
  -- La proyección de lectura no expone PII: ni el token crudo ni el DNI.
  if position('qr_token' in pg_get_functiondef(
      'public.staff_get_event_scan_error_report(text,timestamptz,timestamptz,integer)'::regprocedure
    )) <> 0 then
    raise exception 'El informe de escaneos no debe exponer el token crudo del QR.';
  end if;
  if position('attendee_dni' in pg_get_functiondef(
      'public.staff_get_event_scan_error_report(text,timestamptz,timestamptz,integer)'::regprocedure
    )) <> 0 then
    raise exception 'El informe de escaneos no debe exponer el DNI.';
  end if;
end
$verification$;
