-- Pisar el precio del evento cancela la programación que quedó vieja — PLU ARG
--
-- Validación de aumentos programados (28/08/2026): `staff_upsert_event` (el
-- guardado del editor de eventos, última re-emisión en 20260920100000) escribe
-- `price = excluded.price, manual_price = excluded.manual_price` y no sabe que
-- existen `scheduled_price` / `price_effective_at`. La secuencia que rompía:
--
--   1. Tarifas programa "desde el lunes: $90.000".
--   2. Alguien guarda el evento desde su editor con el precio de hoy ($80.000).
--   3. El lunes el barrido aplica los $90.000 sobre un precio que el editor
--      acababa de decidir — o peor, aplica un aumento que Tarifas creía haber
--      reemplazado al ver el precio nuevo guardado.
--
-- `staff_set_event_registration_price` ya tiene la semántica correcta ("un
-- cambio inmediato reemplaza también al programado", 20260929100000): este
-- trigger le da la misma semántica a CUALQUIER escritor que cambie el precio
-- sin gestionar la programación — el upsert del editor hoy, y el que venga.
--
-- No molesta a los caminos que sí la gestionan: el barrido del cron y el cambio
-- inmediato de Tarifas limpian `price_effective_at` en su propio UPDATE, así
-- que entran con `new.price_effective_at` distinto de `old` y el trigger no
-- actúa. Guardar el evento sin tocar el precio tampoco dispara nada: el
-- trigger corre sólo cuando el precio realmente cambia.

create or replace function plu_private.cancel_stale_event_price_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
begin
  -- El escritor cambió el precio pero dejó la programación tal cual estaba:
  -- esa programación quedó razonando sobre un precio que ya no existe.
  if old.price_effective_at is not null
     and new.price_effective_at is not distinct from old.price_effective_at
     and new.scheduled_price is not distinct from old.scheduled_price
     and new.scheduled_manual_price is not distinct from old.scheduled_manual_price then
    perform plu_private.record_domain_audit(
      'event.registration_price_schedule_cancelled', 'event', new.id::text,
      'system', 'price-overwrite',
      jsonb_build_object(
        'eventSlug', new.slug,
        'scheduledPrice', old.scheduled_price,
        'scheduledManualPrice', old.scheduled_manual_price,
        'priceEffectiveAt', old.price_effective_at,
        'overwrittenPrice', new.price,
        'overwrittenManualPrice', new.manual_price
      ),
      new.organization_id
    );

    new.scheduled_price := null;
    new.scheduled_manual_price := null;
    new.price_effective_at := null;
  end if;

  return new;
end;
$$;

revoke all on function plu_private.cancel_stale_event_price_schedule()
  from public, anon, authenticated;

drop trigger if exists events_price_overwrite_cancels_schedule on public.events;
create trigger events_price_overwrite_cancels_schedule
  before update of price, manual_price on public.events
  for each row
  when (
    old.price is distinct from new.price
    or old.manual_price is distinct from new.manual_price
  )
  execute function plu_private.cancel_stale_event_price_schedule();

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if to_regprocedure('plu_private.cancel_stale_event_price_schedule()') is null then
    raise exception 'Falta la función que cancela la programación pisada.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'events_price_overwrite_cancels_schedule'
      and tgrelid = 'public.events'::regclass
  ) then
    raise exception 'Falta el trigger sobre events.';
  end if;
end
$verification$;
