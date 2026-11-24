-- Efectivo en el lugar: dónde y cómo se cobra, por evento.
--
-- `cash_pitbull` nació como "efectivo en el gimnasio Pitbull", pero los eventos
-- se hacen en otras sedes. El canal sigue siendo el mismo (la clave no cambia:
-- vive en órdenes, enums y triggers); lo que se agrega es el lugar que ve el
-- comprador y una indicación opcional (días, horario, a quién pedir).
--
-- Vacío = la sede del evento (`venue` + `location`). Por eso las dos columnas
-- son opcionales y no hace falta backfill.
--
-- Columnas propias con merge post-save, igual que `capacity_total_public`: el
-- upsert completo no escribe columnas nuevas y redefinirlo para dos textos
-- arriesgaba pisar un cuerpo más nuevo.

alter table public.events
  add column if not exists cash_payment_place text,
  add column if not exists cash_payment_notes text;

alter table public.events
  drop constraint if exists events_cash_payment_place_length;
alter table public.events
  add constraint events_cash_payment_place_length
  check (cash_payment_place is null or char_length(cash_payment_place) <= 160);

alter table public.events
  drop constraint if exists events_cash_payment_notes_length;
alter table public.events
  add constraint events_cash_payment_notes_length
  check (cash_payment_notes is null or char_length(cash_payment_notes) <= 400);

comment on column public.events.cash_payment_place is
  'Dónde se cobra el efectivo (canal cash_pitbull). NULL = la sede del evento.';
comment on column public.events.cash_payment_notes is
  'Indicación opcional para pagar en efectivo: días, horario, a quién pedir.';

create or replace function public.staff_merge_event_cash_payment(
  p_slug text,
  p_place text,
  p_notes text
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
    cash_payment_place = nullif(trim(coalesce(p_place, '')), ''),
    cash_payment_notes = nullif(trim(coalesce(p_notes, '')), ''),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_cash_payment(text, text, text)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_cash_payment(text, text, text)
to service_role;
