import { recordOperationalAuditEvent } from '../modules/audit/operationalAuditWriter.js'
import { getMercadoPagoOAuthConfig } from '../modules/payments/mercadoPagoOAuth.js'
import { runMercadoPagoOAuthRefresh } from '../modules/payments/mercadoPagoOAuthAccounts.js'

const DEFAULT_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 h
const MIN_INTERVAL_MS = 60 * 60 * 1000

/**
 * Renueva los tokens de las cuentas de Mercado Pago vinculadas por OAuth antes
 * de que venzan (duran 180 días). Sin esto, a los seis meses cada evento con
 * cuenta propia dejaría de poder cobrar sin que nadie lo note.
 */
export async function runMercadoPagoOAuthRefreshJob({ client, env = process.env, now = new Date() } = {}) {
  const result = await runMercadoPagoOAuthRefresh({ client, env, now })
  if (result.status === 'disabled') return result

  const trouble = result.needsReconnect.length + result.failed.length
  if (result.refreshed > 0 || trouble > 0) {
    console.info(
      `mercado-pago-oauth-refresh-job: due=${result.due} refreshed=${result.refreshed} needsReconnect=${result.needsReconnect.length} failed=${result.failed.length}`,
    )
    await recordOperationalAuditEvent(client, {
      source: 'payment',
      action: 'payment_profiles.mp_oauth_refresh_run',
      entityType: 'payment_profile',
      entityId: 'mp-oauth-refresh-job',
      actorType: 'system',
      status: trouble > 0 ? 'failed' : 'succeeded',
      severity: trouble > 0 ? 'warning' : 'info',
      metadata: {
        due: result.due,
        refreshed: result.refreshed,
        needsReconnect: result.needsReconnect,
        failed: result.failed,
      },
    })
  }
  return result
}

export function startMercadoPagoOAuthRefreshJob({ client, env = process.env } = {}) {
  if (!client || !getMercadoPagoOAuthConfig(env).available) return null

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await runMercadoPagoOAuthRefreshJob({ client, env })
    } catch (error) {
      console.error('mercado-pago-oauth-refresh-job:', error)
    } finally {
      running = false
    }
  }

  void run()
  const intervalMs = Math.max(
    MIN_INTERVAL_MS,
    Number(env.MERCADO_PAGO_OAUTH_REFRESH_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  )
  const timer = setInterval(run, intervalMs)
  timer.unref()
  return timer
}
