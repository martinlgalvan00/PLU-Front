-- El vencimiento automático no puede pisar un pago que Mercado Pago ya reportó.
--
-- `get_payment_system_health()` marcaba "1 orden de entrada desalineada" (y podía
-- marcar lo mismo del lado de atletas) sin que hubiera ningún pago real perdido: la
-- causa no está en el chequeo de salud, que sólo compara `ticket_orders.status` /
-- `athlete_payment_orders.status` contra el rollup de sus pagos -- está en que
-- `expire_ticket_reservations` y `expire_domain_orders` son el único camino que
-- escribe esos `status` SIN pasar por ese mismo rollup.
--
-- `apply_ticket_mercado_pago_payment` / `apply_mercado_pago_payment` siempre
-- recalculan el estado de la orden a partir de TODAS sus filas de pago (aprobado >
-- pendiente > reembolsado > rechazado > cancelado), así que mientras el único
-- escritor sea ese camino, orden y pagos nunca se desalinean. Pero
-- `expire_ticket_reservations` corre cada minuto y cancela cualquier orden
-- 'creado'/'pendiente' cuya `reservation_expires_at` venció, mirando sólo si hay un
-- `embedded_payment_attempts` en vuelo -- no mira `ticket_payments`. Una orden en
-- 'pendiente' sólo llega ahí porque YA existe una fila de pago con status
-- 'pendiente' (un medio offline tipo Rapipago/Pago Fácil, que Mercado Pago puede
-- tardar días en resolver): el cron la cancelaba igual, dejando `ticket_orders`
-- en 'cancelado' con un pago que seguía viajando. `get_payment_system_health`
-- comparaba bien -- lo que estaba mal era que el estado local ya no reflejaba lo
-- que Mercado Pago tenía en curso.
--
-- Es el mismo error que 20260907100000 corrigió para el comprobante de
-- transferencia ("un vencimiento automático no puede comerse plata que llegó"),
-- sólo que ese fix protegía `payment_proof_uploaded_at` y dejó afuera el caso del
-- pago de Mercado Pago que queda 'pendiente'. Acá se cierra con la misma regla:
-- si ya hay una fila de pago viajando, la cancela una persona o la resuelve el
-- webhook -- nunca el cron de reserva.
--
-- Las órdenes 'creado' (nunca llegaron a tener un intento de pago) siguen
-- venciendo exactamente igual: ahí no hay nada que proteger.

create or replace function public.expire_ticket_reservations(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.ticket_orders o
    set status = 'cancelado', updated_at = now()
    where o.status in ('creado', 'pendiente')
      and o.reservation_expires_at is not null
      and o.reservation_expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'ticket' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
      -- Ya hay un pago de Mercado Pago en curso para esta orden: lo resuelve el
      -- webhook o una persona, no el vencimiento de la reserva.
      and not exists (
        select 1 from public.ticket_payments p
        where p.order_id = o.id and p.status = 'pendiente'
      )
    returning o.id
  ), cancelled as (
    update public.tickets t set status = 'cancelada', updated_at = now()
    where t.order_id in (select id from expired) and t.status = 'pendiente_pago'
    returning t.order_id
  )
  select count(distinct order_id) into v_count from cancelled;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_ticket_reservations(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_ticket_reservations(timestamptz) to service_role;

create or replace function public.expire_domain_orders(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orders int;
  v_registrations int;
  v_held int;
begin
  with expired as (
    update public.athlete_payment_orders o
    set status = 'cancelado',
        updated_at = now(),
        cancelled_at = now(),
        cancellation_code = case
          when exists (
            select 1 from public.athlete_payments p where p.order_id = o.id
          ) then 'expired_after_failed_attempt'
          else 'expired_without_payment'
        end,
        cancelled_by = 'system:expire_domain_orders'
    where o.status in ('pendiente', 'validacion_manual') and o.expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'athlete' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
      -- Hay comprobante adjunto: esa orden la cierra una persona, no el cron.
      and o.payment_proof_uploaded_at is null
      -- Ya hay un pago de Mercado Pago en curso para esta orden: lo resuelve el
      -- webhook o una persona, no el vencimiento del plazo.
      and not exists (
        select 1 from public.athlete_payments p
        where p.order_id = o.id and p.status = 'pendiente'
      )
    returning o.id
  ), cancelled as (
    update public.event_registrations r set status = 'cancelada', updated_at = now()
    where r.payment_order_id in (select id from expired) and r.status = 'pendiente_pago'
    returning r.id
  )
  select (select count(*) from expired), (select count(*) from cancelled)
    into v_orders, v_registrations;

  -- Lo retenido se informa: una orden que el cron decide no tocar tiene que ser
  -- un número visible en el job, no un silencio.
  select count(*) into v_held
  from public.athlete_payment_orders o
  where o.status in ('pendiente', 'validacion_manual')
    and o.expires_at <= p_now
    and (
      o.payment_proof_uploaded_at is not null
      or exists (
        select 1 from public.athlete_payments p
        where p.order_id = o.id and p.status = 'pendiente'
      )
    );

  return jsonb_build_object(
    'orders', coalesce(v_orders, 0),
    'registrations', coalesce(v_registrations, 0),
    'heldForReview', coalesce(v_held, 0)
  );
end;
$$;

revoke all on function public.expire_domain_orders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_domain_orders(timestamptz) to service_role;

do $verification$
begin
  if to_regprocedure('public.expire_ticket_reservations(timestamptz)') is null
    or to_regprocedure('public.expire_domain_orders(timestamptz)') is null then
    raise exception 'La verificación del vencimiento de órdenes no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
