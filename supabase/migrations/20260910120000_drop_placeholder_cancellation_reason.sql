-- El relleno del backfill no es el motivo de la orden — PLU ARG
--
-- 20260910100000 marcó las órdenes que quedaron cerradas debajo de un derecho
-- otorgado, y les copió como `cancellation_reason` el motivo del otorgamiento
-- manual. Para las tres inscripciones eso es correcto y útil ("RECIBÍ EL PAGO Y
-- TODA LA INFORMACIÓN CORRECTAMENTE").
--
-- Para las tres afiliaciones copió el texto de relleno -- "Sin motivo registrado
-- (anterior a ...)" -- porque no había ninguno que recuperar. Ese texto está
-- bien donde lo puso el backfill, en `memberships.manual_override_reason`: ahí
-- es un hueco visible y la pantalla lo muestra como pendiente. Pero como
-- `cancellation_reason` de la orden es peor que nada: `derivePaymentProgress`
-- devuelve el texto libre con prioridad sobre el catálogo, así que la fila de
-- pagos mostraría "Sin motivo registrado" en lugar de la frase que el operador
-- necesita leer -- "el cobro no entró por este canal, el derecho se otorgó a
-- mano, no corresponde acreditar esta orden".
--
-- Se limpia la columna. `cancellation_code` = 'resolved_off_platform' sigue
-- estando, que es el hecho, y la explicación sale del catálogo de i18n.

update public.athlete_payment_orders
set cancellation_reason = null
where cancellation_reason like 'Sin motivo registrado%';

do $verification$
declare
  v_leftover int;
begin
  select count(*) into v_leftover
  from public.athlete_payment_orders
  where cancellation_reason like 'Sin motivo registrado%';
  if v_leftover > 0 then
    raise exception 'Quedan % ordenes con el relleno del backfill como motivo.', v_leftover
      using errcode = 'PLU01';
  end if;

  -- El hueco tiene que seguir estando donde sí corresponde: si esto se vacía,
  -- las afiliaciones sin motivo dejan de aparecer como pendientes y el problema
  -- se vuelve invisible en vez de resuelto.
  if not exists (
    select 1 from public.memberships
    where manual_override_reason like 'Sin motivo registrado%'
  ) then
    raise warning 'No hay afiliaciones con motivo pendiente: verificar que alguien lo haya completado y no que se haya borrado.';
  end if;
end
$verification$;
