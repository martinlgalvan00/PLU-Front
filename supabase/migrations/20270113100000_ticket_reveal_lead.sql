-- Anticipación para ver el QR de una entrada de público.
--
-- No mueve la vigencia de puerta (`valid_from` / `valid_until`). Sólo decide
-- cuándo el comprador puede ver el pase: `reveal_at = valid_from - lead`.
-- 1440 minutos (24 h) es el protocolo de Venti / Movistar Arena. 0 lo muestra
-- al acreditar.
--
-- Columna propia, igual que `capacity_total_public`: `staff_upsert_event`
-- reconstruye el evento y no escribe columnas nuevas. El valor se persiste
-- con `staff_merge_event_ticket_reveal` después del upsert.
--
-- `pass_revealed_at` marca la orden cuyo mail con QR ya salió (o no hace
-- falta, porque la compra es anterior a este protocolo). Las órdenes
-- aprobadas al aplicar esta migración ya recibieron el PNG: no se les
-- reenvía.

alter table public.events
  add column if not exists ticket_reveal_lead_minutes integer not null default 1440;

alter table public.events
  drop constraint if exists events_ticket_reveal_lead_minutes_check;

alter table public.events
  add constraint events_ticket_reveal_lead_minutes_check
  check (
    ticket_reveal_lead_minutes >= 0
    and ticket_reveal_lead_minutes <= 366 * 24 * 60
  );

alter table public.ticket_orders
  add column if not exists pass_revealed_at timestamptz;

update public.ticket_orders
set pass_revealed_at = now()
where status = 'aprobado'
  and pass_revealed_at is null;

create index if not exists ticket_orders_pending_reveal_idx
  on public.ticket_orders (created_at)
  where status = 'aprobado' and pass_revealed_at is null;

create or replace function public.staff_merge_event_ticket_reveal(
  p_slug text,
  p_lead_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead integer := coalesce(p_lead_minutes, 1440);
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;
  if v_lead < 0 or v_lead > 366 * 24 * 60 then
    raise exception 'La anticipación para ver la entrada está fuera de rango.' using errcode = 'PLU01';
  end if;

  update public.events
  set
    ticket_reveal_lead_minutes = v_lead,
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_ticket_reveal(text, integer)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_ticket_reveal(text, integer)
to service_role;

-- Órdenes aprobadas con al menos una entrada ya visible y sin mail de
-- habilitación. Las que siguen reservadas no entran: el job no las recorre
-- en cada pasada.
create or replace function public.list_ticket_orders_pending_reveal(p_limit integer default 40)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.ticket_orders o
  join public.events e on e.id = o.event_id
  where o.status = 'aprobado'
    and o.pass_revealed_at is null
    and exists (
      select 1
      from public.tickets t
      where t.order_id = o.id
        and t.status <> 'cancelada'
        and (
          t.valid_from is null
          or now() >= t.valid_from - make_interval(mins => e.ticket_reveal_lead_minutes)
        )
    )
  order by o.created_at
  limit greatest(coalesce(p_limit, 40), 1);
$$;

revoke all on function public.list_ticket_orders_pending_reveal(integer)
from public, anon, authenticated;

grant execute on function public.list_ticket_orders_pending_reveal(integer)
to service_role;
