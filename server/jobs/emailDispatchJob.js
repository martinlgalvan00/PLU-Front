import { mapWithConcurrency } from '../lib/concurrency.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'

/**
 * emailDispatchJob.js — PLU ARG
 *
 * Vacía la cola de emails que quedaron en 'retrying'. Hasta ahora un fallo
 * transitorio de Brevo (429 por cuota, 502 momentáneo, corte de red) mataba el
 * email para siempre: quedaba en 'failed' y nadie lo volvía a mirar. El atleta
 * simplemente no recibía su comprobante.
 *
 * El reclamo del lote es atómico del lado de PostgreSQL (`for update skip
 * locked` dentro de `claim_retryable_emails`), así que dos instancias de la API
 * corriendo en paralelo no pueden mandar el mismo email dos veces.
 *
 * Corre por dos vías, igual que el resto de los jobs del repo:
 *  - Intervalo en proceso (5 min), si hay una instancia Express residente.
 *  - `GET /api/internal/jobs/email-dispatch` con `CRON_SECRET`, para Vercel,
 *    donde no se garantizan procesos de larga vida.
 *
 * Limitación conocida en Vercel Hobby: los cron jobs admiten como máximo una
 * corrida diaria (contrato verificado en `tests/deploymentConfig.test.js`). Ahí
 * el backoff de `emailDispatcher` (2 min, 10 min, 1 h, 6 h, 24 h) colapsa a un
 * intento por día: el primer envío sigue siendo inmediato y sincrónico, pero la
 * recuperación de un fallo transitorio tarda hasta 24 h. Con un proceso
 * residente (local, VPS, o Vercel Pro con cron horario) el backoff se respeta
 * como está definido.
 */

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_BATCH_SIZE = 50

export async function runEmailDispatchJob({ client, env = process.env } = {}) {
  if (!client) throw new Error('Supabase no está configurado para despachar emails.')

  const repository = createSupabaseNotificationRepository(client)
  const brevo = createBrevoAdapter({ env })

  if (!brevo.configured) {
    return { processed: 0, sent: 0, failed: 0, skipped: true }
  }

  const dispatcher = createEmailDispatcher({ repository, brevo, env })
  const limit = Number(env.EMAIL_DISPATCH_BATCH_SIZE) || DEFAULT_BATCH_SIZE
  const claimed = (await repository.claimRetryableEmails({ limit })) ?? []

  // En paralelo acotado: un lote de 50 en fila son ~10 s de latencia pura
  // contra Brevo, y en Vercel comparte el presupuesto de la función.
  const concurrency = Math.max(1, Number(env.EMAIL_DISPATCH_CONCURRENCY) || 8)
  const results = await mapWithConcurrency(claimed, concurrency, (emailLog) => dispatcher.retry(emailLog))

  let sent = 0
  let failed = 0
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.status === 'sent') {
      sent += 1
    } else {
      failed += 1
      if (result.status === 'rejected') {
        // `retry` ya persiste el fallo; si igual explota, la fila queda en
        // 'processing' y la recupera el barrido de filas colgadas.
        console.error('email-dispatch-job:', result.reason?.message ?? result.reason)
      }
    }
  }

  return { processed: claimed.length, sent, failed, skipped: false }
}

export function startEmailDispatchJob({ client, env = process.env } = {}) {
  if (env.EMAIL_DISPATCH_JOB_ENABLED === 'false' || !client) return null

  const run = () =>
    runEmailDispatchJob({ client, env }).catch((error) => console.error('email-dispatch-job:', error))

  void run()
  const intervalMs = Number(env.EMAIL_DISPATCH_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const timer = setInterval(run, Math.max(60_000, intervalMs))
  timer.unref()
  return timer
}
