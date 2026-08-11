-- Redacta credenciales que versiones anteriores copiaban al outbox durable.
-- La aplicación ya persiste estos campos como [REDACTED]; esta migración limpia
-- filas históricas y evita que un retry use una credencial expuesta/vencida.

do $$
declare
  sensitive_types text[] := array[
    'email_verification',
    'password_reset',
    'security_access',
    'staff_invitation',
    'staff_email_change',
    'export_ready'
  ];
begin
  if to_regclass('public.transactional_email_logs') is null then
    return;
  end if;

  update public.transactional_email_logs
  set
    payload = (
      coalesce(payload, '{}'::jsonb)
      - array[
          'verificationUrl',
          'verificationCode',
          'resetUrl',
          'gateUrl',
          'tempPassword',
          'loginUrl',
          'invitationUrl',
          'downloadUrl'
        ]::text[]
    ) || jsonb_build_object('_sensitive_redacted', true),
    idempotency_key = 'email:redacted:' || id::text,
    status = case
      when status in ('pending', 'processing', 'retrying') then 'failed'
      else status
    end,
    error = case
      when status in ('pending', 'processing', 'retrying')
        then 'La credencial fue redactada. Reemitir desde el flujo de origen.'
      else error
    end,
    error_code = case
      when status in ('pending', 'processing', 'retrying')
        then 'SENSITIVE_PAYLOAD_REDACTED'
      else error_code
    end,
    next_retry_at = null,
    updated_at = now()
  where template_key = any(sensitive_types);
end
$$;

