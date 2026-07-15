-- Fase 2: atletas, membresias e inscripciones a torneo sobre Supabase.
-- Hasta ahora este dominio vivia solo en localStorage del navegador (ver
-- src/services/athleteService.js) -- por eso el QR de un socio codificaba
-- el memberCode legible y solo podia verificarse en el mismo dispositivo
-- donde se genero. Esta migracion agrega el backend real que faltaba,
-- reusando el patron ya validado por tickets (RPCs SECURITY DEFINER,
-- constraint unico anti-doble-checkin en check_ins).
--
-- event_registrations ya existia desde la fase 1
-- (20260706030000_phase1_events_ticketing.sql) con athlete_id sin FK a
-- proposito -- este es el paso aditivo que esa migracion dejo pendiente.

-- ---------------------------------------------------------------------
-- athletes
-- ---------------------------------------------------------------------
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  document_id text not null unique,
  email text not null unique,
  birth_date date,
  phone text,
  country text,
  province text,
  city text,
  gym text,
  sex text,
  division text,
  category text,
  estimated_weight numeric(6, 2),
  status text not null default 'pre_registrado'
    check (status in ('pre_registrado', 'registrado', 'afiliado_activo', 'afiliado_vencido', 'bloqueado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index athletes_document_id_idx on public.athletes (document_id);

-- ---------------------------------------------------------------------
-- athlete_payment_orders
-- ---------------------------------------------------------------------
-- Espejo minimo de ticket_orders: agrupa el pago de una afiliacion y/o
-- inscripcion. Sin esto, memberships/event_registrations no tendrian forma
-- de pasar de 'pendiente_pago' a 'activa'/'confirmada'.
create table public.athlete_payment_orders (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete restrict,
  concept text not null check (concept in ('membership', 'registration', 'combo')),
  amount int not null,
  currency text not null default 'ARS',
  method text not null check (method in ('mercado_pago', 'manual_link')),
  -- Vocabulario de src/services/paymentService.js getPaymentStatusForMethod
  -- ('pendiente' | 'validacion_manual'), distinto del status de
  -- memberships/event_registrations ('pendiente_pago' | ...) -- son dos
  -- campos separados igual que en el modelo de localStorage previo.
  status text not null default 'pendiente'
    check (status in ('pendiente', 'validacion_manual', 'aprobado', 'rechazado')),
  reference text unique,
  payment_proof_path text,
  payment_proof_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index athlete_payment_orders_athlete_idx on public.athlete_payment_orders (athlete_id);

-- ---------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------
-- Un solo qr_token cubre tanto la credencial de socio como la de
-- inscripcion a torneo (toda inscripcion requiere membresia activa, ver
-- create_competition_registration) -- mismo patron "mismo codigo,
-- coleccion distinta" que ya documenta src/lib/credentialQr.js.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete restrict,
  year text not null,
  status text not null default 'pendiente_pago'
    check (status in ('pendiente_pago', 'activa', 'vencida', 'cancelada')),
  start_date date,
  expiration_date date,
  member_code text not null unique,
  qr_token uuid not null unique default gen_random_uuid(),
  payment_order_id uuid references public.athlete_payment_orders (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, year)
);

create index memberships_athlete_idx on public.memberships (athlete_id);

-- ---------------------------------------------------------------------
-- event_registrations: FK aditiva anticipada por la fase 1 (ver comentario
-- en 20260706030000_phase1_events_ticketing.sql lineas 130-132).
-- ---------------------------------------------------------------------
alter table public.event_registrations
  add constraint event_registrations_athlete_id_fkey
  foreign key (athlete_id) references public.athletes (id) on delete restrict;

alter table public.event_registrations
  add column payment_order_id uuid references public.athlete_payment_orders (id) on delete set null;

-- ---------------------------------------------------------------------
-- RLS -- mismo patron que 20260706030100_phase1_rls.sql: sin insert/update
-- para anon/authenticated, todo pasa por las RPC SECURITY DEFINER de
-- 20260715000100_phase2_rpc_functions.sql. Select solo para staff
-- (can_view_admin_data(), definida en esa misma migracion de RPCs).
-- ---------------------------------------------------------------------
alter table public.athletes enable row level security;
alter table public.athlete_payment_orders enable row level security;
alter table public.memberships enable row level security;

-- Cualquier cuenta de staff (los 5 valores de profiles.role) puede ver los
-- datos del panel -- espeja ROLES.*.canViewAdmin en src/lib/constants.js,
-- que hoy es true para todos los roles salvo el pseudo-rol athlete_plu
-- (que ni siquiera es un profiles.role real, ver
-- server/services/supabaseAuthBridge.js). Vive aca (no junto a is_admin()/
-- can_check_in() en 20260706*) porque las policies de abajo la necesitan
-- ya definida.
create or replace function public.can_view_admin_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create policy "athletes_select_staff"
  on public.athletes for select
  to authenticated
  using (public.can_view_admin_data());

create policy "athlete_payment_orders_select_staff"
  on public.athlete_payment_orders for select
  to authenticated
  using (public.can_view_admin_data());

create policy "memberships_select_staff"
  on public.memberships for select
  to authenticated
  using (public.can_view_admin_data());

grant select on public.athletes to authenticated;
grant select on public.athlete_payment_orders to authenticated;
grant select on public.memberships to authenticated;
