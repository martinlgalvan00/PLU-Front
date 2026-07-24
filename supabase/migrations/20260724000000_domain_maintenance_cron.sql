-- Las reservas y órdenes vencidas deben liberarse aunque no haya una instancia
-- Express encendida. Vercel Functions no garantiza procesos residentes, por lo
-- que estas tareas puramente transaccionales corren en el mismo PostgreSQL.
create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'expire-domain-orders-minute';

select cron.schedule(
  'expire-domain-orders-minute',
  '* * * * *',
  $$
    select public.expire_ticket_reservations(now());
    select public.expire_domain_orders(now());
  $$
);
