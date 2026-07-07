-- Comprobantes de transferencia para órdenes de entradas (provider = manual).
-- El upload va a Storage; la ruta se registra en ticket_orders vía RPC.

alter table public.ticket_orders
  add column if not exists payment_proof_path text,
  add column if not exists payment_proof_uploaded_at timestamptz;

-- Operadores y admins pueden validar pagos manuales de entradas.
create or replace function public.can_approve_ticket_payment()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin_maximal', 'admin_plu_arg', 'operador_plu_arg')
  );
$$;

-- Bucket privado: solo admins leen; compradores anónimos suben a su order_id/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-payment-proofs',
  'ticket-payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "ticket_proofs_insert_buyer"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'ticket-payment-proofs'
    and exists (
      select 1 from public.ticket_orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.provider = 'manual'
        and o.status in ('creado', 'pendiente')
    )
  );

create policy "ticket_proofs_select_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ticket-payment-proofs'
    and public.can_approve_ticket_payment()
  );

-- create_ticket_order: transferencias arrancan en pendiente (no creado).
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

  select sum(public.ticket_price_for_day_pass(a ->> 'dayPass'))
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

    insert into public.tickets (ticket_code, order_id, event_id, attendee_name, attendee_dni, day_pass, unit_price, status)
    values (
      v_ticket_code,
      v_order.id,
      v_event.id,
      v_attendee ->> 'fullName',
      v_attendee ->> 'dni',
      v_day_pass,
      public.ticket_price_for_day_pass(v_day_pass),
      'pendiente_pago'
    )
    returning to_jsonb(public.tickets.*) into v_ticket_json;

    v_tickets := v_tickets || jsonb_build_array(v_ticket_json);
  end loop;

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets);
end;
$$;

-- Registra la ruta del comprobante subido a Storage (compra pública).
create or replace function public.register_ticket_payment_proof(
  p_order_id uuid,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_folder text;
begin
  if p_proof_path is null or length(trim(p_proof_path)) = 0 then
    raise exception 'Falta la ruta del comprobante.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.ticket_orders where id = p_order_id;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.provider <> 'manual' then
    raise exception 'Esta orden no admite comprobante de transferencia.' using errcode = 'PLU01';
  end if;

  if v_order.status not in ('creado', 'pendiente') then
    raise exception 'Esta orden ya no acepta comprobantes.' using errcode = 'PLU01';
  end if;

  v_folder := split_part(p_proof_path, '/', 1);
  if v_folder <> p_order_id::text then
    raise exception 'Ruta de comprobante invalida.' using errcode = 'PLU01';
  end if;

  update public.ticket_orders
    set
      payment_proof_path = p_proof_path,
      payment_proof_uploaded_at = now(),
      status = 'pendiente',
      updated_at = now()
    where id = p_order_id
    returning * into v_order;

  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

grant execute on function public.register_ticket_payment_proof(uuid, text) to anon, authenticated;

-- Panel admin: órdenes manuales pendientes de validación.
create or replace function public.list_pending_ticket_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.can_approve_ticket_payment() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data -> 'order' ->> 'created_at' desc), '[]'::jsonb)
    into v_result
    from (
      select jsonb_build_object(
        'order', to_jsonb(o.*),
        'event', jsonb_build_object('slug', e.slug, 'title', e.title),
        'ticketCount', (
          select count(*)::int from public.tickets t where t.order_id = o.id
        ),
        'attendees', (
          select coalesce(jsonb_agg(
            jsonb_build_object('name', t.attendee_name, 'dni', t.attendee_dni)
            order by t.created_at
          ), '[]'::jsonb)
          from public.tickets t
          where t.order_id = o.id
        )
      ) as row_data
      from public.ticket_orders o
      join public.events e on e.id = o.event_id
      where o.provider = 'manual'
        and o.status in ('creado', 'pendiente')
    ) sub;

  return v_result;
end;
$$;

grant execute on function public.list_pending_ticket_orders() to authenticated;

-- Aprobar orden manual: solo operadores/admins (MP/mock siguen públicos para demo).
create or replace function public.approve_ticket_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_tickets jsonb;
begin
  select * into v_order from public.ticket_orders where id = p_order_id;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.provider = 'manual' and not public.can_approve_ticket_payment() then
    raise exception 'No tenes permisos para aprobar esta orden.' using errcode = '42501';
  end if;

  update public.ticket_orders
    set status = 'aprobado', updated_at = now()
    where id = p_order_id
    returning * into v_order;

  update public.tickets
    set status = 'pagada', updated_at = now()
    where order_id = p_order_id and status = 'pendiente_pago';

  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb)
    into v_tickets
    from public.tickets t
    where t.order_id = p_order_id;

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets);
end;
$$;
