-- Copy del cupo público: título y párrafo que ve el atleta en inscripción.
--
-- Hasta acá el contador decía "Campo limitado / la inscripción está abierta"
-- aunque el meet estuviera cerrado. El admin necesita overridear ese texto
-- (vacío = default de i18n según el estado).
--
-- Misma razón que 20261106100000: `staff_upsert_event` reconstruye `rules`
-- clave por clave, así que el copy vive en este merge. Se reemite la función
-- completa incluyendo publicTitle / heroLead / ctaLabel para no perderlos.

create or replace function public.staff_merge_event_public_copy(
  p_slug text,
  p_copy jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_lead text;
  v_cta text;
  v_mark text;
  v_note text;
  v_copy jsonb;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  v_title := nullif(trim(coalesce(p_copy ->> 'publicTitle', '')), '');
  v_lead := nullif(trim(coalesce(p_copy ->> 'heroLead', '')), '');
  v_cta := nullif(trim(coalesce(p_copy ->> 'ctaLabel', '')), '');
  v_mark := nullif(trim(coalesce(p_copy ->> 'inscriptionMark', '')), '');
  v_note := nullif(trim(coalesce(p_copy ->> 'inscriptionNote', '')), '');

  if length(coalesce(v_title, '')) > 120
     or length(coalesce(v_lead, '')) > 240
     or length(coalesce(v_cta, '')) > 40
     or length(coalesce(v_mark, '')) > 40
     or length(coalesce(v_note, '')) > 160 then
    raise exception 'Copy público demasiado largo.' using errcode = 'PLU01';
  end if;

  v_copy := jsonb_strip_nulls(
    jsonb_build_object(
      'publicTitle', v_title,
      'heroLead', v_lead,
      'ctaLabel', v_cta,
      'inscriptionMark', v_mark,
      'inscriptionNote', v_note
    )
  );

  update public.events
  set
    rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{publicCopy}', v_copy, true),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_public_copy(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_public_copy(text, jsonb)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_public_copy(text,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_public_copy.';
  end if;
end
$verification$;
