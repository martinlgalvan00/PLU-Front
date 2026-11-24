-- Categoría de peso declarada en la inscripción.
-- Nullable a propósito: las inscripciones anteriores no la tienen y no se inventa.

alter table public.event_registrations
  add column if not exists declared_weight_class text;

alter table public.event_registrations
  drop constraint if exists event_registrations_declared_weight_class_check;

alter table public.event_registrations
  add constraint event_registrations_declared_weight_class_check
  check (
    declared_weight_class is null
    or declared_weight_class in (
      '44', '48', '52', '56', '60', '67,5', '75', '82,5', '90',
      '100', '110', '125', '140', '140+'
    )
  );
