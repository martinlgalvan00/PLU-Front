-- Aviso en vivo del catálogo público: cambiar un evento o un interruptor de la
-- plataforma emite `catalog-changed` en `public-catalog`, sin datos del evento.
-- Termina en rollback.

begin;

do $flow$
declare
  v_before bigint;
  v_after bigint;
  v_scopes text[];
begin
  select count(*) into v_before from realtime.messages where topic = 'public-catalog';

  update public.events set updated_at = now()
  where id = (select id from public.events limit 1);
  update public.platform_feature_toggles set updated_at = now();

  select count(*), array_agg(distinct payload->>'scope')
  into v_after, v_scopes
  from realtime.messages where topic = 'public-catalog';

  if v_after - v_before < 2 then
    raise exception 'esperaba un aviso por evento y otro por interruptores, hubo %', v_after - v_before;
  end if;
  if not (v_scopes @> array['events', 'checkout']) then
    raise exception 'faltan alcances en los avisos: %', v_scopes;
  end if;

  -- El mensaje no lleva datos del evento: solo el alcance (y el id del mensaje
  -- que agrega `realtime.send`).
  if exists (
    select 1 from realtime.messages
    where topic = 'public-catalog' and (payload - 'scope' - 'id') <> '{}'::jsonb
  ) then
    raise exception 'el aviso no debe llevar datos del evento';
  end if;
end
$flow$;

rollback;
