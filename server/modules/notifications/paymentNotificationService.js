import { queueTransactionalEmail } from './notificationWorkflow.js'

export function createPaymentNotificationService({ repository, brevo, env = process.env }) {
  return async function notifyPaymentApplied({ order, payment }) {
    if (payment.status !== 'aprobado' || !order.payerEmail) return []

    const common = {
      to: order.payerEmail,
      entityType: order.kind === 'ticket' ? 'ticket_order' : 'athlete_payment_order',
      entityId: order.id,
    }
    const jobs = [
      queueTransactionalEmail(
        'payment_approved',
        {
          ...common,
          idempotencyKey: `email:payment-approved:${payment.externalPaymentId}`,
          templateId: env.BREVO_TEMPLATE_PAYMENT_APPROVED,
          params: {
            name: order.athlete?.full_name ?? order.payerEmail,
            amount: payment.amount,
            concept: order.displayConcept,
            reference: order.reference,
          },
        },
        { repository, brevo },
      ),
    ]

    if (order.kind === 'athlete' && ['membership', 'combo'].includes(order.concept)) {
      jobs.push(
        queueTransactionalEmail(
          'affiliation_started',
          {
            ...common,
            idempotencyKey: `email:affiliation-started:${payment.externalPaymentId}`,
            templateId: env.BREVO_TEMPLATE_AFFILIATION_STARTED,
            params: { name: order.athlete?.full_name, reference: order.reference },
          },
          { repository, brevo },
        ),
      )
    }

    return Promise.allSettled(jobs)
  }
}
