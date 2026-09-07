import { assertSupabaseResult } from '../lib/supabaseRpc.js'

const DEFAULT_INTERVAL_MS = 60_000

export async function runDomainMaintenanceJob({ client } = {}) {
  if (!client) throw new Error('Supabase no está configurado para mantenimiento de dominio.')

  const now = new Date().toISOString()

  // `expire_stale_payment_attempts` va PRIMERO y solo: libera las órdenes que
  // `expire_domain_orders` puede cancelar recién después. En paralelo con él,
  // una orden abandonada esperaría hasta el próximo ciclo por nada — el mismo
  // orden que respeta el cron de `20261110100000_payment_session_expiry_control`.
  const staleAttempts = assertSupabaseResult(
    await client.rpc('expire_stale_payment_attempts', { p_now: now }),
    'Falló el barrido de intentos de pago abandonados.',
  )

  const [ticketReservations, domainOrders, financedOrders] = await Promise.all(
    [
      client.rpc('expire_ticket_reservations', { p_now: now }),
      client.rpc('expire_domain_orders', { p_now: now }),
      client.rpc('expire_financed_payment_orders', { p_now: now }),
    ].map(async (request) =>
      assertSupabaseResult(await request, 'Falló el mantenimiento de órdenes.'),
    ),
  )

  // `failedOrders` existe desde 20260923100000: antes el barrido devolvía
  // `expiredOrders: 0` tanto cuando no había nada que vencer como cuando
  // fallaron todas. Cada fallo queda asentado en la bitácora; acá se sube
  // también al log del proceso, que es donde se mira cuando un atleta
  // reclama que sigue habilitado con el plazo vencido.
  const failedOrders = Number(financedOrders?.failedOrders) || 0
  if (failedOrders > 0) {
    console.error(
      `domain-maintenance-job: ${failedOrders} orden(es) financiada(s) vencida(s) no se pudieron dar de baja.`,
    )
  }

  // Órdenes vencidas que el barrido decidió no tocar porque el intento sí
  // llegó al proveedor. No es un error del job: es trabajo para una persona,
  // y si el número no baja solo, alguien tiene que mirarlo.
  const blockedByProvider = Number(staleAttempts?.blockedByProvider) || 0
  if (blockedByProvider > 0) {
    console.warn(
      `domain-maintenance-job: ${blockedByProvider} orden(es) vencida(s) trabada(s) por un intento con pago en el proveedor.`,
    )
  }

  return { staleAttempts, ticketReservations, domainOrders, financedOrders }
}

export function startDomainMaintenanceJob({ client, env = process.env } = {}) {
  if (!client || env.DOMAIN_MAINTENANCE_JOB_ENABLED === 'false') return null
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await runDomainMaintenanceJob({ client })
    } catch (error) {
      console.error('domain-maintenance-job:', error)
    } finally {
      running = false
    }
  }
  void run()
  const intervalMs = Math.max(
    30_000,
    Number(env.DOMAIN_MAINTENANCE_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  )
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return timer
}
