import { createEmailDispatcher } from './emailDispatcher.js'
import { buildEventPagePath } from '../../../src/lib/eventPageRoute.js'

/**
 * paymentNotificationService.js — PLU ARG
 *
 * Emails que dispara la aplicación de un pago. Se llama después de que el pago
 * ya quedó asentado, así que un fallo de Brevo nunca revierte la acreditación:
 * de ahí el `Promise.allSettled`.
 *
 * La idempotencia se ancla en `externalPaymentId` (el ID de Mercado Pago), no
 * en el ID de la orden: un reintento del webhook llega con el mismo pago y no
 * puede generar un segundo comprobante.
 */
export function createPaymentNotificationService({ repository, brevo, dispatcher, env = process.env }) {
  const mailer = dispatcher ?? createEmailDispatcher({ repository, brevo, env })
  const appUrl = (env.APP_URL ?? env.VITE_APP_URL ?? '').replace(/\/$/, '')

  return async function notifyPaymentApplied({ order, payment }) {
    const payerEmail = order.payerEmail ?? payment.payerEmail
    if (!payerEmail) return []

    const recipientName = order.athlete?.full_name ?? payerEmail
    const common = {
      to: payerEmail,
      entityType: order.kind === 'ticket' ? 'ticket_order' : 'athlete_payment_order',
      entityId: order.id,
    }

    if (payment.status === 'rechazado') {
      return Promise.allSettled([
        mailer.send('payment_rejected', {
          ...common,
          idempotencyKey: `email:payment-rejected:${payment.externalPaymentId}`,
          params: {
            name: recipientName,
            amount: payment.amount,
            concept: order.displayConcept,
            reason: payment.statusDetail ?? '',
            retryUrl: `${appUrl}/mi-cuenta?section=payments`,
          },
        }),
      ])
    }

    if (payment.status === 'pendiente') {
      return Promise.allSettled([
        mailer.send('payment_pending', {
          ...common,
          idempotencyKey: `email:payment-pending:${payment.externalPaymentId}`,
          params: {
            name: recipientName,
            amount: payment.amount,
            concept: order.displayConcept,
            reference: order.reference,
            accountUrl: `${appUrl}/mi-cuenta?section=payments`,
          },
        }),
      ])
    }

    if (payment.status !== 'aprobado') return []

    const jobs = [
      mailer.send('payment_approved', {
        ...common,
        idempotencyKey: `email:payment-approved:${payment.externalPaymentId}`,
        params: {
          name: recipientName,
          amount: payment.amount,
          concept: order.displayConcept,
          reference: order.reference,
        },
      }),
      // El comprobante va aparte del aviso: es el documento que el socio
      // guarda, y está marcado como crítico en el catálogo.
      mailer.send('payment_receipt', {
        ...common,
        idempotencyKey: `email:payment-receipt:${payment.externalPaymentId}`,
        params: {
          name: recipientName,
          amount: payment.amount,
          concept: order.displayConcept,
          reference: order.reference,
          // `appliedPayment` no expone estos dos campos; viven en el pago
          // crudo de Mercado Pago que viaja en `raw`.
          paidAt: payment.raw?.date_approved ?? new Date().toISOString(),
          paymentMethod: payment.raw?.payment_method_id ?? 'Mercado Pago',
        },
      }),
    ]

    if (order.kind === 'athlete' && ['membership', 'combo'].includes(order.concept)) {
      jobs.push(
        mailer.send('affiliation_started', {
          ...common,
          idempotencyKey: `email:affiliation-started:${payment.externalPaymentId}`,
          params: {
            name: order.athlete?.full_name,
            reference: order.reference,
            accountUrl: `${appUrl}/mi-cuenta`,
          },
        }),
      )
    }

    // Faltaba: por Mercado Pago (el camino principal) el atleta recibía el
    // comprobante pero nunca la confirmación de su inscripción, que sí salía
    // por la aprobación manual. Los dos caminos ahora avisan lo mismo.
    const registration = order.registration
    if (order.kind === 'athlete' && ['registration', 'combo'].includes(order.concept) && registration?.event?.title) {
      jobs.push(
        mailer.send('registration_confirmed', {
          ...common,
          entityType: 'event_registration',
          entityId: registration.id,
          idempotencyKey: `email:registration-confirmed:${registration.id}`,
          params: {
            name: recipientName,
            eventTitle: registration.event.title,
            eventDate: registration.event.starts_at,
            venue: registration.event.venue ?? '',
            division: registration.division,
            category: registration.category,
            eventUrl: `${appUrl}${buildEventPagePath(registration.event.slug)}`,
          },
        }),
      )
    }

    // Compra de entradas: hasta ahora el comprador pagaba y no recibía la
    // entrada por email, solo el comprobante.
    if (order.kind === 'ticket' && order.event?.title) {
      jobs.push(
        mailer.send('ticket_confirmation', {
          ...common,
          idempotencyKey: `email:ticket-confirmation:${payment.externalPaymentId}`,
          params: {
            name: recipientName,
            eventTitle: order.event.title,
            reference: order.reference,
            ticketUrl: `${appUrl}${buildEventPagePath(order.event.slug)}`,
          },
        }),
      )
    }

    return Promise.allSettled(jobs)
  }
}
