-- Avisos en vivo de entradas y de órdenes — PLU ARG
--
-- El aviso de ingresos entre puestos ya existe (20270106100000, tópico
-- `event-checkin:<slug>`, evento `checkin-changed`). Faltaban dos cosas que una
-- puerta y Cobros necesitan ver sin esperar el sondeo:
--
--   1. `tickets-changed` en el MISMO tópico `event-checkin:<slug>`: una entrada
--      cancelada, aprobada, una invitación nueva. Con varias puertas, una
--      cancelación tiene que llegar a la lista offline del puesto antes de que
--      se quede sin señal. Mismo tópico para que cada puerta escuche un solo
--      canal; la política de lectura de 20270106100000 ya lo cubre.
--   2. `orders-changed` en `ticket-orders`: una venta, un comprobante subido,
--      una aprobación desde otra sesión. Cobros relee con sus filtros.
--
-- Mismo contrato que el resto de los avisos: el mensaje NO lleva datos de la
-- persona (sólo el slug, que de un meet publicado ya es público, o nada); el
-- navegador relee por la API con su sesión. Un aviso por sentencia (y por
-- evento): cargar 200 invitados emite uno, no 200. Una sentencia que no tocó
-- filas no avisa: el vencimiento de reservas hace su UPDATE cada minuto aunque
-- no venza nada, y sin ese corte cada pestaña de Cobros releería sin parar. Si
-- Realtime falla, el cambio se guarda igual y el sondeo lo cubre.

create or replace function public.broadcast_event_tickets_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
declare
  v_slug text;
begin
  begin
    for v_slug in
      select distinct e.slug
      from changed c join public.events e on e.id = c.event_id
    loop
      perform realtime.send(
        jsonb_build_object('eventSlug', v_slug),
        'tickets-changed',
        'event-checkin:' || v_slug,
        false
      );
    end loop;
  exception when others then
    -- Un fallo del aviso nunca puede impedir la venta o la cancelación.
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_event_tickets_change() from public, anon, authenticated;

create or replace function public.broadcast_ticket_orders_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
begin
  if not exists (select 1 from changed) then
    return null;
  end if;
  begin
    perform realtime.send(
      jsonb_build_object('scope', 'orders'),
      'orders-changed',
      'ticket-orders',
      false
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_ticket_orders_change() from public, anon, authenticated;

-- Postgres no admite tablas de transición en un trigger con varios eventos:
-- uno por evento, todos a nivel sentencia.
drop trigger if exists tickets_realtime_insert on public.tickets;
create trigger tickets_realtime_insert
after insert on public.tickets
referencing new table as changed
for each statement execute function public.broadcast_event_tickets_change();

drop trigger if exists tickets_realtime_update on public.tickets;
create trigger tickets_realtime_update
after update on public.tickets
referencing new table as changed
for each statement execute function public.broadcast_event_tickets_change();

drop trigger if exists ticket_orders_realtime_insert on public.ticket_orders;
create trigger ticket_orders_realtime_insert
after insert on public.ticket_orders
referencing new table as changed
for each statement execute function public.broadcast_ticket_orders_change();

drop trigger if exists ticket_orders_realtime_update on public.ticket_orders;
create trigger ticket_orders_realtime_update
after update on public.ticket_orders
referencing new table as changed
for each statement execute function public.broadcast_ticket_orders_change();

-- `ticket-orders` no lleva datos (ni siquiera el evento). `event-checkin:%` ya
-- tiene su política desde 20270106100000.
drop policy if exists ticket_orders_broadcast_read on realtime.messages;
create policy ticket_orders_broadcast_read
on realtime.messages
for select
to anon, authenticated
using (realtime.topic() = 'ticket-orders');

do $verification$
begin
  if (
    select count(*) from pg_trigger
    where tgname in (
      'tickets_realtime_insert', 'tickets_realtime_update',
      'ticket_orders_realtime_insert', 'ticket_orders_realtime_update'
    ) and not tgisinternal
  ) <> 4 then
    raise exception 'Faltan triggers de avisos de entradas u órdenes.' using errcode = 'PLU01';
  end if;
end
$verification$;
