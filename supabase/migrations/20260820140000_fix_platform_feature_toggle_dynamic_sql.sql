-- Saca el `into` del EXECUTE de `staff_set_platform_feature_toggle`.
--
-- `supabase db lint --fail-on warning` (CI, job `supabase-integration`) falla
-- con:
--
--   cannot determinate a result of dynamic SQL
--   hint: Don't use dynamic SQL and record type together, when you would
--         check function.
--
-- plpgsql_check no puede resolver el tipo que devuelve un EXECUTE dinámico, así
-- que cuando el resultado va a un record deja de poder verificar todo lo que
-- viene después: por lo que sabe el linter, `v_row` podría tener cualquier
-- forma. No es un falso positivo cosmético — es una parte de la función que
-- queda sin chequear.
--
-- La columna sigue viniendo de `platform_feature_toggle_column` (lista blanca),
-- así que el UPDATE dinámico se queda; lo que se va es el `returning * into`.
-- Releer la fila con un SELECT estático es equivalente: el `for update` de más
-- arriba ya tomó el lock en esta misma transacción, así que entre el UPDATE y
-- el SELECT nadie más puede tocarla.
--
-- Definida en `20260820130000_manual_channel_validation_toggles.sql`; el resto
-- del cuerpo queda igual.

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
     where organization_id = $3',
    v_column
  ) using p_enabled, p_actor, v_org;

  -- Estático a propósito: con `returning * into v_row` el linter pierde el tipo
  -- de `v_row` y deja de chequear de acá para abajo.
  select * into v_row from public.platform_feature_toggles
  where organization_id = v_org;

  perform plu_private.record_domain_audit(
    'platform_feature_toggle.updated', 'platform_feature_toggle', v_feature,
    'staff', p_actor,
    jsonb_build_object('feature', v_feature, 'enabled', p_enabled, 'previousEnabled', v_previous),
    v_org
  );

  return plu_private.platform_feature_toggles_payload(v_row);
end;
$$;

-- `create or replace` conserva los privilegios, pero los repetimos para que la
-- migración no dependa de eso.
revoke all on function public.staff_set_platform_feature_toggle(text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_platform_feature_toggle(text, boolean, text)
  to service_role;
