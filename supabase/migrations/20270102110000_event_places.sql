-- Dónde queda cada cosa: la sede del evento y el lugar del efectivo, con
-- dirección para abrir en Google Maps o Waze.
--
-- Hasta ahora el efectivo era un texto libre ("lugar") más una nota, y el
-- evento solo tenía nombre de sede y ciudad. El atleta que elegía pagar en
-- efectivo leía una oración y tenía que adivinar la dirección, el horario y a
-- quién buscar; y el mapa con "Cómo llegar" solo funcionaba para la sede de
-- Pitbull, que estaba cargada a mano en el código.
--
-- Columnas opcionales, sin backfill: vacías, todo se ve como antes.
-- Merge post-save, igual que `staff_merge_event_cash_payment`: el upsert
-- completo no escribe columnas nuevas.

alter table public.events
  add column if not exists venue_address text,
  add column if not exists cash_payment_address text,
  add column if not exists cash_payment_hours text,
  add column if not exists cash_payment_contact text;

alter table public.events drop constraint if exists events_venue_address_length;
alter table public.events add constraint events_venue_address_length
  check (venue_address is null or char_length(venue_address) <= 200);
alter table public.events drop constraint if exists events_cash_payment_address_length;
alter table public.events add constraint events_cash_payment_address_length
  check (cash_payment_address is null or char_length(cash_payment_address) <= 200);
alter table public.events drop constraint if exists events_cash_payment_hours_length;
alter table public.events add constraint events_cash_payment_hours_length
  check (cash_payment_hours is null or char_length(cash_payment_hours) <= 160);
alter table public.events drop constraint if exists events_cash_payment_contact_length;
alter table public.events add constraint events_cash_payment_contact_length
  check (cash_payment_contact is null or char_length(cash_payment_contact) <= 120);

comment on column public.events.venue_address is
  'Dirección de la sede (calle y número, ciudad). Alimenta Google Maps y Waze.';
comment on column public.events.cash_payment_address is
  'Dirección donde se paga en efectivo. NULL = la de la sede.';
comment on column public.events.cash_payment_hours is
  'Días y horario para pagar en efectivo.';
comment on column public.events.cash_payment_contact is
  'A quién buscar o a dónde escribir para pagar en efectivo.';

-- NULL en un parámetro = no tocar esa columna; '' = vaciarla. Así un guardado
-- que no manda uno de los bloques no borra lo que otro cargó.
create or replace function public.staff_merge_event_places(
  p_slug text,
  p_venue_address text,
  p_cash_address text,
  p_cash_hours text,
  p_cash_contact text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  update public.events
  set
    venue_address = case when p_venue_address is null then venue_address
      else nullif(trim(p_venue_address), '') end,
    cash_payment_address = case when p_cash_address is null then cash_payment_address
      else nullif(trim(p_cash_address), '') end,
    cash_payment_hours = case when p_cash_hours is null then cash_payment_hours
      else nullif(trim(p_cash_hours), '') end,
    cash_payment_contact = case when p_cash_contact is null then cash_payment_contact
      else nullif(trim(p_cash_contact), '') end,
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_places(text, text, text, text, text)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_places(text, text, text, text, text)
to service_role;
