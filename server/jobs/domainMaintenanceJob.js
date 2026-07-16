import { assertSupabaseResult } from '../lib/supabaseRpc.js'

const DEFAULT_INTERVAL_MS = 60_000

export function startDomainMaintenanceJob({ client, env = process.env } = {}) {
  if (!client || env.DOMAIN_MAINTENANCE_JOB_ENABLED === 'false') return null
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await Promise.all([
        client.rpc('expire_ticket_reservations', { p_now: new Date().toISOString() }),
        client.rpc('expire_domain_orders', { p_now: new Date().toISOString() }),
      ].map(async (request) => assertSupabaseResult(await request, 'Fallo el mantenimiento de ordenes.')))
    } catch (error) {
      console.error('domain-maintenance-job:', error)
    } finally {
      running = false
    }
  }
  void run()
  const intervalMs = Math.max(30_000, Number(env.DOMAIN_MAINTENANCE_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS)
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return timer
}
