-- Borrado definitivo de un evento desde el panel (solo Super Admin llega aca:
-- el endpoint lo protege con requireRole(['admin_maximal'])).
--
-- Las FK hacia events estan mezcladas a proposito: la configuracion del evento
-- cae por cascade (event_days, ticket_types, event_sessions, capacidad, combo)
-- pero todo lo que es plata o presencia real -- ticket_orders, tickets,
-- event_registrations, check_ins -- es on delete restrict para que nada
-- operativo desaparezca por accidente. Por eso el borrado vive aca, en una
-- sola funcion: Postgres la ejecuta como transaccion atomica y cualquier paso
-- que falle aborta todo sin dejar el evento a medias.
--
-- Orden obligado por las FK restrict:
--   check_ins -> ticket_payments -> tickets -> ticket_orders ->
--   event_registrations -> event_sessions -> ticket_types -> event_days ->
--   event_capacity_rules -> event_combo_offers -> events
-- (event_sessions referencia event_days con restrict y tickets referencia
-- ticket_types con restrict, asi que el orden entre esos pares no es opcional
-- aunque las dos tablas caigan igual por cascade.)
-- Caen solas por cascade: ticket_type_days y ticket_type_included_addons.
-- NO se borran domain_audit_logs ni transactional_email_logs: son el historial
-- y referencian por id textual, sin FK.
-- Los comprobantes en storage (ticket-payment-proofs) los borra el backend
-- despues de esta RPC con los order id que devuelve: SQL no alcanza a storage.
-- Las cuentas de seguridad del evento viven en Prisma y las purga el endpoint.
--
-- p_dry_run devuelve el impacto sin tocar nada: es lo que alimenta el dialogo
-- de confirmacion del panel, para que el operador vea cuantas inscripciones,
-- entradas y acreditaciones se lleva puestas antes de decidir.
-- p_force es el segundo tramo del mismo dialogo: si el evento ya movio plata o
-- gente (inscripciones pagadas, entradas pagadas, ordenes cobradas o
-- check-ins), el borrado se rechaza salvo que el pedido lo diga explicito.

create or replace function public.delete_event(
  p_event_slug text,
  p_actor text default null,
  p_force boolean default false,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_registrations int;
  v_paid_registrations int;
  v_tickets int;
  v_paid_tickets int;
  v_ticket_orders int;
  v_settled_orders int;
  v_check_ins int;
  v_days int;
  v_sessions int;
  v_ticket_types int;
  v_impact jsonb;
  v_requires_force boolean;
  v_proof_order_ids jsonb;
begin
  if coalesce(trim(p_event_slug), '') = '' then
    raise exception 'Falta el identificador publico del evento.' using errcode = 'PLU01';
  end if;

  -- Mismo candado que staff_save_event: un borrado no puede cruzarse con un
  -- guardado del mismo slug y dejar filas recreadas colgando de un evento que
  -- ya no existe.
  perform pg_advisory_xact_lock(
    hashtextextended('staff_save_event:' || p_event_slug, 0)
  );

  select * into v_event from public.events
  where slug = p_event_slug for update;
  if not found then
    raise exception 'El evento no existe o ya fue eliminado.' using errcode = 'PLU02';
  end if;

  select
    count(*),
    count(*) filter (where status in ('pagada', 'confirmada'))
  into v_registrations, v_paid_registrations
  from public.event_registrations where event_id = v_event.id;

  select
    count(*),
    count(*) filter (where status = 'pagada')
  into v_tickets, v_paid_tickets
  from public.tickets where event_id = v_event.id;

  select
    count(*),
    count(*) filter (where status in ('aprobado', 'reembolsado'))
  into v_ticket_orders, v_settled_orders
  from public.ticket_orders where event_id = v_event.id;

  select count(*) into v_check_ins
  from public.check_ins where event_id = v_event.id;

  select count(*) into v_days from public.event_days where event_id = v_event.id;
  select count(*) into v_sessions from public.event_sessions where event_id = v_event.id;
  select count(*) into v_ticket_types from public.ticket_types where event_id = v_event.id;

  v_requires_force :=
    v_paid_registrations > 0
    or v_paid_tickets > 0
    or v_settled_orders > 0
    or v_check_ins > 0;

  v_impact := jsonb_build_object(
    'registrations', v_registrations,
    'paidRegistrations', v_paid_registrations,
    'tickets', v_tickets,
    'paidTickets', v_paid_tickets,
    'ticketOrders', v_ticket_orders,
    'settledTicketOrders', v_settled_orders,
    'checkIns', v_check_ins,
    'eventDays', v_days,
    'eventSessions', v_sessions,
    'ticketTypes', v_ticket_types
  );

  if p_dry_run then
    return jsonb_build_object(
      'id', v_event.id,
      'slug', v_event.slug,
      'title', v_event.title,
      'startsAt', v_event.starts_at,
      'status', v_event.status,
      'published', v_event.published,
      'impact', v_impact,
      'requiresForce', v_requires_force,
      'deleted', false
    );
  end if;

  if v_requires_force and not coalesce(p_force, false) then
    raise exception
      'El evento ya tiene actividad real (% inscripciones pagadas, % entradas pagadas, % ordenes cobradas, % acreditaciones). Confirma el borrado definitivo para continuar.',
      v_paid_registrations, v_paid_tickets, v_settled_orders, v_check_ins
      using errcode = 'PLU03';
  end if;

  -- Se junta antes de borrar: despues del delete no hay de donde sacar las
  -- ordenes cuyos comprobantes quedan huerfanos en storage.
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_proof_order_ids
  from public.ticket_orders
  where event_id = v_event.id and payment_proof_path is not null;

  delete from public.check_ins where event_id = v_event.id;

  delete from public.ticket_payments
  where order_id in (select id from public.ticket_orders where event_id = v_event.id);

  delete from public.tickets where event_id = v_event.id;
  delete from public.ticket_orders where event_id = v_event.id;
  delete from public.event_registrations where event_id = v_event.id;
  delete from public.event_sessions where event_id = v_event.id;
  delete from public.ticket_types where event_id = v_event.id;
  delete from public.event_days where event_id = v_event.id;
  delete from public.event_capacity_rules where event_id = v_event.id;
  delete from public.event_combo_offers where event_id = v_event.id;

  delete from public.events where id = v_event.id;

  perform plu_private.record_domain_audit(
    'event.deleted',
    'event',
    v_event.id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'slug', v_event.slug,
      'title', v_event.title,
      'startsAt', v_event.starts_at,
      'status', v_event.status,
      'published', v_event.published,
      'forced', coalesce(p_force, false),
      'removed', v_impact
    ),
    v_event.organization_id
  );

  return jsonb_build_object(
    'id', v_event.id,
    'slug', v_event.slug,
    'title', v_event.title,
    'startsAt', v_event.starts_at,
    'status', v_event.status,
    'published', v_event.published,
    'impact', v_impact,
    'requiresForce', v_requires_force,
    'proofOrderIds', v_proof_order_ids,
    'deleted', true
  );
end;
$$;

-- Solo el backend (service role) puede ejecutarla: nunca desde el browser.
revoke all on function public.delete_event(text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.delete_event(text, text, boolean, boolean)
  to service_role;
