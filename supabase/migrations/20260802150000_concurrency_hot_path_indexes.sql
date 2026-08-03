-- Camino caliente de la venta de entradas bajo carga.
--
-- create_ticket_order_v2 toma `select ... from public.events ... for update`
-- (20260719000000:404) antes de validar cupo. Eso es correcto -- es lo que
-- impide sobrevender cuando N personas compran a la vez -- pero convierte la
-- venta de un evento en una cola estrictamente serial: mientras una orden se
-- procesa, el resto espera. El tiempo total que N compradores tardan en entrar
-- es N x (lo que dure la transaccion), asi que todo lo que corra adentro del
-- lock hay que pagarlo multiplicado por la concurrencia.
--
-- Adentro del lock hay hoy tres cosas que hacen trabajo proporcional al tamaño
-- de las tablas, y ninguna tiene un indice que las cubra del todo:
--
--   1. expire_ticket_reservations(now()) (20260719000000:402). Ya corre cada
--      minuto por pg_cron (20260724000000), asi que la llamada inline casi
--      nunca tiene algo que cancelar -- pero igual escanea ticket_orders
--      entera para descubrirlo.
--   2. count(*) sobre tickets por evento, filtrando status <> 'cancelada'.
--   3. count(*) sobre tickets por ticket_type, mismo filtro.
--
-- Los indices existentes (tickets_event_status_idx (event_id, status) y
-- tickets_ticket_type_idx (ticket_type_id)) no ayudan del todo: el predicado
-- es una desigualdad sobre status, que no puede usarse como prefijo de
-- busqueda, con lo cual el planner termina leyendo y descartando las
-- canceladas. Los indices parciales de abajo mueven ese filtro al indice.
--
-- No se toca ninguna funcion: solo se agregan indices. La correccion del cupo
-- la sigue dando el mismo lock de siempre; lo que baja es cuanto dura.
--
-- Nota operativa: son `create index` normales, no `concurrently`, porque las
-- migraciones corren dentro de una transaccion. Toman un lock de escritura
-- breve sobre cada tabla -- correr el deploy fuera de una ventana de venta.

-- ---------------------------------------------------------------------------
-- 1 · Barrido de reservas vencidas
-- ---------------------------------------------------------------------------
-- Convierte el UPDATE de expire_ticket_reservations en un range scan sobre
-- reservation_expires_at. Cuando no hay nada vencido -- el caso normal, porque
-- el cron pasa cada minuto -- no devuelve filas y sale casi gratis.
create index if not exists ticket_orders_pending_reservation_idx
  on public.ticket_orders (reservation_expires_at)
  where status in ('creado', 'pendiente') and reservation_expires_at is not null;

-- Mismo criterio para expire_domain_orders, que corre en el mismo cron. Ojo
-- que esta funcion no usa las mismas columnas ni los mismos estados que la de
-- tickets: filtra por `expires_at` y por ('pendiente', 'validacion_manual')
-- -- 'creado' no existe en el check de athlete_payment_orders.
create index if not exists athlete_payment_orders_pending_expiry_idx
  on public.athlete_payment_orders (expires_at)
  where status in ('pendiente', 'validacion_manual') and expires_at is not null;

-- ---------------------------------------------------------------------------
-- 2 y 3 · Conteo de cupo por evento y por tipo de entrada
-- ---------------------------------------------------------------------------
-- El predicado `status <> 'cancelada'` queda dentro del indice, asi que el
-- conteo recorre solo las entradas que ocupan cupo.
create index if not exists tickets_event_active_idx
  on public.tickets (event_id)
  where status <> 'cancelada';

create index if not exists tickets_type_active_idx
  on public.tickets (ticket_type_id)
  where status <> 'cancelada';

-- ---------------------------------------------------------------------------
-- Sesiones: lookup por token en cada request autenticado
-- ---------------------------------------------------------------------------
-- readAthleteSession corre una vez por request del area de atletas y filtra
-- por token_hash. athlete_sessions_lookup_idx (20260716000000:48) ya cubre
-- (token_hash, expires_at); lo que falta es el camino de revocacion masiva que
-- introdujo set_athlete_password, que filtra por athlete_id.
create index if not exists athlete_sessions_athlete_active_idx
  on public.athlete_sessions (athlete_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Estadisticas al dia
-- ---------------------------------------------------------------------------
-- Sin esto el planner sigue con las estadisticas viejas y puede tardar en
-- elegir los indices nuevos justo durante el primer pico de venta.
analyze public.ticket_orders;
analyze public.athlete_payment_orders;
analyze public.tickets;
analyze public.athlete_sessions;
