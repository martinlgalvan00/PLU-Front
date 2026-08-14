-- Realtime de cupos públicos.
--
-- El canal sólo lleva el slug del evento: el navegador siempre relee el
-- summary sanitizado por Express. No se emiten atletas, DNI, pagos ni el
-- registro crudo que originó el cambio.

create or replace function public.broadcast_event_capacity_change()
returns trigger
security definer
set search_path = public, realtime
language plpgsql
as $$
declare
  v_event_id uuid := coalesce(new.event_id, old.event_id);
  v_event_slug text;
begin
  select slug
  into v_event_slug
  from public.events
  where id = v_event_id;

  if v_event_slug is not null then
    perform realtime.send(
      jsonb_build_object('eventSlug', v_event_slug),
      'capacity-changed',
      'event-capacity:' || v_event_slug,
      false
    );
  end if;

  return null;
end;
$$;

drop trigger if exists event_registrations_capacity_realtime on public.event_registrations;
create trigger event_registrations_capacity_realtime
after insert or update of status, event_id or delete
on public.event_registrations
for each row execute function public.broadcast_event_capacity_change();

-- El canal es anónimo porque el slug de un evento publicado ya es público.
-- La política no habilita leer ninguna tabla de dominio ni recibir otros
-- tópicos de Realtime.
drop policy if exists event_capacity_broadcast_read on realtime.messages;
create policy event_capacity_broadcast_read
on realtime.messages
for select
to anon, authenticated
using (realtime.topic() like 'event-capacity:%');
