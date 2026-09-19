-- Entradas vendidas por evento: suma canal de pago y comprador al listado.
--
-- `staff_list_tickets_for_event` alimenta hoy `GET /api/tickets?eventSlug=`, consumido por
-- el scanner de Check-in y por `AdminEventTicketAddonReport`. Ninguno de los dos necesita
-- saber quién compró ni por qué canal -- pero la vista nueva "Entradas vendidas" (capítulo
-- de Ventas en el workspace del evento) sí: sin esto, mostrar "canal de pago" o "comprador"
-- en esa tabla exigiría una consulta aparte por cada fila.
--
-- Aditivo y seguro: se suma un `left join` a `ticket_orders` y una clave `order` nueva en el
-- jsonb -- la firma no cambia (`text` -> `jsonb`), y el único caller,
-- `supabaseTicketRepository.js:listForEvent`, es un passthrough puro que no filtra claves.
-- Los consumidores existentes (`toCamelTicket`, Check-in) ignoran una clave que no leen.
--
-- Los campos del sub-objeto `order` van en snake_case, igual que el resto de la fila
-- `ticket` (`to_jsonb(t.*)`), para poder reusar `toCamelOrder` (ya existe en
-- `src/services/ticketApi.js`) del lado JS sin escribir un mapeo nuevo.

create or replace function public.staff_list_tickets_for_event(p_event_slug text)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ticket', to_jsonb(t.*) || jsonb_build_object('ticketTypeName', tt.name),
      'checkIn', to_jsonb(c.*),
      'order', case when o.id is null then null else jsonb_build_object(
        'id', o.id,
        'reference', o.reference,
        'status', o.status,
        'provider', o.provider,
        'manual_payment_channel', o.manual_payment_channel,
        'buyer_name', o.buyer_name,
        'buyer_email', o.buyer_email
      ) end
    ) order by t.created_at desc
  ), '[]'::jsonb)
  from public.tickets t
  join public.events e on e.id = t.event_id
  left join public.ticket_types tt on tt.id = t.ticket_type_id
  left join public.check_ins c on c.ticket_id = t.id
  left join public.ticket_orders o on o.id = t.order_id
  where e.slug = p_event_slug;
$$;

revoke all on function public.staff_list_tickets_for_event(text) from public, anon, authenticated;
grant execute on function public.staff_list_tickets_for_event(text) to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_list_tickets_for_event(text)') is null then
    raise exception 'La verificación del listado de entradas con canal de pago no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
