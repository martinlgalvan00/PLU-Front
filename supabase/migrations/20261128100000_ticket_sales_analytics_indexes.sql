-- Índices para el reporte de ventas de entradas del panel.
--
-- El tab "Análisis" de Pagos agrega ventas de entradas por evento y rango de
-- fechas: cuántas se vendieron por día (`tickets.created_at`) y cuánto se
-- recaudó por orden aprobada (`ticket_orders.created_at`). Los índices que ya
-- existen sobre estas tablas cubren `(event_id, status)`
-- (`tickets_event_status_idx`, `ticket_orders_event_status_idx`,
-- 20260706030000) y los parciales de cupo (`tickets_event_active_idx`,
-- 20260802150000), pero ninguno cubre `created_at` -- una serie temporal por
-- evento hoy hace un seq scan filtrado, barato mientras el volumen por evento
-- sea chico (que es el caso actual) pero sin margen para crecer.
--
-- No hace falta ninguna RPC ni función nueva: el reporte es de sólo lectura y
-- el backend consulta con la service-role key (bypassea RLS), así que
-- `SECURITY DEFINER` no aporta nada acá -- se reserva para las mutaciones que
-- sí necesitan sus invariantes transaccionales (ver
-- `create_ticket_order_v3`, cupo bajo lock).
--
-- Nota operativa, misma que 20260802150000: son `create index` normales, no
-- `concurrently` -- las migraciones corren dentro de una transacción. Correr
-- el deploy fuera de una ventana de venta activa.

-- ---------------------------------------------------------------------------
-- 1 · Recaudado por evento y fecha (órdenes aprobadas)
-- ---------------------------------------------------------------------------
-- El predicado `status = 'aprobado'` queda dentro del índice: el reporte
-- nunca necesita las órdenes creadas/pendientes/rechazadas para sumar plata.
create index if not exists ticket_orders_event_created_approved_idx
  on public.ticket_orders (event_id, created_at desc)
  where status = 'aprobado';

-- ---------------------------------------------------------------------------
-- 2 · Entradas vendidas por evento y fecha
-- ---------------------------------------------------------------------------
-- Mismo criterio que ya usa `create_ticket_order_v3` para no contar doble una
-- compra de entrenador (2 credenciales, 1 sola entrada real): el predicado
-- filtra `is_primary_credential` además de excluir canceladas.
create index if not exists tickets_event_created_primary_idx
  on public.tickets (event_id, created_at desc)
  where is_primary_credential and status <> 'cancelada';

-- ---------------------------------------------------------------------------
-- Estadísticas al día
-- ---------------------------------------------------------------------------
analyze public.ticket_orders;
analyze public.tickets;
