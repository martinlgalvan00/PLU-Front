-- Observaciones del atleta al pagar por transferencia -- PLU ARG
--
-- El modal de transferencia (TransferPayModal) sólo mostraba los datos
-- bancarios y la carga del comprobante: no había forma de que el atleta le
-- dejara contexto a Finanzas al momento de pagar (ej. "transferí desde la
-- cuenta de mi papá", "el monto no coincide por redondeo bancario"). Se
-- guarda junto con el registro del comprobante, mismo momento en que la
-- orden pasa a validación manual.

alter table public.athlete_payment_orders
  add column if not exists notes text;

create or replace function public.register_athlete_payment_proof(
  p_order_id uuid,
  p_athlete_id uuid,
  p_proof_path text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.athlete_id <> p_athlete_id then
    raise exception 'La orden no pertenece a este atleta.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'La orden no admite comprobante.' using errcode = 'PLU10';
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite comprobantes.' using errcode = 'PLU10';
  end if;
  if v_order.expires_at is not null and v_order.expires_at < now() then
    raise exception 'La ventana para adjuntar el comprobante vencio.' using errcode = 'PLU10';
  end if;
  if p_proof_path is null or p_proof_path not like (p_order_id::text || '/%') then
    raise exception 'Ruta de comprobante invalida.' using errcode = 'PLU01';
  end if;

  update public.athlete_payment_orders
  set payment_proof_path = p_proof_path,
      payment_proof_uploaded_at = now(),
      status = 'validacion_manual',
      expires_at = now() + interval '48 hours',
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'payment.proof_uploaded', 'athlete_payment_order', p_order_id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object(
      'concept', v_order.concept,
      'reference', v_order.reference,
      'manual_validation_deadline', v_order.expires_at
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

revoke all on function public.register_athlete_payment_proof(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_athlete_payment_proof(uuid, uuid, text, text)
  to service_role;

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_payment_orders' and column_name = 'notes'
  ) or to_regprocedure('public.register_athlete_payment_proof(uuid,uuid,text,text)') is null then
    raise exception 'La verificación de observaciones de pago no fue superada.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
