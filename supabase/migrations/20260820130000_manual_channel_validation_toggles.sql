-- Interruptores de canal manual y de validación, por concepto.
--
-- `20260819180000_platform_feature_toggles.sql` dejó tres cortes de ALTA:
-- cobros (maestro), afiliación e inscripción. Faltaban tres cosas:
--
--   1. Entradas no tenía interruptor global. Se cortaban evento por evento
--      desde el editor (`events.rules.ticketsEnabled`), sin forma de pausar la
--      venta de toda la plataforma.
--   2. No se podía cerrar sólo el canal manual. Pausar transferencia/efectivo
--      —para que sólo entre Mercado Pago— obligaba a cerrar el concepto
--      completo.
--   3. No se podía congelar la validación. Cuando Finanzas necesita frenar
--      acreditaciones (cierre de caja, sospecha de comprobantes falsos,
--      auditoría) la única salida era quitarle el permiso a las cuentas.
--
-- Los tres ejes son independientes: cerrar el alta no impide validar lo que ya
-- entró, y congelar la validación no impide que sigan llegando órdenes.

alter table public.platform_feature_toggles
  add column if not exists ticket_enabled boolean not null default true,
  add column if not exists membership_manual_enabled boolean not null default true,
  add column if not exists registration_manual_enabled boolean not null default true,
  add column if not exists ticket_manual_enabled boolean not null default true,
  add column if not exists membership_validation_enabled boolean not null default true,
  add column if not exists registration_validation_enabled boolean not null default true,
  add column if not exists ticket_validation_enabled boolean not null default true;

-- Un solo armador del payload: antes las diez claves se repetían en el getter y
-- en el setter, y cualquier interruptor nuevo se olvidaba en uno de los dos.
create or replace function plu_private.platform_feature_toggles_payload(
  p_row public.platform_feature_toggles
)
returns jsonb
language sql
immutable
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'checkoutEnabled', p_row.checkout_enabled,
    'membershipEnabled', p_row.membership_enabled,
    'registrationEnabled', p_row.registration_enabled,
    'ticketEnabled', p_row.ticket_enabled,
    'membershipManualEnabled', p_row.membership_manual_enabled,
    'registrationManualEnabled', p_row.registration_manual_enabled,
    'ticketManualEnabled', p_row.ticket_manual_enabled,
    'membershipValidationEnabled', p_row.membership_validation_enabled,
    'registrationValidationEnabled', p_row.registration_validation_enabled,
    'ticketValidationEnabled', p_row.ticket_validation_enabled,
    'updatedBy', p_row.updated_by,
    'updatedAt', p_row.updated_at
  );
$$;

revoke all on function plu_private.platform_feature_toggles_payload(public.platform_feature_toggles)
  from public, anon, authenticated;

-- Nombre de feature -> columna. Es la lista blanca que habilita el UPDATE
-- dinámico de abajo: sin coincidencia no hay columna que escribir.
create or replace function plu_private.platform_feature_toggle_column(p_feature text)
returns text
language sql
immutable
set search_path = public, plu_private
as $$
  select case lower(btrim(coalesce(p_feature, '')))
    when 'checkout' then 'checkout_enabled'
    when 'membership' then 'membership_enabled'
    when 'registration' then 'registration_enabled'
    when 'ticket' then 'ticket_enabled'
    when 'membership_manual' then 'membership_manual_enabled'
    when 'registration_manual' then 'registration_manual_enabled'
    when 'ticket_manual' then 'ticket_manual_enabled'
    when 'membership_validation' then 'membership_validation_enabled'
    when 'registration_validation' then 'registration_validation_enabled'
    when 'ticket_validation' then 'ticket_validation_enabled'
    else null
  end;
$$;

revoke all on function plu_private.platform_feature_toggle_column(text)
  from public, anon, authenticated;

create or replace function public.staff_get_platform_feature_toggles()
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_row public.platform_feature_toggles;
begin
  select * into v_row from public.platform_feature_toggles
  where organization_id = '00000000-0000-4000-8000-000000000001'::uuid;

  -- Sin fila todo queda abierto: es el estado por defecto de la plataforma, no
  -- un corte. Devolver `false` acá cerraría los cobros por una fila faltante.
  if not found then
    v_row.checkout_enabled := true;
    v_row.membership_enabled := true;
    v_row.registration_enabled := true;
    v_row.ticket_enabled := true;
    v_row.membership_manual_enabled := true;
    v_row.registration_manual_enabled := true;
    v_row.ticket_manual_enabled := true;
    v_row.membership_validation_enabled := true;
    v_row.registration_validation_enabled := true;
    v_row.ticket_validation_enabled := true;
  end if;

  return plu_private.platform_feature_toggles_payload(v_row);
end;
$$;

create or replace function public.staff_set_platform_feature_toggle(
  p_feature text,
  p_enabled boolean,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_feature text := lower(btrim(coalesce(p_feature, '')));
  v_column text := plu_private.platform_feature_toggle_column(v_feature);
  v_row public.platform_feature_toggles;
  v_previous boolean;
begin
  if v_column is null then
    raise exception 'La funcionalidad indicada no es válida.' using errcode = 'PLU02';
  end if;
  if p_enabled is null then
    raise exception 'El estado del interruptor es inválido.' using errcode = 'PLU02';
  end if;

  insert into public.platform_feature_toggles (organization_id)
  values (v_org)
  on conflict (organization_id) do nothing;

  select * into v_row from public.platform_feature_toggles
  where organization_id = v_org for update;

  -- Vía jsonb en vez de otro EXECUTE: la columna ya viene de la lista blanca y
  -- así el valor anterior que va a la auditoría no depende de SQL dinámico.
  v_previous := (to_jsonb(v_row) ->> v_column)::boolean;

  execute format(
    'update public.platform_feature_toggles
     set %I = $1, updated_by = $2, updated_at = now()
     where organization_id = $3
     returning *',
    v_column
  ) into v_row using p_enabled, p_actor, v_org;

  perform plu_private.record_domain_audit(
    'platform_feature_toggle.updated', 'platform_feature_toggle', v_feature,
    'staff', p_actor,
    jsonb_build_object('feature', v_feature, 'enabled', p_enabled, 'previousEnabled', v_previous),
    v_org
  );

  return plu_private.platform_feature_toggles_payload(v_row);
end;
$$;

revoke all on function public.staff_get_platform_feature_toggles() from public, anon, authenticated;
revoke all on function public.staff_set_platform_feature_toggle(text, boolean, text) from public, anon, authenticated;
grant execute on function public.staff_get_platform_feature_toggles() to service_role;
grant execute on function public.staff_set_platform_feature_toggle(text, boolean, text) to service_role;

do $verification$
declare
  v_toggles jsonb := public.staff_get_platform_feature_toggles();
  v_key text;
begin
  foreach v_key in array array[
    'checkoutEnabled', 'membershipEnabled', 'registrationEnabled', 'ticketEnabled',
    'membershipManualEnabled', 'registrationManualEnabled', 'ticketManualEnabled',
    'membershipValidationEnabled', 'registrationValidationEnabled', 'ticketValidationEnabled'
  ] loop
    if v_toggles -> v_key is null then
      raise exception 'El interruptor % no quedó expuesto.', v_key using errcode = 'PLU01';
    end if;
  end loop;
end
$verification$;
