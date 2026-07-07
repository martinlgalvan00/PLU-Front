-- Beneficios opcionales en compra de entradas (add-ons canjeables en el venue).

alter table public.tickets
  add column if not exists addons jsonb not null default '[]'::jsonb;

create or replace function public.event_ticket_addons_catalog(p_rules jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_rules is null then '[]'::jsonb
    when jsonb_typeof(p_rules -> 'ticketAddons') = 'array' then p_rules -> 'ticketAddons'
    else '[]'::jsonb
  end;
$$;

create or replace function public.ticket_addons_total_and_snapshot(
  p_addon_ids jsonb,
  p_catalog jsonb
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_id text;
  v_item jsonb;
  v_total int := 0;
  v_snapshot jsonb := '[]'::jsonb;
begin
  if p_addon_ids is null or jsonb_array_length(p_addon_ids) = 0 then
    return jsonb_build_object('total', 0, 'addons', '[]'::jsonb);
  end if;

  for v_id in select jsonb_array_elements_text(p_addon_ids)
  loop
    select addon into v_item
    from jsonb_array_elements(p_catalog) addon
    where addon ->> 'id' = v_id
      and coalesce((addon ->> 'enabled')::boolean, true)
      and coalesce(trim(addon ->> 'label'), '') <> ''
    limit 1;

    if v_item is null then
      raise exception 'Beneficio de entrada no disponible: %', v_id using errcode = 'PLU01';
    end if;

    v_total := v_total + coalesce((v_item ->> 'price')::int, 0);
    v_snapshot := v_snapshot || jsonb_build_array(
      jsonb_build_object(
        'id', v_item ->> 'id',
        'label', v_item ->> 'label',
        'price', coalesce((v_item ->> 'price')::int, 0),
        'redeemLabel', v_item ->> 'redeemLabel',
        'redeemedAt', null
      )
    );
  end loop;

  return jsonb_build_object('total', v_total, 'addons', v_snapshot);
end;
$$;

create or replace function public.create_ticket_order(
  p_event_slug text,
  p_attendees jsonb,
  p_buyer jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_order public.ticket_orders;
  v_amount int;
  v_attendee jsonb;
  v_day_pass text;
  v_ticket_code text;
  v_start_count int;
  v_index int := 0;
  v_ticket_json jsonb;
  v_tickets jsonb := '[]'::jsonb;
  v_dp text;
  v_provider text;
  v_order_status text;
  v_catalog jsonb;
  v_addon_ids jsonb;
  v_addon_result jsonb;
  v_addon_total int;
  v_addons_snap jsonb;
  v_unit_price int;
begin
  if p_attendees is null or jsonb_array_length(p_attendees) = 0 then
    raise exception 'La compra necesita al menos un asistente.' using errcode = 'PLU01';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  if v_event.ticket_sales_opens_at is not null and now() < v_event.ticket_sales_opens_at then
    raise exception 'La venta de entradas todavia no abrio.' using errcode = 'PLU03';
  end if;
  if v_event.ticket_sales_closes_at is not null and now() > v_event.ticket_sales_closes_at then
    raise exception 'La venta de entradas ya cerro.' using errcode = 'PLU03';
  end if;

  v_catalog := public.event_ticket_addons_catalog(v_event.rules);

  perform 1 from public.event_capacity_rules
    where event_id = v_event.id and scope = 'event' and key = ''
    for update;

  for v_dp in (select distinct a ->> 'dayPass' from jsonb_array_elements(p_attendees) a)
  loop
    perform 1 from public.event_capacity_rules
      where event_id = v_event.id and scope = 'day' and key = v_dp
      for update;
  end loop;

  if exists (
    select 1 from public.event_capacity_rules
    where event_id = v_event.id and scope = 'event' and key = ''
      and limit_count < (
        (select count(*) from public.tickets where event_id = v_event.id and status <> 'cancelada')
        + jsonb_array_length(p_attendees)
      )
  ) then
    raise exception 'Evento agotado.' using errcode = 'PLU04';
  end if;

  for v_dp in (select distinct a ->> 'dayPass' from jsonb_array_elements(p_attendees) a)
  loop
    if exists (
      select 1 from public.event_capacity_rules
      where event_id = v_event.id and scope = 'day' and key = v_dp
        and limit_count < (
          (select count(*) from public.tickets
            where event_id = v_event.id and day_pass = v_dp and status <> 'cancelada')
          + (select count(*) from jsonb_array_elements(p_attendees) a where a ->> 'dayPass' = v_dp)
        )
    ) then
      raise exception 'Entradas agotadas para %.', v_dp using errcode = 'PLU04';
    end if;
  end loop;

  select sum(
    public.ticket_price_for_day_pass(a ->> 'dayPass')
    + coalesce(
      (public.ticket_addons_total_and_snapshot(coalesce(a -> 'addonIds', '[]'::jsonb), v_catalog) ->> 'total')::int,
      0
    )
  )
    into v_amount
    from jsonb_array_elements(p_attendees) a;

  v_provider := coalesce(p_buyer ->> 'provider', 'mercado_pago');
  v_order_status := case when v_provider = 'manual' then 'pendiente' else 'creado' end;

  insert into public.ticket_orders (event_id, buyer_name, buyer_email, buyer_phone, amount, provider, status, reference)
  values (
    v_event.id,
    p_buyer ->> 'name',
    p_buyer ->> 'email',
    p_buyer ->> 'phone',
    v_amount,
    v_provider,
    v_order_status,
    'TORD-' || encode(extensions.gen_random_bytes(6), 'hex')
  )
  returning * into v_order;

  select count(*) into v_start_count from public.tickets;

  for v_attendee in select * from jsonb_array_elements(p_attendees)
  loop
    v_index := v_index + 1;
    v_day_pass := v_attendee ->> 'dayPass';
    v_ticket_code := 'TCK-' || lpad((v_start_count + v_index)::text, 5, '0');
    v_addon_ids := coalesce(v_attendee -> 'addonIds', '[]'::jsonb);
    v_addon_result := public.ticket_addons_total_and_snapshot(v_addon_ids, v_catalog);
    v_addon_total := coalesce((v_addon_result ->> 'total')::int, 0);
    v_addons_snap := coalesce(v_addon_result -> 'addons', '[]'::jsonb);
    v_unit_price := public.ticket_price_for_day_pass(v_day_pass) + v_addon_total;

    insert into public.tickets (
      ticket_code,
      order_id,
      event_id,
      attendee_name,
      attendee_dni,
      day_pass,
      unit_price,
      addons,
      status
    )
    values (
      v_ticket_code,
      v_order.id,
      v_event.id,
      v_attendee ->> 'fullName',
      v_attendee ->> 'dni',
      v_day_pass,
      v_unit_price,
      v_addons_snap,
      'pendiente_pago'
    )
    returning to_jsonb(public.tickets.*) into v_ticket_json;

    v_tickets := v_tickets || jsonb_build_array(v_ticket_json);
  end loop;

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets);
end;
$$;

grant execute on function public.event_ticket_addons_catalog(jsonb) to anon, authenticated;
grant execute on function public.ticket_addons_total_and_snapshot(jsonb, jsonb) to anon, authenticated;
grant execute on function public.create_ticket_order(text, jsonb, jsonb) to anon, authenticated;
