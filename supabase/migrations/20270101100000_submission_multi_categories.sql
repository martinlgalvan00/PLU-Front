-- Categorías adicionales de una inscripción Submission.
-- `category` conserva la primera elección por compatibilidad con grillas,
-- check-in y exportaciones existentes. Las restantes viven en esta lista.

alter table public.event_registrations
  add column if not exists additional_categories text[] not null default array[]::text[];

alter table public.event_registrations
  drop constraint if exists event_registrations_additional_categories_check;
alter table public.event_registrations
  add constraint event_registrations_additional_categories_check
  check (
    cardinality(additional_categories) <= 4
    and additional_categories <@ array['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited']::text[]
  );

comment on column public.event_registrations.additional_categories is
  'Categorías de equipamiento adicionales. Solo Submission permite más de una; category contiene siempre la primera.';

create or replace function plu_private.normalize_registration_categories()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.additional_categories := coalesce(
    (
      select array_agg(value order by ord)
      from (
        select value, min(ord) as ord
        from unnest(coalesce(new.additional_categories, array[]::text[])) with ordinality as choices(value, ord)
        where value is not null and btrim(value) <> '' and value <> new.category
        group by value
      ) deduplicated
    ),
    array[]::text[]
  );
  return new;
end;
$$;

drop trigger if exists normalize_registration_categories on public.event_registrations;
create trigger normalize_registration_categories
  before insert or update of category, additional_categories on public.event_registrations
  for each row execute function plu_private.normalize_registration_categories();

create or replace function plu_private.apply_registration_categories(
  p_registration_id uuid,
  p_additional_categories text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_registrations
  set additional_categories = coalesce(p_additional_categories, array[]::text[])
  where id = p_registration_id;

  if not found then
    raise exception 'No se pudieron guardar las categorías de competencia.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function plu_private.apply_registration_categories(uuid, text[])
  from public, anon, authenticated;

create or replace function public.create_competition_registration_checkout_v4(
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
  p_modalities text[],
  p_additional_categories text[]
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
  v_result := public.create_competition_registration_checkout_v3(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_discount_code, p_default_price,
    p_manual_price, p_manual_payment_channel, p_currency, p_declared_weight_class,
    p_secondary_division, p_modalities
  );
  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudieron guardar las categorías de competencia.' using errcode = 'P0001';
  end if;
  perform plu_private.apply_registration_categories(v_registration_id, p_additional_categories);
  return jsonb_set(v_result, '{registration,additional_categories}', to_jsonb(coalesce(p_additional_categories, array[]::text[])), true);
end;
$$;

revoke all on function public.create_competition_registration_checkout_v4(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text, text, text[], text[]
) from public, anon, authenticated;
grant execute on function public.create_competition_registration_checkout_v4(
  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text, text, text, text, text[], text[]
) to service_role;

create or replace function public.create_membership_registration_combo_checkout_v4(
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
  p_modalities text[],
  p_additional_categories text[]
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
  v_result := public.create_membership_registration_combo_checkout_v3(
    p_athlete_id, p_event_slug, p_division, p_category, p_bodyweight_kg,
    p_payment_method, p_idempotency_key, p_default_price, p_manual_price,
    p_manual_payment_channel, p_discount_code, p_currency, p_declared_weight_class,
    p_secondary_division, p_modalities
  );
  v_registration_id := (v_result -> 'registration' ->> 'id')::uuid;
  if v_registration_id is null then
    raise exception 'No se pudieron guardar las categorías de competencia.' using errcode = 'P0001';
  end if;
  perform plu_private.apply_registration_categories(v_registration_id, p_additional_categories);
  return jsonb_set(v_result, '{registration,additional_categories}', to_jsonb(coalesce(p_additional_categories, array[]::text[])), true);
end;
$$;

revoke all on function public.create_membership_registration_combo_checkout_v4(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text, text, text[], text[]
) from public, anon, authenticated;
grant execute on function public.create_membership_registration_combo_checkout_v4(
  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text, text, text, text, text[], text[]
) to service_role;

do $verification$
begin
  if to_regprocedure('public.create_competition_registration_checkout_v4(uuid,text,text,text,numeric,text,text,text,numeric,numeric,text,text,text,text,text[],text[])') is null then
    raise exception 'Falta public.create_competition_registration_checkout_v4.';
  end if;
  if to_regprocedure('public.create_membership_registration_combo_checkout_v4(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text,text,text,text,text[],text[])') is null then
    raise exception 'Falta public.create_membership_registration_combo_checkout_v4.';
  end if;
end
$verification$;
