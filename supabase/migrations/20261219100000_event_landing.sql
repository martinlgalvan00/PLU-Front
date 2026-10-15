-- Landing de evento por plantilla + slots — PLU ARG
--
-- `staff_upsert_event` reconstruye `rules` clave por clave, así que `landing`
-- vive en un merge aparte (mismo patrón que publicCopy / publicSurface).
--
-- Shape:
--   rules.landing = {
--     templateId: 'meet' | 'editorial',
--     slots: { heroTitle, heroLead, ctaLabel, inscriptionMark, inscriptionNote,
--              experienceTitle, experienceBody, categoriesTitle, categoriesBody,
--              locationTitle, locationBody, heroImagePath }
--   }
--
-- Backfill: Pitbull Classic pasa a template editorial para dejar de gatear por slug.

create or replace function public.staff_merge_event_landing(
  p_slug text,
  p_landing jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template text;
  v_slots jsonb;
  v_landing jsonb;
  v_hero_title text;
  v_hero_lead text;
  v_cta text;
  v_mark text;
  v_note text;
  v_exp_title text;
  v_exp_body text;
  v_cat_title text;
  v_cat_body text;
  v_loc_title text;
  v_loc_body text;
  v_hero_path text;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  v_template := lower(trim(coalesce(p_landing ->> 'templateId', 'meet')));
  if v_template not in ('meet', 'editorial') then
    raise exception 'Plantilla de landing inválida.' using errcode = 'PLU01';
  end if;

  v_slots := coalesce(p_landing -> 'slots', '{}'::jsonb);

  v_hero_title := nullif(trim(coalesce(v_slots ->> 'heroTitle', '')), '');
  v_hero_lead := nullif(trim(coalesce(v_slots ->> 'heroLead', '')), '');
  v_cta := nullif(trim(coalesce(v_slots ->> 'ctaLabel', '')), '');
  v_mark := nullif(trim(coalesce(v_slots ->> 'inscriptionMark', '')), '');
  v_note := nullif(trim(coalesce(v_slots ->> 'inscriptionNote', '')), '');
  v_exp_title := nullif(trim(coalesce(v_slots ->> 'experienceTitle', '')), '');
  v_exp_body := nullif(trim(coalesce(v_slots ->> 'experienceBody', '')), '');
  v_cat_title := nullif(trim(coalesce(v_slots ->> 'categoriesTitle', '')), '');
  v_cat_body := nullif(trim(coalesce(v_slots ->> 'categoriesBody', '')), '');
  v_loc_title := nullif(trim(coalesce(v_slots ->> 'locationTitle', '')), '');
  v_loc_body := nullif(trim(coalesce(v_slots ->> 'locationBody', '')), '');
  v_hero_path := nullif(trim(coalesce(v_slots ->> 'heroImagePath', '')), '');

  if length(coalesce(v_hero_title, '')) > 120
     or length(coalesce(v_hero_lead, '')) > 240
     or length(coalesce(v_cta, '')) > 40
     or length(coalesce(v_mark, '')) > 40
     or length(coalesce(v_note, '')) > 160
     or length(coalesce(v_exp_title, '')) > 120
     or length(coalesce(v_exp_body, '')) > 800
     or length(coalesce(v_cat_title, '')) > 120
     or length(coalesce(v_cat_body, '')) > 800
     or length(coalesce(v_loc_title, '')) > 120
     or length(coalesce(v_loc_body, '')) > 800
     or length(coalesce(v_hero_path, '')) > 200 then
    raise exception 'Slot de landing demasiado largo.' using errcode = 'PLU01';
  end if;

  if v_hero_path is not null
     and (
       v_hero_path like '%..%'
       or v_hero_path !~ '^[A-Za-z0-9._()+/-]+$'
     ) then
    raise exception 'Ruta de imagen hero inválida.' using errcode = 'PLU01';
  end if;

  v_landing := jsonb_build_object(
    'templateId', v_template,
    'slots', jsonb_strip_nulls(
      jsonb_build_object(
        'heroTitle', v_hero_title,
        'heroLead', v_hero_lead,
        'ctaLabel', v_cta,
        'inscriptionMark', v_mark,
        'inscriptionNote', v_note,
        'experienceTitle', v_exp_title,
        'experienceBody', v_exp_body,
        'categoriesTitle', v_cat_title,
        'categoriesBody', v_cat_body,
        'locationTitle', v_loc_title,
        'locationBody', v_loc_body,
        'heroImagePath', v_hero_path
      )
    )
  );

  update public.events
  set
    rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{landing}', v_landing, true),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_landing(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_landing(text, jsonb)
to service_role;

-- Bucket para media de landing (hero). Misma política que event-logos:
-- lectura pública, escritura vía URL firmada de la API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Pitbull Classic: plantilla editorial + slots hero desde publicCopy si existe.
update public.events
set rules = jsonb_set(
  coalesce(rules, '{}'::jsonb),
  '{landing}',
  jsonb_build_object(
    'templateId', 'editorial',
    'slots', jsonb_strip_nulls(
      jsonb_build_object(
        'heroTitle', nullif(trim(coalesce(rules -> 'publicCopy' ->> 'publicTitle', '')), ''),
        'heroLead', nullif(trim(coalesce(rules -> 'publicCopy' ->> 'heroLead', '')), ''),
        'ctaLabel', nullif(trim(coalesce(rules -> 'publicCopy' ->> 'ctaLabel', '')), ''),
        'inscriptionMark', nullif(trim(coalesce(rules -> 'publicCopy' ->> 'inscriptionMark', '')), ''),
        'inscriptionNote', nullif(trim(coalesce(rules -> 'publicCopy' ->> 'inscriptionNote', '')), '')
      )
    )
  ),
  true
)
where slug = 'pitbull-classic-2026'
  and coalesce(rules -> 'landing' ->> 'templateId', '') = '';

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_landing(text,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_landing.';
  end if;
  if not exists (select 1 from storage.buckets where id = 'event-media') then
    raise exception 'El bucket event-media no quedó creado.' using errcode = 'PLU01';
  end if;
end
$verification$;
