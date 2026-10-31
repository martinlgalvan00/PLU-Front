-- El listado que lee la puerta traía cualquier check-in del ticket.
-- En un pase de dos jornadas, el ingreso de mañana marcaba "ya ingresó"
-- hoy y el escaneo fresco (que sí mira la ventana del día) quedaba pisado.
-- Acá el check-in que viaja es sólo el de la ventana vigente.

create or replace function public.staff_list_tickets_for_event(p_event_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'ticket', to_jsonb(t.*) || jsonb_build_object(
        'ticketTypeName', tt.name,
        'access_usage_mode', tt.access_usage_mode,
        'valid_from', w.valid_from,
        'valid_until', w.valid_until,
        'validity_status', w.validity_status,
        'access_window_key', w.access_window_key
      ),
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
  left join lateral plu_private.resolve_ticket_type_access_window(t.id, clock_timestamp()) w on true
  left join lateral (
    select ci.*
    from public.check_ins ci
    where ci.ticket_id = t.id
      and ci.access_window_key = w.access_window_key
    order by ci.scanned_at desc
    limit 1
  ) c on true
  left join public.ticket_orders o on o.id = t.order_id
  where e.slug = p_event_slug;
$$;

revoke all on function public.staff_list_tickets_for_event(text) from public, anon, authenticated;
grant execute on function public.staff_list_tickets_for_event(text) to service_role;
