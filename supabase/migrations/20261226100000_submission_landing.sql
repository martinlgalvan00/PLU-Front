-- Landing Submission: visibilidad pÃºblica y estado de preparaciÃ³n.
--
-- Se conserva `staff_merge_event_landing` para slots/tema. Esta RPC chica se
-- ejecuta despuÃ©s y agrega las decisiones propias de la plantilla sin copiar
-- la funciÃ³n histÃ³rica de merge de contenidos.

create or replace function public.staff_merge_event_landing_state(
  p_slug text,
  p_template_id text,
  p_public_visible boolean,
  p_phase text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template text;
  v_phase text;
  v_landing jsonb;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento invÃ¡lido.' using errcode = 'PLU01';
  end if;

  v_template := lower(trim(coalesce(p_template_id, 'meet')));
  if v_template not in ('meet', 'editorial', 'submission') then
    raise exception 'Plantilla de landing invÃ¡lida.' using errcode = 'PLU01';
  end if;

  v_phase := lower(trim(coalesce(p_phase, 'coming_soon')));
  if v_phase not in ('coming_soon', 'published') then
    raise exception 'Estado de landing invÃ¡lido.' using errcode = 'PLU01';
  end if;

  select coalesce(rules -> 'landing', '{}'::jsonb)
  into v_landing
  from public.events
  where slug = trim(p_slug)
  for update;

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;

  update public.events
  set
    rules = jsonb_set(
      coalesce(rules, '{}'::jsonb),
      '{landing}',
      v_landing || jsonb_build_object(
        'templateId', v_template,
        'publicVisible', coalesce(p_public_visible, true),
        'phase', v_phase
      ),
      true
    ),
    updated_at = now()
  where slug = trim(p_slug);
end;
$$;

revoke all on function public.staff_merge_event_landing_state(text, text, boolean, text)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_landing_state(text, text, boolean, text)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_landing_state(text,text,boolean,text)') is null then
    raise exception 'Falta public.staff_merge_event_landing_state.';
  end if;
end
$verification$;
