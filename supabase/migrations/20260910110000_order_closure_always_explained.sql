-- Ningún cierre de orden queda sin motivo, venga del camino que venga — PLU ARG
--
-- 20260910100000 hizo que el motivo de cierre sea un dato y selló el camino del
-- cron. Pero hay diez lugares distintos que ponen una orden en 'cancelado':
-- el vencimiento, el rechazo del staff, el reemplazo por cambio de canal, el
-- reintento tras una inscripción cancelada, la corrección de año de afiliación,
-- el combo que se rearma, la renovación que se pisa. Varios son la misma función
-- redefinida cuatro veces a lo largo de dos meses.
--
-- Sellar el motivo función por función significa reemitir diez cuerpos de
-- función para agregarle dos columnas a cada UPDATE, y que el próximo camino que
-- alguien escriba vuelva a nacer sin motivo. El invariante "toda orden cerrada
-- dice por qué" no puede depender de que cada autor se acuerde.
--
-- Va como trigger: es el único lugar por el que pasan los diez caminos.
--
-- Lo que el trigger NO hace: adivinar. Sólo clasifica lo que puede probar
-- contra la fila y el libro de cobros. Si el camino que cerró la orden declaró
-- un motivo, lo respeta y no lo pisa -- el trigger es la red, no la autoridad.
--
-- Queda un caso que el trigger puede describir pero no nombrar: la orden que se
-- cierra ANTES de su vencimiento porque se la reemplazó por una nueva. La orden
-- nueva se inserta después del UPDATE que cierra la vieja, dentro de la misma
-- transacción, así que en el momento en que corre el trigger todavía no existe y
-- no hay nada que mirar. Se marca `closed_before_expiry`, que es exactamente lo
-- que se puede afirmar, y no `superseded_by_new_order`, que sería una
-- suposición correcta el 90% de las veces y mentira el 10% restante.

alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_cancellation_code_check;

alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_cancellation_code_check
  check (cancellation_code is null or cancellation_code in (
    'expired_without_payment',
    'expired_after_failed_attempt',
    'provider_cancelled',
    'cancelled_by_staff',
    'superseded_by_new_order',
    'resolved_off_platform',
    -- Se cerró antes de su vencimiento y el camino que la cerró no declaró
    -- motivo. En la práctica es casi siempre un reemplazo (cambio de canal, de
    -- plan o de evento), pero eso no se puede probar desde acá.
    'closed_before_expiry'
  ));

create or replace function plu_private.stamp_order_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sólo la transición hacia un estado cerrado. Una orden que ya estaba
  -- cancelada y se toca por otra razón no se re-sella: el primer cierre es el
  -- que explica la orden.
  if new.status not in ('cancelado', 'rechazado') then
    return new;
  end if;
  if old.status = new.status then
    return new;
  end if;

  new.cancelled_at := coalesce(new.cancelled_at, now());

  -- El camino ya dijo por qué. El trigger no discute.
  if new.cancellation_code is not null then
    return new;
  end if;

  new.cancellation_code := case
    -- Un rechazo con motivo escrito es una decisión humana registrada.
    when new.rejection_reason is not null then 'cancelled_by_staff'
    -- Venció. La distinción con/sin intento sale del libro de cobros, no de una
    -- suposición: para el reclamo no es lo mismo "no llegó a pagar" que "quiso
    -- pagar y el medio de pago lo rechazó".
    when new.expires_at is not null and now() >= new.expires_at then
      case
        when exists (select 1 from public.athlete_payments p where p.order_id = new.id)
          then 'expired_after_failed_attempt'
        else 'expired_without_payment'
      end
    else 'closed_before_expiry'
  end;

  new.cancellation_reason := coalesce(new.cancellation_reason, new.rejection_reason);
  new.cancelled_by := coalesce(new.cancelled_by, new.rejected_by::text);

  return new;
end;
$$;

drop trigger if exists stamp_order_closure on public.athlete_payment_orders;
create trigger stamp_order_closure
  before update of status on public.athlete_payment_orders
  for each row
  execute function plu_private.stamp_order_closure();

comment on function plu_private.stamp_order_closure() is
  'Red de seguridad: toda orden que se cierra queda con cancelled_at y un cancellation_code que se puede probar. No pisa el motivo que declaro el camino que la cerro.';

-- ---------------------------------------------------------------------------
-- Backfill del caso que quedó: reemplazo con evidencia
-- ---------------------------------------------------------------------------
--
-- Una orden cerrada en el mismo instante -- al microsegundo -- en que se creó
-- otra del mismo atleta y del mismo concepto es un reemplazo, no una
-- coincidencia: las dos escrituras salieron de la misma transacción. Acá sí se
-- puede nombrar `superseded_by_new_order`, porque hay con qué probarlo.

update public.athlete_payment_orders o
set cancellation_code = 'superseded_by_new_order',
    cancelled_at = coalesce(o.cancelled_at, o.updated_at)
where o.status in ('cancelado', 'rechazado')
  and o.cancellation_code is null
  and exists (
    select 1 from public.athlete_payment_orders n
    where n.athlete_id = o.athlete_id
      and n.concept = o.concept
      and n.id <> o.id
      and n.created_at = o.updated_at
  );

-- Lo que siga sin motivo se cerró antes de vencer por un camino que no lo
-- declara. Se dice eso y nada más.
update public.athlete_payment_orders o
set cancellation_code = 'closed_before_expiry',
    cancelled_at = coalesce(o.cancelled_at, o.updated_at)
where o.status in ('cancelado', 'rechazado')
  and o.cancellation_code is null;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_unexplained int;
  v_source text;
begin
  select count(*) into v_unexplained
  from public.athlete_payment_orders
  where status in ('cancelado', 'rechazado') and cancellation_code is null;
  if v_unexplained > 0 then
    raise exception 'Quedan % ordenes cerradas sin motivo despues del backfill.', v_unexplained
      using errcode = 'PLU01';
  end if;

  -- El trigger tiene que estar enganchado al UPDATE de status, no sólo existir
  -- la función: un `create function` sin `create trigger` deja el invariante
  -- documentado y sin efecto.
  if not exists (
    select 1
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'athlete_payment_orders'
      and tg.tgname = 'stamp_order_closure'
      and not tg.tgisinternal
  ) then
    raise exception 'El trigger stamp_order_closure no quedo instalado sobre athlete_payment_orders.'
      using errcode = 'PLU01';
  end if;

  select prosrc into v_source
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'plu_private' and p.proname = 'stamp_order_closure';
  -- Las dos propiedades que hacen que esto sirva: clasifica el vencimiento y no
  -- pisa el motivo que ya trae la fila.
  if v_source is null
     or v_source not like '%expired_after_failed_attempt%'
     or v_source not like '%new.cancellation_code is not null%' then
    raise exception 'stamp_order_closure no tiene la forma esperada.' using errcode = 'PLU01';
  end if;
end
$verification$;
