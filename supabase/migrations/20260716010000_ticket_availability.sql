-- ticket_availability — PLU ARG
--
-- create_ticket_order_v2 (20260716000000_infrastructure_hardening.sql) ya
-- valida cupo (event_capacity_rules) al momento de comprar, pero recién
-- ahi: el público llena todo el formulario de entradas para enterarse
-- "Evento agotado" en el último paso. Esta función expone la misma cuenta
-- (limite - reservado) en modo solo lectura, para que la UI pública pueda
-- mostrar "quedan N entradas" o "agotado" antes del checkout.
--
-- Mismo patrón que el resto de las RPC públicas: SECURITY DEFINER porque
-- event_capacity_rules y tickets no son legibles directo por anon (RLS),
-- revocada de anon/authenticated y llamada solo por el backend Express con
-- el service_role.

create or replace function public.get_event_ticket_availability(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_limit int;
  v_reserved int;
  v_day_pass text;
  v_result jsonb := '{}'::jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;

  perform public.expire_ticket_reservations(now());

  select limit_count into v_limit from public.event_capacity_rules
  where event_id = v_event.id and scope = 'event' and key = '';
  if v_limit is null then
    v_result := jsonb_set(v_result, '{event}', jsonb_build_object('limit', null, 'remaining', null));
  else
    select count(*) into v_reserved from public.tickets
    where event_id = v_event.id and status <> 'cancelada';
    v_result := jsonb_set(v_result, '{event}', jsonb_build_object(
      'limit', v_limit, 'remaining', greatest(v_limit - v_reserved, 0)
    ));
  end if;

  for v_day_pass in select unnest(array['day1', 'day2', 'both']) loop
    select limit_count into v_limit from public.event_capacity_rules
    where event_id = v_event.id and scope = 'day' and key = v_day_pass;
    if v_limit is null then
      v_result := jsonb_set(v_result, array[v_day_pass], jsonb_build_object('limit', null, 'remaining', null));
    else
      select count(*) into v_reserved from public.tickets
      where event_id = v_event.id and status <> 'cancelada'
        and case v_day_pass
          when 'day1' then day_pass in ('day1', 'both')
          when 'day2' then day_pass in ('day2', 'both')
          else day_pass = 'both'
        end;
      v_result := jsonb_set(v_result, array[v_day_pass], jsonb_build_object(
        'limit', v_limit, 'remaining', greatest(v_limit - v_reserved, 0)
      ));
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.get_event_ticket_availability(text) from public, anon, authenticated;
grant execute on function public.get_event_ticket_availability(text) to service_role;
