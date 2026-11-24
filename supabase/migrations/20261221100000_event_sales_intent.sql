-- Intención de venta del evento: cobrar vs solo anunciar.
--
-- El upsert reconstruye `rules` con un set fijo de claves y pisaría este flag,
-- así que vive en `rules.salesIntent` y se escribe con merge post-save
-- (mismo patrón que publicCopy / cash_payment).
--
-- `charge` (default): el meet vende; los avisos de cobro aplican.
-- `announce`: soft-launch / seminario anunciado sin abrir medios todavía.
-- No implementa inscripción gratis (price = 0); solo la intención operativa.

create or replace function public.staff_merge_event_sales_intent(
  p_slug text,
  p_sales_intent text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent text;
begin
  if coalesce(length(trim(p_slug)), 0) < 2 then
    raise exception 'Slug de evento inválido.' using errcode = 'PLU01';
  end if;

  v_intent := lower(trim(coalesce(p_sales_intent, 'charge')));
  if v_intent not in ('charge', 'announce') then
    raise exception 'salesIntent inválido.' using errcode = 'PLU01';
  end if;

  update public.events
  set
    rules = case
      when v_intent = 'charge' then coalesce(rules, '{}'::jsonb) - 'salesIntent'
      else jsonb_set(coalesce(rules, '{}'::jsonb), '{salesIntent}', to_jsonb(v_intent), true)
    end,
    updated_at = now()
  where slug = trim(p_slug);

  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU04';
  end if;
end;
$$;

comment on function public.staff_merge_event_sales_intent(text, text) is
  'Merge post-upsert: rules.salesIntent = charge|announce. charge borra la clave (default).';

revoke all on function public.staff_merge_event_sales_intent(text, text)
from public, anon, authenticated;

grant execute on function public.staff_merge_event_sales_intent(text, text)
to service_role;
