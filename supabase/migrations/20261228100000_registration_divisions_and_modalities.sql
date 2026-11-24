-- Segunda división y modalidades en la inscripción.
--
-- Una inscripción sigue siendo una fila por atleta y evento (check-in, grilla,
-- cupo y padrón dependen de `unique (event_id, athlete_id)`), así que la segunda
-- división NO es una segunda fila: es un atributo de la misma inscripción.
--
-- * `division` es la división que paga el 100% (la de la franja de edad, u Open
--   si es la única elegida).
-- * `secondary_division` es la que paga el 50% (Open, para quien también
--   compite en su franja). La API calcula el importe y lo fija en la misma
--   transacción que crea la orden (`configure_atomic_checkout_pricing`); acá
--   solo se guarda la elección.
-- * `modalities` es Full Power y/o especialidades (Push-Pull, sentadilla, banco,
--   peso muerto) en cualquier combinación y sin recargo. La combinación válida
--   la decide la API (`shared/registrationSelection.js`); la base solo impide
--   valores fuera de catálogo, repetidos y listas vacías.
--
-- Las inscripciones anteriores quedan con `secondary_division` null y Full
-- Power, que es lo que competían hasta hoy: no se reescribe ninguna fila.

alter table public.event_registrations
  add column if not exists secondary_division text,
  add column if not exists modalities text[] not null default array['full_power']::text[];

alter table public.event_registrations
  drop constraint if exists event_registrations_secondary_division_check;
alter table public.event_registrations
  add constraint event_registrations_secondary_division_check
  check (
    secondary_division is null
    or secondary_division in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
  );

alter table public.event_registrations
  drop constraint if exists event_registrations_modalities_check;
alter table public.event_registrations
  add constraint event_registrations_modalities_check
  check (
    cardinality(modalities) between 1 and 5
    and modalities <@ array['full_power', 'push_pull', 'squat', 'bench', 'deadlift']::text[]
  );

comment on column public.event_registrations.secondary_division is
  'Segunda división (Open) que paga el 50%. Null = compite en una sola. La primera es `division`.';
comment on column public.event_registrations.modalities is
  'Modalidades: full_power, push_pull, squat, bench, deadlift, en cualquier combinación y sin recargo.';

-- Una corrección de staff (`staff_correct_registration_competition`) puede mover
-- `division` a la misma que `secondary_division`. Sin esto quedarían iguales y la
-- inscripción figuraría dos veces en la misma lista: se descarta la segunda.
create or replace function plu_private.drop_duplicate_secondary_division()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.secondary_division is not null and new.secondary_division = new.division then
    new.secondary_division := null;
  end if;
  return new;
end;
$$;

drop trigger if exists drop_duplicate_secondary_division on public.event_registrations;
create trigger drop_duplicate_secondary_division
  before insert or update of division, secondary_division on public.event_registrations
  for each row execute function plu_private.drop_duplicate_secondary_division();

-- ---------------------------------------------------------------------------
-- Alta atómica: la elección entra en la misma transacción que la orden. Mismo
-- patrón que `declared_weight_class` (20261224110000): se envuelve la RPC
-- vigente, sin tocar su firma, y si el update falla se revierte todo.
-- ---------------------------------------------------------------------------

create or replace function plu_private.apply_registration_selection(
  p_registration_id uuid,
  p_secondary_division text,
  p_modalities text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secondary text := nullif(btrim(p_secondary_division), '');
begin
  if p_modalities is null or cardinality(p_modalities) not between 1 and 5 then
    raise exception 'Elegí al menos una modalidad.' using errcode = '22023';
  end if;

  update public.event_registrations
  set secondary_division = v_secondary,
      modalities = p_modalities
  where id = p_registration_id
    and (v_secondary is null or v_secondary is distinct from division);

  if not found then
    raise exception 'No se pudo guardar la división y la modalidad.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function plu_private.apply_registration_selection(uuid, text, text[])
  from public, anon, authenticated;

create or replace function public.create_competition_registration_checkout_v3(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_discount_code text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_currency text,
  p_declared_weight_class text,
  p_secondary_division text,
  p_modalities text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_registration_id uuid;
begin
  v_result := public.create_competition_registration_checkout_v2(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key,
    p_discount_code,
    p_default_price,
    p_manual_price,
    p_manual_payment_channel,
    p_currency,
    p_declared_weight_class
  );

  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudo guardar la división y la modalidad.' using errcode = 'P0001';
  end if;

  perform plu_private.apply_registration_selection(
    v_registration_id, p_secondary_division, p_modalities
  );

  return jsonb_set(
    jsonb_set(
      v_result,
      '{registration,secondary_division}',
      coalesce(to_jsonb(nullif(btrim(p_secondary_division), '')), 'null'::jsonb),
      true
    ),
    '{registration,modalities}',
    to_jsonb(p_modalities),
    true
  );
end;
$$;

revoke all on function public.create_competition_registration_checkout_v3(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout_v3(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text, text, text[]
) to service_role;

create or replace function public.create_membership_registration_combo_checkout_v3(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_default_price numeric,
  p_manual_price numeric,
  p_manual_payment_channel text,
  p_discount_code text,
  p_currency text,
  p_declared_weight_class text,
  p_secondary_division text,
  p_modalities text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_result jsonb;
  v_registration_id uuid;
begin
  v_result := public.create_membership_registration_combo_checkout_v2(
    p_athlete_id,
    p_event_slug,
    p_division,
    p_category,
    p_bodyweight_kg,
    p_payment_method,
    p_idempotency_key,
    p_default_price,
    p_manual_price,
    p_manual_payment_channel,
    p_discount_code,
    p_currency,
    p_declared_weight_class
  );

  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudo guardar la división y la modalidad.' using errcode = 'P0001';
  end if;

  perform plu_private.apply_registration_selection(
    v_registration_id, p_secondary_division, p_modalities
  );

  return jsonb_set(
    jsonb_set(
      v_result,
      '{registration,secondary_division}',
      coalesce(to_jsonb(nullif(btrim(p_secondary_division), '')), 'null'::jsonb),
      true
    ),
    '{registration,modalities}',
    to_jsonb(p_modalities),
    true
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout_v3(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text, text, text[]
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout_v3(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text, text, text[]
) to service_role;

do $verification$
begin
  if to_regprocedure(
    'public.create_competition_registration_checkout_v3(uuid,text,text,text,numeric,text,text,text,numeric,numeric,text,text,text,text,text[])'
  ) is null then
    raise exception 'Falta public.create_competition_registration_checkout_v3.';
  end if;
  if to_regprocedure(
    'public.create_membership_registration_combo_checkout_v3(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text,text,text,text,text[])'
  ) is null then
    raise exception 'Falta public.create_membership_registration_combo_checkout_v3.';
  end if;
end
$verification$;
