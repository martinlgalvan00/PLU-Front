-- El barrido de vencimientos pasaba cada minuto. Medido sobre 30 días de
-- pg_stat_statements, `expire_ticket_reservations` es la consulta con más
-- tiempo total acumulado de toda la base (373,8 s en 30.533 corridas) y
-- `expire_domain_orders` la sigue (188,6 s). A eso se suma la contabilidad del
-- propio pg_cron: cinco escrituras a `cron.job_run_details` por corrida, otros
-- ~103 s. Casi todas esas corridas no expiran nada.
--
-- El costo no está en el barrido en sí -- para eso están los índices parciales
-- de `20260802150000_concurrency_hot_path_indexes.sql` -- sino en repetirlo
-- 1.440 veces por día: pg_cron abre una sesión nueva en cada corrida, así que
-- ni siquiera reusa el plan de una consulta con CTEs encadenadas y `not
-- exists`. Bajar a cada 3 minutos corta dos tercios de ese trabajo sin tocar
-- una sola línea de la lógica.
--
-- El precio es cuánto tarda una reserva vencida en liberar stock. La ventana
-- de reserva de tickets es de 20 minutos (`v_hold_minutes` en
-- `20260716000000_infrastructure_hardening.sql`), de modo que el peor caso
-- pasa de 1 a 3 minutos: 15 % de la ventana. Si en una venta con stock ajustado
-- eso llegara a molestar, volver a '* * * * *' es cambiar esta línea.
--
-- El jobname cambia porque el anterior decía "minute" y ya no describe el
-- schedule; se desprograma explícitamente para no dejar los dos corriendo.

select cron.unschedule(jobid)
from cron.job
where jobname in ('expire-domain-orders-minute', 'expire-domain-orders-sweep');

select cron.schedule(
  'expire-domain-orders-sweep',
  '*/3 * * * *',
  $$
    select public.expire_ticket_reservations(now());
    select public.expire_domain_orders(now());
  $$
);
