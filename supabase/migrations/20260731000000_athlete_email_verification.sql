-- Verificación de email de atletas.
--
-- Hasta ahora `/api/athletes/register` creaba la cuenta y abría sesión sin
-- comprobar que la dirección existiera. Un typo en el email dejaba al atleta
-- sin comprobantes, sin aviso de renovación y sin poder recuperar la
-- contraseña, y nadie se enteraba hasta que reclamaba.
--
-- El flujo es NO bloqueante: la cuenta se usa igual desde el minuto cero. Lo
-- que se bloquea es afiliarse e inscribirse, que son las dos acciones donde
-- una dirección inválida genera un problema real (pago sin comprobante).
--
-- A diferencia de `athlete_password_reset_tokens`, acá no hace falta guardar
-- el hash del token: el token firmado ya lleva vencimiento, y reutilizar el
-- link sobre una cuenta ya verificada es inocuo (no otorga ninguna
-- credencial). En el reset sí importa el uso único porque cambia la clave.

alter table public.athletes
  add column if not exists email_verified_at timestamptz;

-- Las cuentas que ya venían operando se dan por verificadas: bloquearlas
-- retroactivamente les cortaría la afiliación sin aviso.
update public.athletes
set email_verified_at = coalesce(email_verified_at, created_at)
where email_verified_at is null;

create index if not exists athletes_email_unverified_idx
  on public.athletes (created_at)
  where email_verified_at is null;

create or replace function public.verify_athlete_email(p_athlete_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  update public.athletes
  set email_verified_at = coalesce(email_verified_at, now()),
      updated_at = now()
  where id = p_athlete_id
  returning * into v_athlete;

  if v_athlete.id is null then
    return jsonb_build_object('verified', false);
  end if;

  return jsonb_build_object(
    'verified', true,
    'athleteId', v_athlete.id,
    'email', v_athlete.email,
    'verifiedAt', v_athlete.email_verified_at
  );
end;
$$;

revoke all on function public.verify_athlete_email(uuid) from public, anon, authenticated;
grant execute on function public.verify_athlete_email(uuid) to service_role;
