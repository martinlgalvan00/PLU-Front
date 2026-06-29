import { env } from '../config/env.js'
import { apiPost } from '../lib/api.js'

const logs = []

const templateByType = {
  affiliation_started: env.brevo.templates.affiliationStarted,
  payment_approved: env.brevo.templates.paymentApproved,
  registration_confirmed: env.brevo.templates.registrationConfirmed,
  payment_pending: env.brevo.templates.paymentPending,
  admin_notification: env.brevo.templates.adminNotification,
}

export function isBrevoConfigured() {
  return env.brevo.configured
}

export function getEmailLogs() {
  return [...logs]
}

export async function sendTransactionalEmail(type, { to, params = {} }) {
  const entry = {
    id: `email-${Date.now()}`,
    type,
    to,
    templateId: templateByType[type] || null,
    params,
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  }

  if (!env.brevo.configured) {
    entry.status = 'omitido'
    logs.push(entry)
    return entry
  }

  try {
    await apiPost('/api/emails/send', { type, to, params, templateId: entry.templateId })
    entry.status = 'enviado'
  } catch (error) {
    entry.status = 'fallido'
    entry.error = error.message
  }

  logs.push(entry)
  return entry
}

export function notifyAffiliationStarted(athlete) {
  return sendTransactionalEmail('affiliation_started', {
    to: athlete.email,
    params: { name: athlete.fullName, memberCode: athlete.memberCode },
  })
}

export function notifyPaymentApproved(athlete, payment) {
  return sendTransactionalEmail('payment_approved', {
    to: athlete.email,
    params: { name: athlete.fullName, amount: payment.amount, concept: payment.concept },
  })
}

export function notifyRegistrationConfirmed(athlete, event) {
  return sendTransactionalEmail('registration_confirmed', {
    to: athlete.email,
    params: { name: athlete.fullName, event },
  })
}
