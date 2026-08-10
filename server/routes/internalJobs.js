import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { runDomainMaintenanceJob } from '../jobs/domainMaintenanceJob.js'
import { runEmailDispatchJob } from '../jobs/emailDispatchJob.js'
import { runMembershipRenewalJob } from '../jobs/membershipRenewalJob.js'
import { runPaymentRecoveryJob } from '../jobs/paymentRecoveryJob.js'
import { runSecurityUserLifecycleJob } from '../jobs/securityUserLifecycleJob.js'
import { HttpError } from '../lib/errors.js'
import { PAYMENT_RECOVERY_JOB_ENABLED } from '../modules/payments/paymentRuntimeDefaults.js'

function hasValidCronAuthorization(request, secret) {
  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.get('authorization') ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function createInternalJobRoutes({
  getPrisma,
  getSupabaseAdmin,
  env = process.env,
  runners = {},
} = {}) {
  const router = Router()
  const run = {
    domainMaintenance: runners.domainMaintenance ?? runDomainMaintenanceJob,
    emailDispatch: runners.emailDispatch ?? runEmailDispatchJob,
    membershipRenewal: runners.membershipRenewal ?? runMembershipRenewalJob,
    paymentRecovery: runners.paymentRecovery ?? runPaymentRecoveryJob,
    securityUserLifecycle: runners.securityUserLifecycle ?? runSecurityUserLifecycleJob,
  }

  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    const secret = String(env.CRON_SECRET ?? '').trim()
    if (!secret) {
      res.status(503).json({ error: 'Ejecución programada no configurada.' })
      return
    }
    if (!hasValidCronAuthorization(req, secret)) {
      next(new HttpError(401, 'No autorizado.'))
      return
    }
    next()
  })

  router.get('/jobs/payment-recovery', async (_req, res) => {
    if (!PAYMENT_RECOVERY_JOB_ENABLED) {
      res.json({ status: 'disabled', job: 'payment-recovery' })
      return
    }
    const result = await run.paymentRecovery({ client: getSupabaseAdmin?.(), env })
    res.json({ status: 'completed', job: 'payment-recovery', result })
  })

  // Vacía la cola de emails en 'retrying'. Habilitado salvo que sea 'false':
  // sin él, un fallo transitorio de Brevo deja el email muerto.
  router.get('/jobs/email-dispatch', async (_req, res) => {
    if (env.EMAIL_DISPATCH_JOB_ENABLED === 'false') {
      res.json({ status: 'disabled', job: 'email-dispatch' })
      return
    }
    const result = await run.emailDispatch({ client: getSupabaseAdmin?.(), env })
    res.json({ status: 'completed', job: 'email-dispatch', result })
  })

  router.get('/jobs/membership-renewal', async (_req, res) => {
    if (env.MEMBERSHIP_RENEWAL_JOB_ENABLED !== 'true') {
      res.json({ status: 'disabled', job: 'membership-renewal' })
      return
    }
    const result = await run.membershipRenewal({ client: getSupabaseAdmin?.(), env })
    res.json({ status: 'completed', job: 'membership-renewal', result })
  })

  router.get('/jobs/security-user-lifecycle', async (_req, res) => {
    if (env.SECURITY_USER_LIFECYCLE_JOB_ENABLED === 'false') {
      res.json({ status: 'disabled', job: 'security-user-lifecycle' })
      return
    }
    const result = await run.securityUserLifecycle({
      prisma: getPrisma?.(),
      client: getSupabaseAdmin?.(),
      env,
    })
    res.json({ status: 'completed', job: 'security-user-lifecycle', result })
  })

  router.get('/jobs/domain-maintenance', async (_req, res) => {
    if (env.DOMAIN_MAINTENANCE_JOB_ENABLED === 'false') {
      res.json({ status: 'disabled', job: 'domain-maintenance' })
      return
    }
    const result = await run.domainMaintenance({ client: getSupabaseAdmin?.(), env })
    res.json({ status: 'completed', job: 'domain-maintenance', result })
  })

  return router
}
