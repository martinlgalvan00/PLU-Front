-- Aviso de ingreso entre puestos.
--
-- El canal sólo lleva el slug. Cada teléfono vuelve a leer la lista por la
-- API con su sesión. No se emiten nombre, DNI, QR ni el registro crudo.

create or replace function public.broadcast_event_checkin_change()
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
      'checkin-changed',
      'event-checkin:' || v_event_slug,
      false
    );
  end if;

  return null;
end;
$$;

drop trigger if exists check_ins_realtime on public.check_ins;
create trigger check_ins_realtime
after insert on public.check_ins
for each row execute function public.broadcast_event_checkin_change();

-- El slug de un meet publicado ya es público. La política no abre la tabla
-- de ingresos: sólo este tópico, y el cuerpo no tiene datos de la persona.
drop policy if exists event_checkin_broadcast_read on realtime.messages;
create policy event_checkin_broadcast_read
on realtime.messages
for select
to anon, authenticated
using (realtime.topic() like 'event-checkin:%');
