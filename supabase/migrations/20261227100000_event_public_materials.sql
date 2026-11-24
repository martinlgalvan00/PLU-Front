-- Materiales publicos por evento. Cronograma y recientes entran al mismo
-- contrato que calendario/pesajes: el administrador decide si se muestran,
-- pero el cronograma conserva ademas su publicacion operativa propia.

create or replace function public.staff_merge_event_public_surface(
  p_slug text,
  p_surface jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_surface jsonb;
begin
  if coalesce(trim(p_slug), '') = '' then
    raise exception 'Slug de evento requerido.' using errcode = 'PLU01';
  end if;

  v_surface := jsonb_build_object(
    'calendar', coalesce((p_surface ->> 'calendar')::boolean, true),
    'weighIns', coalesce((p_surface ->> 'weighIns')::boolean, true),
    'schedule', coalesce((p_surface ->> 'schedule')::boolean, true),
    'recentRegistrants', coalesce((p_surface ->> 'recentRegistrants')::boolean, true),
    'livestream', coalesce((p_surface ->> 'livestream')::boolean, true),
    'experience', coalesce((p_surface ->> 'experience')::boolean, true),
    'categories', coalesce((p_surface ->> 'categories')::boolean, true),
    'location', coalesce((p_surface ->> 'location')::boolean, true),
    'faq', coalesce((p_surface ->> 'faq')::boolean, true),
    'tickets', coalesce((p_surface ->> 'tickets')::boolean, true),
    'countdown', coalesce((p_surface ->> 'countdown')::boolean, true)
  );

  update public.events
  set
    rules = jsonb_set(coalesce(rules, '{}'::jsonb), '{publicSurface}', v_surface, true),
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

revoke all on function public.staff_merge_event_public_surface(text, jsonb)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_public_surface(text, jsonb)
to service_role;
