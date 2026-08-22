-- El estado que se muestra tiene que ser el que pasó — PLU ARG
--
-- Dos correcciones sobre la misma causa: la app mostraba (y avisaba) el último
-- intento de cobro en lugar del hecho consolidado de la orden.
--
-- 1. Una transferencia con comprobante subido ya no se auto-cancela.
--
--    `register_athlete_payment_proof` corre `expires_at = now() + 48 horas` al
--    adjuntar el comprobante: ese plazo es la ventana de REVISIÓN de Finanzas,
--    no un plazo del atleta. Pero `expire_domain_orders` cancela cualquier orden
--    'pendiente'/'validacion_manual' vencida, así que a las 48 horas cancelaba
--    una orden cuya plata ya había entrado y sólo faltaba mirar el comprobante —
--    y arrastraba la inscripción a 'cancelada'. Después de eso `/approve` sale
--    por PLU10 ("la orden ya no admite aprobacion") y la única salida es la
--    acreditación forzada.
--
--    Es el mismo error que ya se corrigió para el efectivo en sede
--    (20260820150000): un vencimiento automático no puede comerse plata que
--    llegó. La regla acá es más simple que estirar la ventana: si hay
--    comprobante, la orden no se cancela sola nunca — espera una decisión
--    humana, que es aprobar o rechazar con motivo. Queda visible en la bandeja
--    de Finanzas, que ya lista 'validacion_manual' como estado abierto.
--
--    Las órdenes SIN comprobante (checkout abandonado, transferencia que nunca
--    se hizo) siguen venciendo igual: ahí no hay plata que proteger.
--
-- 2. El snapshot del atleta deja de mandar el payload crudo de Mercado Pago.
--
--    `get_athlete_snapshot` devolvía `to_jsonb(o.*)` por orden, y eso incluye
--    `provider_payload`: la respuesta completa de la API de MP, con el id del
--    pagador, los últimos cuatro dígitos de la tarjeta y los headers internos de
--    `api_response`. Iba al browser en cada carga de /mi-cuenta y era el 62% del
--    snapshot (16,7 KB de 6,3 KB útiles en una cuenta con dos órdenes).
--
--    Además de pesado, es la columna equivocada para mostrar: la pisa el último
--    intento aplicado. En la orden f336f4be (afiliación acreditada el 20/08) el
--    payload quedó con el intento RECHAZADO que se reprocesó 15 minutos después
--    de la acreditación. En su lugar viajan los intentos desde
--    `athlete_payments`, que es el libro real y está protegido por la guarda
--    monotónica de 20260818110000 — sin `raw_payload`, que es justamente el peso.

-- ---------------------------------------------------------------------------
-- 1. Vencimiento de órdenes: nunca sobre un comprobante sin revisar
-- ---------------------------------------------------------------------------

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
    update public.athlete_payment_orders o set status = 'cancelado', updated_at = now()
    where o.status in ('pendiente', 'validacion_manual') and o.expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'athlete' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
      -- Hay comprobante adjunto: esa orden la cierra una persona, no el cron.
      and o.payment_proof_uploaded_at is null
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
    and o.payment_proof_uploaded_at is not null;

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

-- ---------------------------------------------------------------------------
-- 2. Snapshot del atleta: el libro de intentos en vez del payload del proveedor
-- ---------------------------------------------------------------------------

create or replace function public.get_athlete_snapshot(p_athlete_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return jsonb_build_object(
    'athlete', to_jsonb(v_athlete),
    'memberships', (
      select coalesce(jsonb_agg(to_jsonb(m.*) order by m.created_at desc), '[]'::jsonb)
      from public.memberships m where m.athlete_id = p_athlete_id
    ),
    'registrations', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'registration', to_jsonb(r.*),
          'event', to_jsonb(e.*),
          'checkIn', to_jsonb(c.*),
          'schedule', plu_private.registration_schedule(r)
        )
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.event_registrations r
      join public.events e on e.id = r.event_id
      left join public.check_ins c on c.registration_id = r.id
      where r.athlete_id = p_athlete_id
    ),
    'paymentOrders', (
      select coalesce(jsonb_agg(
        -- `- 'provider_payload'`: se saca la columna, no se enumeran las otras
        -- veintitantas. Cualquier columna que se agregue a la tabla sigue
        -- llegando sola, y ésta no vuelve por descuido.
        (to_jsonb(o.*) - 'provider_payload') || jsonb_build_object(
          'attempts', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'external_payment_id', p.external_payment_id,
              'status', p.status,
              'status_detail', p.status_detail,
              'amount', p.amount,
              'confirmed_at', p.confirmed_at,
              'created_at', p.created_at,
              'updated_at', p.updated_at
            ) order by p.created_at), '[]'::jsonb)
            from public.athlete_payments p where p.order_id = o.id
          )
        )
        order by o.created_at desc
      ), '[]'::jsonb)
      from public.athlete_payment_orders o where o.athlete_id = p_athlete_id
    )
  );
end;
$$;

revoke all on function public.get_athlete_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_athlete_snapshot(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_source text;
begin
  select prosrc into v_source
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'expire_domain_orders';
  if v_source is null or v_source not like '%payment_proof_uploaded_at is null%' then
    raise exception 'expire_domain_orders sigue pudiendo cancelar un comprobante sin revisar.'
      using errcode = 'PLU01';
  end if;

  select prosrc into v_source
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_athlete_snapshot';
  -- La versión anterior no nombraba `provider_payload` en ningún lado: era
  -- `to_jsonb(o.*)` y la columna viajaba entera. Que aparezca nombrada, y
  -- restada, es la prueba de que esta versión la saca.
  if v_source is null
     or v_source not like '%- ''provider_payload''%'
     or v_source not like '%''attempts''%' then
    raise exception 'get_athlete_snapshot no está devolviendo el libro de intentos sin el payload crudo.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
