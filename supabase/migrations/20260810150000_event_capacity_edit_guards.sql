-- Evita que una edición administrativa deje cupos por debajo de derechos ya
-- reservados. Las mismas filas cuentan para el alta y para la edición.

create or replace function public.guard_event_capacity_on_edit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reserved int;
begin
  if new.capacity is null or new.capacity = old.capacity then
    return new;
  end if;

  select count(*) into v_reserved
  from public.event_registrations
  where event_id = old.id and status <> 'cancelada';

  if new.capacity < v_reserved then
    raise exception 'El cupo no puede ser menor a las % inscripciones reservadas.', v_reserved
      using errcode = 'PLU04';
  end if;
  return new;
end;
$$;

drop trigger if exists events_capacity_edit_guard on public.events;
create trigger events_capacity_edit_guard
before update of capacity on public.events
for each row execute function public.guard_event_capacity_on_edit();

create or replace function public.guard_ticket_type_quota_on_edit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_reserved int;
begin
  if new.quota is null or new.quota is not distinct from old.quota then
    return new;
  end if;

  select count(*) into v_reserved
  from public.tickets
  where ticket_type_id = old.id and status <> 'cancelada';

  if new.quota < v_reserved then
    raise exception 'El cupo de % no puede ser menor a las % entradas reservadas.', old.name, v_reserved
      using errcode = 'PLU05';
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_types_quota_edit_guard on public.ticket_types;
create trigger ticket_types_quota_edit_guard
before update of quota on public.ticket_types
for each row execute function public.guard_ticket_type_quota_on_edit();

revoke all on function public.guard_event_capacity_on_edit() from public, anon, authenticated;
revoke all on function public.guard_ticket_type_quota_on_edit() from public, anon, authenticated;
