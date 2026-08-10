-- Los eventos técnicos/internos pueden nacer con price=0 y luego configurarse.
-- El editor y la API administrativa exigen inscripción positiva antes de
-- publicar; no corresponde imponer esa regla a todas las inserciones internas.
alter table public.events drop constraint if exists events_price_positive;
