import { createEmailDispatcher } from './emailDispatcher.js'
import { buildEventPagePath } from '../../../src/lib/eventPageRoute.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'

export function displayPaymentConcept(concept) {
  if (concept === 'membership') return 'Afiliación PLU'
  if (concept === 'registration') return 'Inscripción a competencia'
  if (concept === 'combo') return 'Afiliación + inscripción'
  if (concept === 'tickets') return 'Entradas'
  return 'Pago PLU ARG'
}

function displayPaymentMethod(method) {
  if (method === 'mercado_pago') return 'Mercado Pago'
  if (method === 'manual_link') return 'Transferencia / aprobación manual'
  return method || 'No informado'
}

/**
 * Contrato único para la confirmación posterior a un pago. El mismo payload
 * alimenta Mercado Pago y la aprobación manual, y permite que comprobante,
 * afiliación, inscripción y entrada convivan en un solo correo.
 */
export function buildPaymentConfirmationParams({
  order,
  payment = {},
  result = {},
  recipientName,
  appUrl = '',
  registrationEvent = null,
  isFirstMembership = false,
}) {
  const membership = result?.membership ?? null
  const registration = order?.registration ?? result?.registration ?? null
  const event = registration?.event ?? registrationEvent ?? order?.event ?? null
  const includesMembership =
    order?.kind === 'athlete' && ['membership', 'combo'].includes(order?.concept)
  const includesRegistration =
    order?.kind === 'athlete' && ['registration', 'combo'].includes(order?.concept)
  const includesTicket = order?.kind === 'ticket'
  const baseUrl = String(appUrl ?? '').replace(/\/$/, '')
  const eventUrl = event?.slug ? `${baseUrl}${buildEventPagePath(event.slug)}` : ''

  return {
    name: recipientName,
    amount: payment.amount ?? order?.amount,
    concept: order?.displayConcept ?? displayPaymentConcept(order?.concept),
    reference: order?.reference,
    paidAt:
      payment.raw?.date_approved ??
      payment.paidAt ??
      order?.approved_at ??
      new Date().toISOString(),
    paymentMethod:
      payment.raw?.payment_method_id ??
      displayPaymentMethod(payment.paymentMethod ?? order?.method),

    // Identificadores no visibles que también relacionan el único envío con
    // cada derecho en la auditoría operativa.
    membershipId: membership?.id ?? '',
    registrationId: registration?.id ?? '',
    includesMembership,
    includesRegistration,
    includesTicket,

    memberCode: membership?.member_code ?? '',
    expirationDate: membership?.expiration_date ?? '',
    membershipPending: includesMembership && !membership?.id,
    isFirstMembership: includesMembership && isFirstMembership,
    accountUrl: includesMembership ? `${baseUrl}/mi-cuenta` : '',

    eventTitle: event?.title ?? '',
    eventDate: event?.starts_at ?? '',
    venue: event?.venue ?? '',
    division: registration?.division ?? '',
    category: registration?.category ?? '',
    eventUrl,

    ticketQuantity: Array.isArray(result?.tickets) ? result.tickets.length : '',
    ticketUrl: includesTicket ? eventUrl : '',
  }
}

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
export function createPaymentNotificationService({
  repository,
  brevo,
  dispatcher,
  env = process.env,
}) {
  const mailer = dispatcher ?? createEmailDispatcher({ repository, brevo, env })
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  return async function notifyPaymentApplied({ order, payment, result }) {
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

    if (payment.status === 'reembolsado' || payment.status === 'cancelado') {
      const jobs = []
      const membership = result?.membership
      if (payment.status === 'reembolsado') {
        jobs.push(
          mailer.send('payment_refunded', {
            ...common,
            idempotencyKey: `email:payment-refunded:${payment.externalPaymentId}`,
            params: {
              name: recipientName,
              amount: payment.amount,
              concept: order.displayConcept,
              reference: order.reference,
              membershipId: membership?.id ?? '',
              memberCode: membership?.member_code ?? '',
              membershipStatus: membership?.status ?? '',
              accountUrl: membership?.id ? `${appUrl}/mi-cuenta` : '',
            },
          }),
        )
      }

      // En un reintegro, la baja de la afiliación forma parte del mismo mail.
      // Una cancelación sin reintegro sigue usando el aviso de afiliación.
      if (
        payment.status === 'cancelado' &&
        order.kind === 'athlete' &&
        membership?.id &&
        ['membership', 'combo'].includes(order.concept)
      ) {
        jobs.push(
          mailer.send('affiliation_cancelled', {
            ...common,
            entityType: 'membership',
            entityId: membership.id,
            idempotencyKey: `email:affiliation-cancelled:${membership.id}:${membership.status}`,
            params: {
              name: order.athlete?.full_name ?? recipientName,
              memberCode: membership.member_code,
              status: membership.status,
              accountUrl: `${appUrl}/mi-cuenta`,
            },
          }),
        )
      }

      return Promise.allSettled(jobs)
    }

    if (payment.status !== 'aprobado') return []

    // Una aprobación es un único hecho para la persona. El comprobante y los
    // derechos que habilitó viajan juntos; antes un combo generaba cuatro
    // correos consecutivos desde el mismo webhook.
    return Promise.allSettled([
      mailer.send('payment_confirmation', {
        ...common,
        idempotencyKey: `email:payment-confirmation:${payment.externalPaymentId}`,
        params: buildPaymentConfirmationParams({
          order,
          payment,
          result,
          recipientName,
          appUrl,
        }),
      }),
    ])
  }
}
