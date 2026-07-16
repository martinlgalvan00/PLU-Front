-- Fase 6: expire_memberships() dejaba de correr si el proceso Express
-- (server/jobs/membershipRenewalJob.js, un setInterval de 6h detrás de
-- MEMBERSHIP_RENEWAL_JOB_ENABLED) no estaba desplegado o se caía -- en ese
-- caso ninguna membresía vencida pasaba nunca a 'vencida' en la base, y
-- CredentialPage seguía mostrando "Credencial válida" en la puerta de un
-- evento indefinidamente (mitigado del lado cliente en CredentialPage.jsx
-- comparando expiration_date en vivo, pero la fuente de verdad debe
-- corregirse sola en el server sin depender de un proceso externo).
--
-- pg_cron corre DENTRO de Postgres -- no depende de que el server Express
-- esté arriba. Requiere la extensión "pg_cron" habilitada en el proyecto
-- (Supabase: Database → Extensions → pg_cron). El "if not exists" hace que
-- esta migración no falle si ya estaba habilitada; si el plan/entorno no
-- la tiene disponible, esta migración va a fallar acá con un error claro
-- en vez de fallar silenciosamente -- en ese caso, habilitala desde el
-- dashboard y volvé a correr la migración.
create extension if not exists pg_cron with schema extensions;

-- Reemplaza el job si ya existe (por si esta migración se corre más de
-- una vez) en vez de acumular duplicados.
select cron.unschedule(jobid)
from cron.job
where jobname = 'expire-memberships-daily';

-- Todos los días a las 03:00 UTC (horario de bajo tráfico) -- alcanza con
-- una vez al día, expiration_date es una fecha, no un timestamp.
select cron.schedule(
  'expire-memberships-daily',
  '0 3 * * *',
  $$select public.expire_memberships(current_date);$$
);
