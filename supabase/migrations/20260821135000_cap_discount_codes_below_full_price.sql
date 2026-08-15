-- Tope de cupones en 99% — PLU ARG
--
-- `apply_discount_code_to_order` (20260819100000_discount_codes_and_plan_expiry.sql)
-- rechaza cualquier cupón que deje la orden en $0 (`v_discount >= v_order.amount`):
-- Mercado Pago no puede cobrar $0 y todavía no existe un flujo de checkout
-- para orden gratuita. Antes de esta migración el admin podía crear (y
-- guardar) un cupón de 100%, que quedaba inservible recién al intentar
-- redimirlo. Se capa la creación en 99% para que ese error deje de ser
-- alcanzable desde el panel.

alter table public.discount_codes
  drop constraint if exists discount_codes_percent_off_check;
alter table public.discount_codes
  add constraint discount_codes_percent_off_check check (percent_off between 1 and 99);

create or replace function public.staff_upsert_discount_code(
  p_code jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_code ->> 'id', '')::uuid;
  v_organization_id uuid := coalesce(
    nullif(p_code ->> 'organizationId', '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  v_code_text text := upper(trim(p_code ->> 'code'));
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_percent is null or v_percent < 1 or v_percent > 99
     or v_applies not in ('membership', 'registration', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código de descuento son inválidos.' using errcode = 'PLU01';
  end if;

  if v_id is not null then
    select * into v_result from public.discount_codes
    where id = v_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El código de descuento no existe.' using errcode = 'PLU02';
    end if;
    v_before := to_jsonb(v_result);

    update public.discount_codes
    set code = v_code_text,
        description = nullif(trim(p_code ->> 'description'), ''),
        percent_off = v_percent,
        applies_to = v_applies,
        max_redemptions = v_max_redemptions,
        expires_at = v_expires,
        active = v_active,
        updated_at = now()
    where id = v_id
    returning * into v_result;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.updated', 'discount_code', v_result.id::text, 'staff', p_actor,
      jsonb_build_object('before', v_before, 'after', to_jsonb(v_result)), v_organization_id
    );
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, percent_off, applies_to,
        max_redemptions, expires_at, active
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_percent, v_applies, v_max_redemptions, v_expires, v_active
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código de descuento con ese nombre.' using errcode = 'PLU13';
    end;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.created', 'discount_code', v_result.id::text, 'staff', p_actor,
      to_jsonb(v_result), v_organization_id
    );
  end if;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

do $verification$
begin
  if (
    select conname from pg_constraint
    where conrelid = 'public.discount_codes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%percent_off%99%'
  ) is null then
    raise exception 'El tope de 99%% en cupones no quedó aplicado.' using errcode = 'PLU01';
  end if;
end
$verification$;
