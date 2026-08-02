-- Afiliacion, pagos y credencial: aprobacion manual operable, auditoria del
-- ciclo de cobro y proyeccion de credencial sin fugas.
--
-- Cubre seis problemas que la auditoria del 2026-08-02 encontro entre la
-- orden de afiliacion y la puerta del evento:
--
--   B1. approve_athlete_payment_order validaba permisos con auth.uid() contra
--       public.profiles, pero desde 20260716000000 solo la puede ejecutar
--       service_role -- y con la key de servicio no hay claim `sub`, asi que
--       auth.uid() es NULL y la guarda nunca podia dar verdadero. Ninguna
--       afiliacion pagada por transferencia se podia activar desde el panel.
--       La autorizacion ya vive en Express (admin.payments.approve), asi que
--       la funcion deja de decidirla y pasa a ser idempotente y auditada.
--
--   A4. Ni la acreditacion de Mercado Pago ni la aprobacion manual ni el
--       vencimiento escribian en domain_audit_logs. Se auditaba crear la
--       orden pero no cobrarla: justo el evento que hay que poder
--       reconstruir ante un reclamo.
--
--   A8. Las ordenes de afiliacion tenian las columnas payment_proof_path /
--       payment_proof_uploaded_at desde 20260715000000 pero ninguna RPC que
--       las escribiera. Finanzas aprobaba transferencias sin evidencia.
--
--   M9. get_membership_by_code_or_token no devolvia el check-in, asi que una
--       credencial ya usada volvia a mostrarse como valida y el rechazo
--       (PLU06) recien aparecia al apretar "marcar ingreso".
--
--   M10. La misma RPC dejo de devolver document_id en 20260716000000 (por el
--        hardening de PII, correcto para el QR publico), pero el scanner de
--        staff lo necesita para cotejar el DNI fisico. Se separa en dos
--        proyecciones: la publica sin PII y una de staff con documento.
--
--   M11. La proyeccion publica devolvia qr_token. Como member_code es
--        correlativo y enumerable, cualquiera podia iterar codigos desde la
--        home y cosechar el token opaco de cualquier socio.

-- ---------------------------------------------------------------------------
-- Helper de auditoria de dominio
-- ---------------------------------------------------------------------------
-- Centraliza el insert para que las RPC no repitan la forma del registro ni
-- olviden el tenant. Es plu_private porque no es parte del contrato publico.
create or replace function plu_private.record_domain_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_actor_type text,
  p_actor_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_organization_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    p_action, p_entity_type, p_entity_id, p_actor_type, p_actor_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_organization_id, '00000000-0000-4000-8000-000000000001'::uuid)
  );
end;
$$;

revoke all on function plu_private.record_domain_audit(text, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B1 + A4 · Aprobacion manual operable, idempotente y auditada
-- ---------------------------------------------------------------------------
-- La activacion de la afiliacion (memberships, membership_cycles, fechas del
-- ciclo y estado del atleta) la resuelve el trigger
-- athlete_order_project_membership sobre el cambio de status de la orden
-- (20260716000000:637). Los updates explicitos que quedan abajo son el
-- respaldo para ordenes viejas que no tienen fila en
-- membership_order_targets; no duplican trabajo porque son idempotentes.
create or replace function public.approve_athlete_payment_order(
  p_order_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_previous_status text;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se aprueban por webhook.'
      using errcode = 'PLU10';
  end if;

  -- Idempotente: reintentar una aprobacion ya hecha devuelve el estado
  -- vigente en vez de volver a aplicar efectos y auditar de nuevo.
  if v_order.status = 'aprobado' then
    select * into v_membership from public.memberships
    where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations
    where payment_order_id = p_order_id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'duplicate', true
    );
  end if;

  if v_order.status in ('cancelado', 'reembolsado') then
    raise exception 'La orden ya no admite aprobacion.' using errcode = 'PLU10';
  end if;

  v_previous_status := v_order.status;

  update public.athlete_payment_orders
  set status = 'aprobado',
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order.concept in ('membership', 'combo') then
    update public.memberships
    set status = 'activa', updated_at = now()
    where payment_order_id = p_order_id
    returning * into v_membership;

    if v_membership.id is not null then
      update public.athletes
      set status = 'afiliado_activo', updated_at = now()
      where id = v_order.athlete_id;
    end if;
  end if;

  if v_order.concept in ('registration', 'combo') then
    update public.event_registrations
    set status = 'confirmada', updated_at = now()
    where payment_order_id = p_order_id
    returning * into v_registration;
  end if;

  perform plu_private.record_domain_audit(
    'payment.approved_manually',
    'athlete_payment_order',
    p_order_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'concept', v_order.concept,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'reference', v_order.reference,
      'previousStatus', v_previous_status,
      'hasPaymentProof', v_order.payment_proof_path is not null
    ),
    v_order.organization_id
  );

  if v_membership.id is not null then
    perform plu_private.record_domain_audit(
      'membership.activated', 'membership', v_membership.id::text, 'staff', p_actor,
      jsonb_build_object(
        'orderId', p_order_id,
        'memberCode', v_membership.member_code,
        'expirationDate', v_membership.expiration_date,
        'channel', 'manual'
      ),
      v_order.organization_id
    );
  end if;

  if v_registration.id is not null then
    perform plu_private.record_domain_audit(
      'registration.confirmed', 'event_registration', v_registration.id::text, 'staff', p_actor,
      jsonb_build_object('orderId', p_order_id, 'eventId', v_registration.event_id, 'channel', 'manual'),
      v_order.organization_id
    );
  end if;

  -- Se releen despues del trigger para devolver las fechas del ciclo.
  select * into v_membership from public.memberships where payment_order_id = p_order_id;
  select * into v_registration from public.event_registrations where payment_order_id = p_order_id;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'duplicate', false
  );
end;
$$;

revoke all on function public.approve_athlete_payment_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_athlete_payment_order(uuid, text)
  to service_role;

-- La firma vieja de un solo argumento queda fuera de servicio: dejarla viva
-- mantendria en pie la version con auth.uid() que nunca puede aprobar.
drop function if exists public.approve_athlete_payment_order(uuid);

-- ---------------------------------------------------------------------------
-- A4 · Auditoria de la acreditacion por Mercado Pago
-- ---------------------------------------------------------------------------
-- Misma logica de 20260715000500 (ledger agregado, derecho aplicado en la
-- misma transaccion, reversion por reembolso). Lo unico que cambia es que
-- ahora cada efecto deja registro en domain_audit_logs.
create or replace function public.apply_mercado_pago_payment(
  p_order_id uuid,
  p_external_payment_id text,
  p_status text,
  p_amount int,
  p_currency text,
  p_payer_email text default null,
  p_status_detail text default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_payment public.athlete_payments;
  v_existing_payment public.athlete_payments;
  v_entitlement_payment_id uuid;
  v_order_status text;
  v_previous_status text;
  v_membership public.memberships;
  v_registration public.event_registrations;
begin
  if p_status not in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado') then
    raise exception 'Estado de pago no soportado.' using errcode = 'PLU10';
  end if;

  select * into v_order
  from public.athlete_payment_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'mercado_pago' then
    raise exception 'La orden no pertenece a Mercado Pago.' using errcode = 'PLU10';
  end if;
  if p_amount <> v_order.amount or upper(p_currency) <> upper(v_order.currency) then
    raise exception 'Monto o moneda no coinciden con la orden.' using errcode = 'PLU11';
  end if;

  v_previous_status := v_order.status;

  select * into v_existing_payment
  from public.athlete_payments
  where external_payment_id = p_external_payment_id
  for update;
  if found and v_existing_payment.order_id <> p_order_id then
    raise exception 'El pago externo ya pertenece a otra orden.' using errcode = 'PLU13';
  end if;

  insert into public.athlete_payments (
    order_id, external_payment_id, status, amount, currency, payer_email,
    status_detail, raw_payload, confirmed_at, organization_id
  ) values (
    p_order_id, p_external_payment_id, p_status, p_amount, upper(p_currency),
    p_payer_email, p_status_detail, p_payload,
    case when p_status = 'aprobado' then now() else null end,
    v_order.organization_id
  )
  on conflict (external_payment_id) do update set
    status = excluded.status,
    payer_email = excluded.payer_email,
    status_detail = excluded.status_detail,
    raw_payload = excluded.raw_payload,
    confirmed_at = coalesce(public.athlete_payments.confirmed_at, excluded.confirmed_at),
    updated_at = now()
  returning * into v_payment;

  select case
    when bool_or(status = 'aprobado') then 'aprobado'
    when bool_or(status = 'pendiente') then 'pendiente'
    when bool_or(status = 'reembolsado') then 'reembolsado'
    when bool_or(status = 'rechazado') then 'rechazado'
    else 'cancelado'
  end into v_order_status
  from public.athlete_payments
  where order_id = p_order_id;

  update public.athlete_payment_orders
  set status = v_order_status,
      payer_email = coalesce(p_payer_email, payer_email),
      provider_payload = p_payload,
      approved_at = case when v_order_status = 'aprobado' then coalesce(approved_at, now()) else approved_at end,
      rejected_at = case when v_order_status = 'rechazado' then now() else rejected_at end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  if v_order_status = 'aprobado' then
    select id into v_entitlement_payment_id
    from public.athlete_payments
    where order_id = p_order_id and status = 'aprobado'
    order by confirmed_at desc nulls last, updated_at desc
    limit 1;

    if v_order.concept in ('membership', 'combo') then
      update public.memberships
      set status = 'activa', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null then
        insert into public.membership_cycles (
          membership_id, order_id, payment_id, starts_at, ends_at, status, organization_id
        ) values (
          v_membership.id, p_order_id, v_entitlement_payment_id,
          coalesce(v_membership.start_date, current_date),
          coalesce(v_membership.expiration_date, (current_date + interval '1 year')::date),
          'active', v_order.organization_id
        )
        on conflict (membership_id, order_id) do update set
          payment_id = excluded.payment_id,
          status = 'active',
          updated_at = now();

        update public.athletes
        set status = 'afiliado_activo', updated_at = now()
        where id = v_order.athlete_id;
      end if;
    end if;

    if v_order.concept in ('registration', 'combo') then
      update public.event_registrations
      set status = 'confirmada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
    end if;
  elsif v_order_status in ('reembolsado', 'cancelado') then
    if v_order.concept in ('membership', 'combo') then
      update public.membership_cycles
      set status = case when v_order_status = 'reembolsado' then 'refunded' else 'cancelled' end,
          updated_at = now()
      where order_id = p_order_id;

      update public.memberships
      set status = case when v_order_status = 'reembolsado' then 'reembolsada' else 'cancelada' end,
          updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

      if v_membership.id is not null and not exists (
        select 1 from public.memberships m
        where m.athlete_id = v_order.athlete_id
          and m.id <> v_membership.id
          and m.status = 'activa'
          and coalesce(m.expiration_date, current_date) >= current_date
      ) then
        update public.athletes
        set status = 'registrado', updated_at = now()
        where id = v_order.athlete_id and status = 'afiliado_activo';
      end if;
    end if;

    if v_order.concept in ('registration', 'combo') then
      update public.event_registrations
      set status = 'cancelada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
    end if;
  end if;

  -- Auditoria: un registro por intento aplicado y uno por derecho afectado.
  -- La clave del reclamo es siempre el external_payment_id, asi que viaja en
  -- la metadata de todos.
  perform plu_private.record_domain_audit(
    'payment.applied',
    'athlete_payment_order',
    p_order_id::text,
    'webhook',
    p_external_payment_id,
    jsonb_build_object(
      'paymentStatus', p_status,
      'orderStatus', v_order_status,
      'previousStatus', v_previous_status,
      'externalPaymentId', p_external_payment_id,
      'amount', p_amount,
      'currency', upper(p_currency),
      'concept', v_order.concept,
      'statusDetail', p_status_detail
    ),
    v_order.organization_id
  );

  if v_membership.id is not null then
    perform plu_private.record_domain_audit(
      case when v_order_status = 'aprobado' then 'membership.activated' else 'membership.revoked' end,
      'membership', v_membership.id::text, 'webhook', p_external_payment_id,
      jsonb_build_object(
        'orderId', p_order_id,
        'memberCode', v_membership.member_code,
        'expirationDate', v_membership.expiration_date,
        'status', v_membership.status,
        'channel', 'mercado_pago'
      ),
      v_order.organization_id
    );
  end if;

  if v_registration.id is not null then
    perform plu_private.record_domain_audit(
      case when v_order_status = 'aprobado' then 'registration.confirmed' else 'registration.cancelled' end,
      'event_registration', v_registration.id::text, 'webhook', p_external_payment_id,
      jsonb_build_object(
        'orderId', p_order_id,
        'eventId', v_registration.event_id,
        'status', v_registration.status,
        'channel', 'mercado_pago'
      ),
      v_order.organization_id
    );
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

revoke all on function public.apply_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_mercado_pago_payment(uuid, text, text, int, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- A4 · Auditoria del vencimiento automatico
-- ---------------------------------------------------------------------------
-- Corre por pg_cron, sin actor humano: sin este registro una afiliacion podia
-- pasar de activa a vencida sin dejar rastro de cuando ni por que.
create or replace function public.expire_memberships(p_now date default current_date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_expired uuid[];
begin
  update public.membership_cycles
  set status = 'expired', updated_at = now()
  where status = 'active' and ends_at <= p_now;

  with expired as (
    update public.memberships m
    set status = 'vencida', updated_at = now()
    where status = 'activa'
      and expiration_date <= p_now
      and not exists (
        select 1 from public.membership_cycles c
        where c.membership_id = m.id and c.status = 'active'
          and c.starts_at <= p_now and c.ends_at > p_now
      )
    returning m.id, m.member_code, m.expiration_date, m.organization_id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::int
  into v_expired, v_count
  from expired;

  if v_count > 0 then
    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    )
    select 'membership.expired', 'membership', m.id::text, 'cron', 'expire_memberships',
           jsonb_build_object('memberCode', m.member_code, 'expirationDate', m.expiration_date),
           m.organization_id
    from public.memberships m
    where m.id = any(v_expired);
  end if;

  update public.athletes a
  set status = 'afiliado_vencido', updated_at = now()
  where status = 'afiliado_activo'
    and not exists (
      select 1 from public.memberships m
      where m.athlete_id = a.id and m.status = 'activa'
        and m.expiration_date > p_now
    );

  return v_count;
end;
$$;

revoke all on function public.expire_memberships(date) from public, anon, authenticated;
grant execute on function public.expire_memberships(date) to service_role;

-- ---------------------------------------------------------------------------
-- A8 · Comprobante de transferencia para ordenes de afiliacion
-- ---------------------------------------------------------------------------
-- Espejo de ticket-payment-proofs: bucket privado, el backend firma la subida
-- contra <order_id>/ y la lectura queda para staff con permiso de finanzas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-payment-proofs',
  'athlete-payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.register_athlete_payment_proof(
  p_order_id uuid,
  p_athlete_id uuid,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  -- El comprobante lo sube el titular de la orden; el backend ya valido la
  -- sesion, esto cierra la puerta a un order_id de otro atleta.
  if v_order.athlete_id <> p_athlete_id then
    raise exception 'La orden no pertenece a este atleta.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'La orden no admite comprobante.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'aprobado' then
    raise exception 'La orden ya fue aprobada.' using errcode = 'PLU10';
  end if;
  if p_proof_path is null or p_proof_path not like (p_order_id::text || '/%') then
    raise exception 'Ruta de comprobante invalida.' using errcode = 'PLU01';
  end if;

  update public.athlete_payment_orders
  set payment_proof_path = p_proof_path,
      payment_proof_uploaded_at = now(),
      status = case when status = 'pendiente' then 'validacion_manual' else status end,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'payment.proof_uploaded', 'athlete_payment_order', p_order_id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object('concept', v_order.concept, 'reference', v_order.reference),
    v_order.organization_id
  );

  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

revoke all on function public.register_athlete_payment_proof(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_athlete_payment_proof(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- M9 + M11 · Proyeccion publica de credencial: con check-in, sin qr_token
-- ---------------------------------------------------------------------------
-- A donde apunta el QR impreso, sin sesion. Devuelve lo justo para un
-- veredicto en la puerta:
--   - sin document_id ni contacto (el member_code es enumerable),
--   - sin qr_token (devolverlo permitia cosechar el token opaco iterando
--     codigos correlativos),
--   - con el check-in de la inscripcion, para que una credencial ya usada se
--     vea usada en el primer render y no recien al apretar el boton.
create or replace function plu_private.get_membership_by_code_or_token(
  p_code text,
  p_event_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_membership public.memberships;
  v_athlete public.athletes;
  v_registration public.event_registrations;
  v_event public.events;
  v_checkin public.check_ins;
begin
  begin
    v_token := p_code::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  if v_token is not null then
    select * into v_membership from public.memberships where qr_token = v_token;
  else
    select * into v_membership from public.memberships where member_code = p_code;
  end if;

  if not found then
    raise exception 'Credencial no encontrada.' using errcode = 'PLU02';
  end if;

  select * into v_athlete from public.athletes where id = v_membership.athlete_id;

  if p_event_slug is not null then
    select * into v_event from public.events where slug = p_event_slug;
    if found then
      select * into v_registration
      from public.event_registrations
      where athlete_id = v_athlete.id and event_id = v_event.id and status <> 'cancelada';
      if v_registration.id is not null then
        select * into v_checkin from public.check_ins
        where registration_id = v_registration.id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'athlete', jsonb_build_object(
      'id', v_athlete.id,
      'full_name', v_athlete.full_name
    ),
    'membership', jsonb_build_object(
      'id', v_membership.id,
      'year', v_membership.year,
      'status', v_membership.status,
      'start_date', v_membership.start_date,
      'expiration_date', v_membership.expiration_date,
      'member_code', v_membership.member_code
    ),
    'registration', case when v_registration.id is null then null else jsonb_build_object(
      'id', v_registration.id,
      'athlete_id', v_registration.athlete_id,
      'division', v_registration.division,
      'category', v_registration.category,
      'status', v_registration.status,
      'check_in', case when v_checkin.id is null then null else jsonb_build_object(
        'id', v_checkin.id,
        'gate', v_checkin.gate,
        'scanned_at', v_checkin.scanned_at
      ) end
    ) end
  );
end;
$$;

revoke all on function plu_private.get_membership_by_code_or_token(text, text)
  from public, anon, authenticated, service_role;
grant execute on function plu_private.get_membership_by_code_or_token(text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- M10 · Proyeccion de staff: la misma credencial, con documento
-- ---------------------------------------------------------------------------
-- Solo service_role: la llama Express despues de validar sesion, permiso
-- admin.checkin.execute y alcance de evento. El DNI es lo que el operador
-- coteja contra el documento fisico en la puerta.
create or replace function public.staff_get_membership_by_code_or_token(
  p_code text,
  p_event_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_membership public.memberships;
  v_token uuid;
  v_document text;
begin
  v_result := plu_private.get_membership_by_code_or_token(p_code, p_event_slug);

  begin
    v_token := p_code::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  if v_token is not null then
    select * into v_membership from public.memberships where qr_token = v_token;
  else
    select * into v_membership from public.memberships where member_code = p_code;
  end if;

  select document_id into v_document from public.athletes where id = v_membership.athlete_id;

  return jsonb_set(
    v_result,
    '{athlete,document_id}',
    to_jsonb(v_document),
    true
  );
end;
$$;

revoke all on function public.staff_get_membership_by_code_or_token(text, text)
  from public, anon, authenticated;
grant execute on function public.staff_get_membership_by_code_or_token(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- M12 · Rotacion del token de credencial
-- ---------------------------------------------------------------------------
-- Si un qr_token se filtro, la unica salida hoy era editar la fila a mano.
create or replace function public.staff_rotate_membership_qr_token(
  p_membership_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership public.memberships;
begin
  update public.memberships
  set qr_token = gen_random_uuid(), updated_at = now()
  where id = p_membership_id
  returning * into v_membership;

  if not found then
    raise exception 'Afiliacion no encontrada.' using errcode = 'PLU02';
  end if;

  perform plu_private.record_domain_audit(
    'membership.qr_rotated', 'membership', p_membership_id::text, 'staff', p_actor,
    jsonb_build_object('memberCode', v_membership.member_code),
    v_membership.organization_id
  );

  return jsonb_build_object('membership', to_jsonb(v_membership));
end;
$$;

revoke all on function public.staff_rotate_membership_qr_token(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_rotate_membership_qr_token(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- A3 · Lectura de auditoria para el panel
-- ---------------------------------------------------------------------------
-- El panel leia un historial de localStorage mientras domain_audit_logs se
-- poblaba sin que nadie la consultara. Un indice por fecha hace viable el
-- listado paginado; el filtro por accion acompana los chips de la seccion.
create index if not exists domain_audit_logs_created_at_idx
  on public.domain_audit_logs (created_at desc);
create index if not exists domain_audit_logs_action_idx
  on public.domain_audit_logs (action, created_at desc);
create index if not exists domain_audit_logs_actor_idx
  on public.domain_audit_logs (actor_type, created_at desc);
