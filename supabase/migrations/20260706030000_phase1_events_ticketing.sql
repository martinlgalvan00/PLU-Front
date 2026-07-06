-- Fase 1: eventos, cupos, entradas e inscripciones sobre Supabase.
-- Traduce prisma/schema.prisma (Event/TicketOrder/Ticket/EventRegistration/
-- CheckIn) y agrega calendario, directo y restricciones de cupo/fecha.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  venue text not null,
  location text not null,

  -- Reemplaza el eventDate unico de Prisma: necesario para DTSTART/DTEND
  -- de un .ics correcto en eventos de varios dias.
  starts_at timestamptz not null,
  ends_at timestamptz not null,

  registration_opens_at timestamptz,
  registration_closes_at timestamptz,

  -- Ventana de venta de entradas de espectadores, independiente de la
  -- inscripcion de atletas.
  ticket_sales_opens_at timestamptz,
  ticket_sales_closes_at timestamptz,

  -- Columna denormalizada de conveniencia para listados de admin; la
  -- fuente de verdad para enforcement vive en event_capacity_rules.
  capacity int,

  -- Vocabulario de la UI (src/lib/events.js EVENT_STATUS), no el enum
  -- EventStatus de Prisma -- todo el frontend (filtros, badges, calendario,
  -- copy del detalle) ya esta construido sobre estos 5 valores.
  status text not null default 'proximamente'
    check (status in (
      'proximamente', 'inscripcion_abierta', 'cupos_limitados',
      'cerrado', 'finalizado'
    )),
  -- Gate de visibilidad publica, independiente de `status`: un evento
  -- puede estar "proximamente" mientras el admin todavia lo esta armando
  -- (published = false) y recien pasar a visible cuando esta listo.
  published boolean not null default false,
  requires_membership boolean not null default true,
  price int not null default 0,
  currency text not null default 'ARS',
  rules jsonb,

  -- Directo / transmision en vivo.
  live_stream_url text,
  live_stream_provider text
    check (live_stream_provider in ('youtube', 'instagram', 'twitch')),
  live_status text not null default 'offline'
    check (live_status in ('offline', 'live', 'ended')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (ends_at >= starts_at)
);

create index events_status_starts_at_idx on public.events (status, starts_at);

-- ---------------------------------------------------------------------
-- event_capacity_rules
-- ---------------------------------------------------------------------
create table public.event_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  scope text not null check (scope in ('event', 'day', 'category')),
  -- '' para scope=event; 'day1'/'day2'/'both' para scope=day; nombre de
  -- categoria/division para scope=category.
  key text not null default '',
  limit_count int not null check (limit_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, scope, key)
);

-- ---------------------------------------------------------------------
-- ticket_orders
-- ---------------------------------------------------------------------
create table public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  amount int not null,
  currency text not null default 'ARS',
  provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago', 'manual', 'mock')),
  status text not null default 'creado'
    check (status in ('creado', 'pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado')),
  reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_orders_event_status_idx on public.ticket_orders (event_id, status);

-- ---------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  qr_token uuid not null unique default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders (id) on delete restrict,
  event_id uuid not null references public.events (id) on delete restrict,
  attendee_name text not null,
  attendee_dni text not null,
  day_pass text not null check (day_pass in ('day1', 'day2', 'both')),
  unit_price int not null,
  status text not null default 'pendiente_pago'
    check (status in ('pendiente_pago', 'pagada', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_event_status_idx on public.tickets (event_id, status);
create index tickets_attendee_dni_idx on public.tickets (attendee_dni);

-- ---------------------------------------------------------------------
-- event_registrations
-- ---------------------------------------------------------------------
-- athlete_id queda sin FK: la tabla athletes no existe hasta la fase de
-- migracion de atletas/membresias. Se crea ya para que check_ins tenga un
-- destino estable y la fase siguiente sea aditiva (solo agrega el FK).
create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null,
  event_id uuid not null references public.events (id) on delete restrict,
  division text not null,
  category text not null,
  bodyweight_kg numeric(6, 2),
  status text not null default 'borrador'
    check (status in ('borrador', 'pendiente_pago', 'pagada', 'confirmada', 'observada', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, athlete_id)
);

create index event_registrations_event_status_idx on public.event_registrations (event_id, status);

-- ---------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------
-- Los unique() sobre ticket_id/registration_id son el mecanismo real de
-- "no se puede escanear dos veces" -- igual que hoy en Prisma
-- (prisma/migrations/20260706012914_checkin_exactly_one_target).
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  attendee_kind text not null check (attendee_kind in ('athlete', 'spectator')),
  ticket_id uuid unique references public.tickets (id) on delete restrict,
  registration_id uuid unique references public.event_registrations (id) on delete restrict,
  scanned_by_id uuid references auth.users (id) on delete set null,
  gate text,
  scanned_at timestamptz not null default now(),

  check (
    (attendee_kind = 'spectator' and ticket_id is not null and registration_id is null) or
    (attendee_kind = 'athlete' and registration_id is not null and ticket_id is null)
  )
);

create index check_ins_event_scanned_at_idx on public.check_ins (event_id, scanned_at);
