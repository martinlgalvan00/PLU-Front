-- Qué ofrece cada evento: categorías de competencia, divisiones y modalidades.
--
-- Un meet puede abrir solo Raw, solo Full Power, sin Youth… Se guarda en
-- `events.rules.offering` como `{categories?, divisions?, modalities?}`. Ausente
-- (o una clave ausente) = ofrece todo, así los eventos existentes no cambian y
-- lo que se agregue al catálogo se ofrece por defecto. Mismo patrón que
-- `publicSurface` / `externalForm`: RPC chica que corre después del upsert (que
-- reconstruye `rules`), sin tocar `staff_upsert_event`.
--
-- La API valida la inscripción contra esta lista (`shared/eventOffering.js`);
-- la base solo impide guardar valores fuera de catálogo y listas vacías, y
-- repite que Open no se puede apagar (todos pueden anotarse en Open).

create or replace function public.staff_merge_event_offering(
  p_slug text,
  p_offering jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offering jsonb := coalesce(p_offering, '{}'::jsonb);
  v_key text;
  v_catalog text[];
  v_values text[];
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;
  if jsonb_typeof(v_offering) <> 'object' then
    raise exception 'La oferta del evento es inválida.' using errcode = 'PLU01';
  end if;

  for v_key in select jsonb_object_keys(v_offering) loop
    v_catalog := case v_key
      when 'categories' then array['Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited']
      when 'divisions' then array['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters']
      when 'modalities' then array['full_power', 'push_pull', 'squat', 'bench', 'deadlift']
      else null
    end;
    if v_catalog is null then
      raise exception 'La oferta del evento tiene una clave desconocida.' using errcode = 'PLU01';
    end if;
    if jsonb_typeof(v_offering -> v_key) <> 'array' then
      raise exception 'La oferta del evento es inválida.' using errcode = 'PLU01';
    end if;
    select coalesce(array_agg(value), '{}') into v_values
    from jsonb_array_elements_text(v_offering -> v_key);
    if cardinality(v_values) = 0 or not (v_values <@ v_catalog) then
      raise exception 'La oferta del evento tiene valores inválidos.' using errcode = 'PLU01';
    end if;
    if v_key = 'divisions' and not ('Open' = any (v_values)) then
      raise exception 'Open no se puede quitar: todos pueden anotarse en Open.' using errcode = 'PLU01';
    end if;
  end loop;

  update public.events
  set
    rules = case
      when v_offering = '{}'::jsonb then coalesce(rules, '{}'::jsonb) - 'offering'
      else jsonb_set(coalesce(rules, '{}'::jsonb), '{offering}', v_offering, true)
    end,
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_offering(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_offering(text, jsonb)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_offering(text,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_offering.';
  end if;
end
$verification$;
