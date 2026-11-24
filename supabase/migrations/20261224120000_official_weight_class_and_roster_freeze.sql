-- Categoría oficial (pesaje) y cierre del padrón.
-- declared_weight_class sigue siendo la elección de la inscripción.
-- official_weight_class queda null hasta que organización la confirma.
-- No se rellena con el peso ni con la categoría declarada.

alter table public.events
  add column if not exists roster_frozen_at timestamptz;

comment on column public.events.roster_frozen_at is
  'Cierre posterior al pesaje. Con valor, no hay altas ni cambios de categoría declarada, división, equipamiento ni peso. La categoría oficial sí se puede corregir.';

alter table public.event_registrations
  add column if not exists official_weight_class text;

alter table public.event_registrations
  drop constraint if exists event_registrations_official_weight_class_check;

alter table public.event_registrations
  add constraint event_registrations_official_weight_class_check
  check (
    official_weight_class is null
    or official_weight_class in (
      '44', '48', '52', '56', '60', '67,5', '75', '82,5', '90',
      '100', '110', '125', '140', '140+'
    )
  );
