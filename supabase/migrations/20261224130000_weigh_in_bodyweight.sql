-- Peso medido en el pesaje. No reemplaza el peso declarado en la inscripción.
-- Las inscripciones nuevas y las viejas quedan en null hasta que organización lo carga.

alter table public.event_registrations
  add column if not exists weigh_in_bodyweight_kg numeric,
  add column if not exists weigh_in_recorded_at timestamptz,
  add column if not exists weigh_in_recorded_by text,
  add column if not exists declared_weight_class_set_at timestamptz,
  add column if not exists declared_weight_class_set_by text,
  add column if not exists official_weight_class_set_at timestamptz,
  add column if not exists official_weight_class_set_by text;

alter table public.event_registrations
  drop constraint if exists event_registrations_weigh_in_bodyweight_check;

alter table public.event_registrations
  add constraint event_registrations_weigh_in_bodyweight_check
  check (
    weigh_in_bodyweight_kg is null
    or (weigh_in_bodyweight_kg >= 20 and weigh_in_bodyweight_kg <= 400)
  );
