-- Landing: FAQ (3 pares) + SEO (metaTitle / metaDescription).
-- Reemite staff_merge_event_landing conservando los slots previos.

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
  v_meta_title text;
  v_meta_desc text;
  v_faq1_q text;
  v_faq1_a text;
  v_faq2_q text;
  v_faq2_a text;
  v_faq3_q text;
  v_faq3_a text;
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
  v_meta_title := nullif(trim(coalesce(v_slots ->> 'metaTitle', '')), '');
  v_meta_desc := nullif(trim(coalesce(v_slots ->> 'metaDescription', '')), '');
  v_faq1_q := nullif(trim(coalesce(v_slots ->> 'faq1Question', '')), '');
  v_faq1_a := nullif(trim(coalesce(v_slots ->> 'faq1Answer', '')), '');
  v_faq2_q := nullif(trim(coalesce(v_slots ->> 'faq2Question', '')), '');
  v_faq2_a := nullif(trim(coalesce(v_slots ->> 'faq2Answer', '')), '');
  v_faq3_q := nullif(trim(coalesce(v_slots ->> 'faq3Question', '')), '');
  v_faq3_a := nullif(trim(coalesce(v_slots ->> 'faq3Answer', '')), '');

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
     or length(coalesce(v_hero_path, '')) > 200
     or length(coalesce(v_meta_title, '')) > 70
     or length(coalesce(v_meta_desc, '')) > 160
     or length(coalesce(v_faq1_q, '')) > 120
     or length(coalesce(v_faq1_a, '')) > 400
     or length(coalesce(v_faq2_q, '')) > 120
     or length(coalesce(v_faq2_a, '')) > 400
     or length(coalesce(v_faq3_q, '')) > 120
     or length(coalesce(v_faq3_a, '')) > 400 then
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
        'heroImagePath', v_hero_path,
        'metaTitle', v_meta_title,
        'metaDescription', v_meta_desc,
        'faq1Question', v_faq1_q,
        'faq1Answer', v_faq1_a,
        'faq2Question', v_faq2_q,
        'faq2Answer', v_faq2_a,
        'faq3Question', v_faq3_q,
        'faq3Answer', v_faq3_a
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

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_landing(text,jsonb)') is null then
    raise exception 'Falta public.staff_merge_event_landing.';
  end if;
end
$verification$;
