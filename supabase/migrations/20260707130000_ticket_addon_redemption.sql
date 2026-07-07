-- Canje de beneficios opcionales en entradas (buffet, merch, etc.).

create or replace function public.redeem_ticket_addon(
  p_qr_token uuid,
  p_addon_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_addons jsonb;
  v_new_addons jsonb := '[]'::jsonb;
  v_item jsonb;
  v_found boolean := false;
  v_already boolean := false;
  v_checkin public.check_ins;
begin
  if not public.can_check_in() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  if p_addon_id is null or length(trim(p_addon_id)) = 0 then
    raise exception 'Falta el beneficio a canjear.' using errcode = 'PLU01';
  end if;

  select * into v_ticket from public.tickets where qr_token = p_qr_token for update;
  if not found then
    raise exception 'Entrada no encontrada.' using errcode = 'PLU02';
  end if;

  if v_ticket.status not in ('pagada', 'usada') then
    raise exception 'Esta entrada todavia no tiene el pago acreditado.' using errcode = 'PLU05';
  end if;

  v_addons := coalesce(v_ticket.addons, '[]'::jsonb);

  for v_item in select value from jsonb_array_elements(v_addons) as t(value)
  loop
    if v_item ->> 'id' = p_addon_id then
      v_found := true;
      if coalesce(v_item ->> 'redeemedAt', '') <> '' then
        v_already := true;
        v_new_addons := v_new_addons || jsonb_build_array(v_item);
      else
        v_new_addons := v_new_addons || jsonb_build_array(
          v_item || jsonb_build_object('redeemedAt', to_jsonb(timezone('utc', now())::text))
        );
      end if;
    else
      v_new_addons := v_new_addons || jsonb_build_array(v_item);
    end if;
  end loop;

  if not v_found then
    raise exception 'Beneficio no encontrado en esta entrada.' using errcode = 'PLU02';
  end if;

  if v_already then
    raise exception 'Este beneficio ya fue canjeado.' using errcode = 'PLU06';
  end if;

  update public.tickets
    set addons = v_new_addons, updated_at = now()
    where id = v_ticket.id
    returning * into v_ticket;

  select * into v_checkin from public.check_ins where ticket_id = v_ticket.id;

  return jsonb_build_object('ticket', to_jsonb(v_ticket), 'checkIn', to_jsonb(v_checkin));
end;
$$;

grant execute on function public.redeem_ticket_addon(uuid, text) to authenticated;
