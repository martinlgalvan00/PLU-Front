-- Dueño de una compra de entradas.
--
-- Hasta acá la orden era anónima: se recuperaba con referencia + mail, o con
-- la clave del mail. Si la persona compró logueada, la orden queda suya
-- (`buyer_athlete_id` o `buyer_staff_user_id`). El asistente se reconoce por
-- el documento normalizado, no por el mail que tipeó el comprador.
--
-- No se toca `create_ticket_order_v3`: el id se graba después del alta. Si
-- esta migración todavía no corrió, ese update se degrada y la compra sigue.

alter table public.ticket_orders
  add column if not exists buyer_athlete_id uuid references public.athletes (id) on delete set null,
  add column if not exists buyer_staff_user_id text;

create index if not exists ticket_orders_buyer_athlete_idx
  on public.ticket_orders (buyer_athlete_id)
  where buyer_athlete_id is not null;

create index if not exists ticket_orders_buyer_staff_idx
  on public.ticket_orders (buyer_staff_user_id)
  where buyer_staff_user_id is not null;

-- Misma clave que `documentKey` en server/modules/ticketing/accountTickets.js:
-- mayúsculas y sólo letras o números. `12.345.678` y `12345678` son la misma
-- persona. El DNI se guardó tal cual llegó el formulario.
alter table public.tickets
  add column if not exists attendee_document_key text
  generated always as (
    nullif(regexp_replace(upper(coalesce(attendee_dni, '')), '[^A-Z0-9]', '', 'g'), '')
  ) stored;

create index if not exists tickets_attendee_document_key_idx
  on public.tickets (attendee_document_key)
  where attendee_document_key is not null;

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ticket_orders'
      and column_name = 'buyer_athlete_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ticket_orders'
      and column_name = 'buyer_staff_user_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tickets'
      and column_name = 'attendee_document_key'
      and is_generated = 'ALWAYS'
  ) then
    raise exception 'La compra de entradas no quedó atada a la cuenta.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
