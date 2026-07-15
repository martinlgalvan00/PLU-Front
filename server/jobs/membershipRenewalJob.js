import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'
import { createSupabaseNotificationRepository } from '../modules/notifications/supabaseNotificationRepository.js'
import { processMembershipRenewals } from '../modules/memberships/renewalWorkflow.js'

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000

export function startMembershipRenewalJob({ client, env = process.env } = {}) {
  if (env.MEMBERSHIP_RENEWAL_JOB_ENABLED !== 'true' || !client) return null

  const repository = createSupabaseNotificationRepository(client)
  const brevo = createBrevoAdapter({ env })
  const run = () =>
    processMembershipRenewals({
      repository,
      brevo,
      templateId: env.BREVO_TEMPLATE_MEMBERSHIP_RENEWAL,
      appUrl: env.APP_URL ?? env.VITE_APP_URL ?? 'http://localhost:5173',
    }).catch((error) => console.error('membership-renewal-job:', error))

  void run()
  const intervalMs = Number(env.MEMBERSHIP_RENEWAL_JOB_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const timer = setInterval(run, Math.max(60_000, intervalMs))
  timer.unref()
  return timer
}
