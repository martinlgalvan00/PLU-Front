-- Fase 6: endurecer get_membership_by_code_or_token contra fuga de PII.
--
-- El RPC es de solo lectura y esta otorgado a `anon` porque es a donde
-- apunta el QR publico de verificacion (CredentialPage, sin login). Acepta
-- tanto el qr_token (uuid de alta entropia) como el member_code legible y
-- SECUENCIAL ("PLU-ARG-2026-001", "-002", ...) para que las credenciales ya
-- impresas antes de que existiera qr_token sigan funcionando.
--
-- El problema: devolvia `to_jsonb(v_athlete)` completo -- document_id (DNI),
-- email, phone, birth_date, city, gym, etc. -- para CUALQUIER lookup exitoso.
-- Como el member_code es adivinable/enumerable (correlativo, sin token),
-- cualquiera podia iterar "?credencial=PLU-ARG-2026-001", "-002", "-003"...
-- en la home publica y volcar PII de todos los afiliados sin login ni rate
-- limiting.
--
-- Ningun consumidor actual necesita ese detalle completo:
--   - CredentialPage.jsx (publico, sin sesion) solo lee athlete.fullName.
--   - checkinScanService.js (staff logueado escaneando en la puerta) ademas
--     lee athlete.documentId para cotejar el DNI fisico del asistente.
-- Por eso el fix es recortar la fila a esos tres campos en vez de tocar el
-- contrato (mismo nombre de funcion, mismos parametros, misma forma de
-- respuesta) -- ningun caller necesita cambiar.
create or replace function public.get_membership_by_code_or_token(p_code text, p_event_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_membership public.memberships;
  v_athlete public.athletes;
  v_registration public.event_registrations;
  v_event public.events;
begin
  begin
    v_token := p_code::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  if v_token is not null then
    select * into v_membership from public.memberships where qr_token = v_token;
  else
    select * into v_membership from public.memberships where member_code = p_code;
  end if;

  if not found then
    raise exception 'Credencial no encontrada.' using errcode = 'PLU02';
  end if;

  select * into v_athlete from public.athletes where id = v_membership.athlete_id;

  if p_event_slug is not null then
    select * into v_event from public.events where slug = p_event_slug;
    if found then
      select * into v_registration
        from public.event_registrations
        where athlete_id = v_athlete.id and event_id = v_event.id and status <> 'cancelada';
    end if;
  end if;

  return jsonb_build_object(
    'athlete', jsonb_build_object(
      'id', v_athlete.id,
      'full_name', v_athlete.full_name,
      'document_id', v_athlete.document_id
    ),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

grant execute on function public.get_membership_by_code_or_token(text, text) to anon, authenticated;
