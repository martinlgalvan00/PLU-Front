-- Realtime del catálogo público: el estado de un evento se refleja al instante.
--
-- Hasta ahora una pestaña pública se enteraba de que un evento se cerró, se
-- pausó o cambió su ventana de inscripción recién en el próximo sondeo (30 s).
-- Este aviso lo adelanta: cuando cambia un evento o un interruptor operativo de
-- la plataforma, se emite un mensaje en el tópico `public-catalog` y el
-- navegador vuelve a leer el catálogo y la disponibilidad de cobros.
--
-- El mensaje no lleva datos del evento ni del interruptor (solo qué grupo
-- cambió): el navegador siempre relee lo público a través de Express, igual que
-- con los cupos (20260817130000_event_capacity_realtime.sql). Es una cortesía:
-- si Realtime falla, el guardado sigue y el sondeo lo cubre.

create or replace function public.broadcast_public_catalog_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('scope', coalesce(tg_argv[0], 'events')),
      'catalog-changed',
      'public-catalog',
      false
    );
  exception when others then
    -- Un fallo del aviso nunca puede impedir guardar el cambio que lo origina.
    null;
  end;
  return null;
end;
$$;

revoke all on function public.broadcast_public_catalog_change() from public, anon, authenticated;

-- A nivel sentencia: guardar un evento toca varias filas (días, tipos) y un solo
-- aviso por operación alcanza.
drop trigger if exists events_public_catalog_realtime on public.events;
create trigger events_public_catalog_realtime
after insert or update or delete on public.events
for each statement execute function public.broadcast_public_catalog_change('events');

drop trigger if exists platform_feature_toggles_public_catalog_realtime
  on public.platform_feature_toggles;
create trigger platform_feature_toggles_public_catalog_realtime
after insert or update or delete on public.platform_feature_toggles
for each statement execute function public.broadcast_public_catalog_change('checkout');

drop trigger if exists platform_payment_channels_public_catalog_realtime
  on public.platform_payment_channels;
create trigger platform_payment_channels_public_catalog_realtime
after insert or update or delete on public.platform_payment_channels
for each statement execute function public.broadcast_public_catalog_change('checkout');

-- Canal anónimo, solo lectura, solo este tópico: no habilita leer tablas de
-- dominio ni otros tópicos de Realtime.
drop policy if exists public_catalog_broadcast_read on realtime.messages;
create policy public_catalog_broadcast_read
on realtime.messages
for select
to anon, authenticated
using (realtime.topic() = 'public-catalog');

do $verification$
begin
  if to_regprocedure('public.broadcast_public_catalog_change()') is null then
    raise exception 'La función de aviso del catálogo no quedó creada.' using errcode = 'PLU01';
  end if;
  if (
    select count(*) from pg_trigger
    where tgname in (
      'events_public_catalog_realtime',
      'platform_feature_toggles_public_catalog_realtime',
      'platform_payment_channels_public_catalog_realtime'
    ) and not tgisinternal
  ) <> 3 then
    raise exception 'Faltan triggers del catálogo público.' using errcode = 'PLU01';
  end if;
end;
$verification$;
