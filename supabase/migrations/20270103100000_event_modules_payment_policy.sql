-- Módulos del evento y tope de cuotas por concepto.
--
-- `events.rules.modules`: qué partes del evento están apagadas
-- (`{combo?, ticketAddons?, door?}`, solo `false`). Ausente = prendido, así los
-- eventos existentes no cambian. Inscripciones, entradas y cronograma público
-- ya tenían su campo (`salesIntent`, `pricing.ticketsEnabled`,
-- `publicSurface.schedule`) y no se duplican acá.
--
-- `events.rules.paymentPolicy`: tope de cuotas de Mercado Pago por concepto
-- (`{registration?: {maxInstallments}, ticket?: {maxInstallments}}`). Ausente =
-- decide Mercado Pago.
--
-- Mismo patrón que `staff_merge_event_offering`: RPC chica que corre después del
-- upsert (que reconstruye `rules`), sin tocar `staff_upsert_event`. La API hace
-- cumplir los módulos y el tope (`shared/eventModules.js`); la base solo impide
-- guardar claves o valores fuera de catálogo.

create or replace function public.staff_merge_event_modules(
  p_slug text,
  p_modules jsonb,
  p_payment_policy jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modules jsonb := coalesce(p_modules, '{}'::jsonb);
  v_policy jsonb := coalesce(p_payment_policy, '{}'::jsonb);
  v_key text;
  v_cap jsonb;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;
  if jsonb_typeof(v_modules) <> 'object' or jsonb_typeof(v_policy) <> 'object' then
    raise exception 'Los módulos del evento son inválidos.' using errcode = 'PLU01';
  end if;

  for v_key in select jsonb_object_keys(v_modules) loop
    if v_key not in ('combo', 'ticketAddons', 'door') then
      raise exception 'Los módulos del evento tienen una clave desconocida.' using errcode = 'PLU01';
    end if;
    -- Solo se guarda lo apagado: un `true` es "sin opinión" y no se persiste.
    if v_modules -> v_key <> 'false'::jsonb then
      raise exception 'Los módulos del evento son inválidos.' using errcode = 'PLU01';
    end if;
  end loop;

  for v_key in select jsonb_object_keys(v_policy) loop
    if v_key not in ('registration', 'ticket') then
      raise exception 'La política de cuotas tiene un concepto desconocido.' using errcode = 'PLU01';
    end if;
    -- Ifs anidados y no un solo `or`: Postgres no garantiza el orden de
    -- evaluación, y el cast a int de algo que no es número tiene que quedar
    -- detrás del chequeo de tipo.
    if jsonb_typeof(v_policy -> v_key) <> 'object' then
      raise exception 'El tope de cuotas es inválido.' using errcode = 'PLU01';
    end if;
    v_cap := v_policy -> v_key -> 'maxInstallments';
    if v_cap is null or jsonb_typeof(v_cap) <> 'number' then
      raise exception 'El tope de cuotas es inválido.' using errcode = 'PLU01';
    end if;
    if (v_cap)::text !~ '^[0-9]+$' then
      raise exception 'El tope de cuotas es inválido.' using errcode = 'PLU01';
    end if;
    if (v_cap)::text::int not between 1 and 24 then
      raise exception 'El tope de cuotas es inválido.' using errcode = 'PLU01';
    end if;
  end loop;

  update public.events
  set
    rules = (
      select
        case
          when v_policy = '{}'::jsonb then step.next_rules - 'paymentPolicy'
          else jsonb_set(step.next_rules, '{paymentPolicy}', v_policy, true)
        end
      from (
        select
          case
            when v_modules = '{}'::jsonb then coalesce(rules, '{}'::jsonb) - 'modules'
            else jsonb_set(coalesce(rules, '{}'::jsonb), '{modules}', v_modules, true)
          end as next_rules
      ) as step
    ),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_modules(text, jsonb, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_modules(text, jsonb, jsonb)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_modules(text,jsonb,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_modules.';
  end if;
end
$verification$;
