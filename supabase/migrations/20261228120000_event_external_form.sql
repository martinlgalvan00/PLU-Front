-- Formulario externo (Google Forms) por evento.
--
-- El staff pega el link de un Google Form y el sitio ofrece un botón y un QR
-- para responderlo. Se guarda en `events.rules.externalForm` como `{url, label}`
-- con el mismo patrón que `publicSurface`: una RPC chica que corre después del
-- upsert (que reconstruye `rules`), sin tocar el cuerpo de `staff_upsert_event`.
--
-- La URL termina en un href público y en un QR impreso, así que la base repite
-- la regla de la API (`src/lib/eventExternalForm.js`): https y dominios de
-- Google Forms, nada más. Vacía quita el formulario.

create or replace function public.staff_merge_event_external_form(
  p_slug text,
  p_url text,
  p_label text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  if v_url is not null then
    if length(v_url) > 500
       or v_url !~* '^https://(forms\.gle/[^\s/@]+[^\s@]*|(docs|forms)\.google\.com/([a-z]/[^/\s@]+/)?forms/[^\s@]+)$' then
      raise exception 'El formulario debe ser un link https de Google Forms.' using errcode = 'PLU01';
    end if;
  end if;

  if length(coalesce(v_label, '')) > 60 then
    raise exception 'El texto del botón es demasiado largo.' using errcode = 'PLU01';
  end if;

  update public.events
  set
    rules = case
      when v_url is null then coalesce(rules, '{}'::jsonb) - 'externalForm'
      else jsonb_set(
        coalesce(rules, '{}'::jsonb),
        '{externalForm}',
        jsonb_strip_nulls(jsonb_build_object('url', v_url, 'label', v_label)),
        true
      )
    end,
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_external_form(text, text, text)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_external_form(text, text, text)
to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_merge_event_external_form(text,text,text)') is null then
    raise exception 'Falta public.staff_merge_event_external_form.';
  end if;
end
$verification$;
