-- OTP de verificación de email de atletas.
--
-- El link HMAC (`/?verificar=`) sigue siendo el camino principal. Este código
-- de 6 dígitos es el fallback cuando el cliente de correo no abre el botón o
-- el deep link falla. Se guarda solo el hash SHA-256; el valor crudo viaja
-- en el mail de onboarding/reenvío.

alter table public.athletes
  add column if not exists email_otp_hash text,
  add column if not exists email_otp_expires_at timestamptz,
  add column if not exists email_otp_attempts integer not null default 0;

comment on column public.athletes.email_otp_hash is
  'SHA-256 hex del OTP de verificación de email. Null si no hay código activo.';
comment on column public.athletes.email_otp_expires_at is
  'Vencimiento del OTP activo. Null si no hay código.';
comment on column public.athletes.email_otp_attempts is
  'Intentos fallidos contra el OTP activo. Se reinicia al emitir uno nuevo.';

create or replace function public.store_athlete_email_otp(
  p_athlete_id uuid,
  p_code_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_athlete_id is null or coalesce(trim(p_code_hash), '') = '' or p_expires_at is null then
    return false;
  end if;

  update public.athletes
     set email_otp_hash = p_code_hash,
         email_otp_expires_at = p_expires_at,
         email_otp_attempts = 0,
         updated_at = now()
   where id = p_athlete_id
     and email_verified_at is null;

  return found;
end;
$$;

create or replace function public.verify_athlete_email_with_otp(
  p_athlete_id uuid,
  p_code_hash text,
  p_max_attempts integer default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_max integer := greatest(coalesce(p_max_attempts, 8), 1);
begin
  if p_athlete_id is null or coalesce(trim(p_code_hash), '') = '' then
    return jsonb_build_object('verified', false, 'reason', 'invalid');
  end if;

  select * into v_athlete
    from public.athletes
   where id = p_athlete_id
   for update;

  if v_athlete.id is null then
    return jsonb_build_object('verified', false, 'reason', 'not_found');
  end if;

  if v_athlete.email_verified_at is not null then
    return jsonb_build_object(
      'verified', true,
      'alreadyVerified', true,
      'athleteId', v_athlete.id,
      'email', v_athlete.email,
      'verifiedAt', v_athlete.email_verified_at
    );
  end if;

  if v_athlete.email_otp_hash is null
     or v_athlete.email_otp_expires_at is null
     or v_athlete.email_otp_expires_at <= now() then
    return jsonb_build_object('verified', false, 'reason', 'expired');
  end if;

  if coalesce(v_athlete.email_otp_attempts, 0) >= v_max then
    return jsonb_build_object('verified', false, 'reason', 'locked');
  end if;

  if v_athlete.email_otp_hash is distinct from p_code_hash then
    update public.athletes
       set email_otp_attempts = coalesce(email_otp_attempts, 0) + 1,
           updated_at = now()
     where id = p_athlete_id;

    return jsonb_build_object(
      'verified', false,
      'reason', 'mismatch',
      'attempts', coalesce(v_athlete.email_otp_attempts, 0) + 1
    );
  end if;

  update public.athletes
     set email_verified_at = coalesce(email_verified_at, now()),
         email_otp_hash = null,
         email_otp_expires_at = null,
         email_otp_attempts = 0,
         updated_at = now()
   where id = p_athlete_id
   returning * into v_athlete;

  return jsonb_build_object(
    'verified', true,
    'alreadyVerified', false,
    'athleteId', v_athlete.id,
    'email', v_athlete.email,
    'verifiedAt', v_athlete.email_verified_at
  );
end;
$$;

revoke all on function public.store_athlete_email_otp(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.store_athlete_email_otp(uuid, text, timestamptz)
  to service_role;

revoke all on function public.verify_athlete_email_with_otp(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.verify_athlete_email_with_otp(uuid, text, integer)
  to service_role;
