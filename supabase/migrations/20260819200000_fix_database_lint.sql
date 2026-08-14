-- Corrige los dos hallazgos de `supabase db lint --fail-on warning`.
--
-- La firma original de create_financial_expense tenía siete parámetros y
-- llamaba a current_organization_id(), función que no existe. La corrección
-- previa agregó una firma de ocho parámetros con organización explícita, pero
-- PostgreSQL conserva ambas sobrecargas. Eliminamos sólo la firma obsoleta:
-- la vigente conserva el último parámetro con default, por lo que las llamadas
-- actuales de siete parámetros siguen funcionando y ahora son deterministas.
drop function if exists public.create_financial_expense(date, text, text, integer, uuid, text, text);

-- Esta RPC sólo necesita bloquear y comprobar que existe el atleta antes de
-- delegar en v2. Evitamos declarar una fila que nunca se consume, para que el
-- linter pueda detectar variables realmente inútiles en el futuro.
create or replace function public.create_competition_registration_v3(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_order public.athlete_payment_orders;
begin
  perform 1 from public.athletes where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  v_result := public.create_competition_registration_v2(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key
  );

  select * into v_order from public.athlete_payment_orders
  where id = (v_result -> 'order' ->> 'id')::uuid for update;

  perform public.apply_discount_code_to_order(
    v_order.organization_id, p_athlete_id, v_order.id, 'registration', p_discount_code
  );

  select * into v_order from public.athlete_payment_orders where id = v_order.id;
  return jsonb_set(v_result, '{order}', to_jsonb(v_order));
end;
$$;

revoke all on function public.create_competition_registration_v3(
  uuid, text, text, text, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_v3(
  uuid, text, text, text, numeric, text, text, text
) to service_role;

do $verification$
begin
  if to_regprocedure('public.create_financial_expense(date,text,text,integer,uuid,text,text)') is not null
    or to_regprocedure('public.create_financial_expense(date,text,text,integer,uuid,text,text,uuid)') is null
    or to_regprocedure('public.create_competition_registration_v3(uuid,text,text,text,numeric,text,text,text)') is null then
    raise exception 'Las RPC corregidas para el lint no están en el estado esperado.'
      using errcode = 'PLU01';
  end if;
end
$verification$;
