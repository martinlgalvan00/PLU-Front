/**
 * Triage de pagos scoped a un evento — PLU ARG
 *
 * Une el snapshot admin (órdenes de atleta + tickets pendientes) sin pedir
 * endpoints nuevos. Buckets operativos:
 * - pending: espera decisión (pendiente / validacion_manual / ticket manual)
 * - problem: rechazado, cancelado, o financiamiento vencido
 * - ok: aprobado
 */

import { OPEN_ORDER_STATUSES } from './paymentValidationService.js'

const PROBLEM_STATUSES = new Set(['rechazado', 'cancelado'])

function emptyTriage() {
  return {
    counts: { ok: 0, pending: 0, problem: 0, total: 0 },
    rows: [],
  }
}

function isFinancedOverdue(payment, now = new Date()) {
  if (!payment?.financedEntitlementsAt || payment.financedEntitlementsRevokedAt) return false
  if (payment.status === 'aprobado') return false
  const due = payment.financedPaymentDueAt ? new Date(payment.financedPaymentDueAt) : null
  return Boolean(due && !Number.isNaN(due.getTime()) && due < now)
}

export function classifyEventPaymentBucket(payment, now = new Date()) {
  if (!payment) return null
  if (OPEN_ORDER_STATUSES.includes(payment.status)) return 'pending'
  if (PROBLEM_STATUSES.has(payment.status) || isFinancedOverdue(payment, now)) return 'problem'
  if (payment.status === 'aprobado') return 'ok'
  return null
}

/**
 * @param {{
 *   event?: { slug?: string, title?: string } | null,
 *   payments?: object[],
 *   athletes?: object[],
 *   pendingTicketOrders?: object[],
 *   now?: Date,
 * }} input
 */
export function buildEventPaymentTriage({
  event,
  payments = [],
  athletes = [],
  pendingTicketOrders = [],
  now = new Date(),
} = {}) {
  const slug = String(event?.slug ?? '').trim()
  if (!slug) return emptyTriage()

  const athleteById = new Map(
    (athletes ?? []).filter((athlete) => athlete?.id).map((athlete) => [athlete.id, athlete]),
  )

  const rows = []

  for (const payment of payments) {
    if (payment?.eventSlug !== slug) continue
    const bucket = classifyEventPaymentBucket(payment, now)
    if (!bucket) continue
    const athlete = athleteById.get(payment.athleteId) ?? null
    rows.push({
      id: `pay-${payment.id}`,
      kind: 'athlete',
      bucket,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency ?? 'ARS',
      reference: payment.reference ?? null,
      subject: athlete?.fullName ?? athlete?.full_name ?? '—',
      detail: payment.concept ?? payment.conceptType ?? null,
      payment,
      athlete,
      ticket: null,
      hasProof: Boolean(payment.paymentProofPath),
      createdAt: payment.createdAt ?? null,
    })
  }

  for (const ticket of pendingTicketOrders) {
    if (ticket?.eventSlug !== slug) continue
    const attendeeLabel =
      ticket.attendees?.map((item) => item.name).filter(Boolean).join(' · ') ||
      ticket.attendees?.[0]?.name ||
      '—'
    rows.push({
      id: `tkt-${ticket.orderId}`,
      kind: 'ticket',
      bucket: 'pending',
      status: ticket.status ?? 'validacion_manual',
      amount: ticket.amount,
      currency: ticket.currency ?? 'ARS',
      reference: ticket.reference ?? null,
      subject: attendeeLabel,
      detail: ticket.eventTitle ?? event?.title ?? null,
      payment: null,
      athlete: null,
      ticket,
      hasProof: Boolean(ticket.paymentProofPath),
      createdAt: ticket.createdAt ?? null,
    })
  }

  const bucketRank = { pending: 0, problem: 1, ok: 2 }
  rows.sort((left, right) => {
    const rank = (bucketRank[left.bucket] ?? 9) - (bucketRank[right.bucket] ?? 9)
    if (rank !== 0) return rank
    return String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))
  })

  const counts = { ok: 0, pending: 0, problem: 0, total: rows.length }
  for (const row of rows) {
    counts[row.bucket] = (counts[row.bucket] ?? 0) + 1
  }

  return { counts, rows }
}

/** Resumen corto para la fila Pagos de la consola. */
export function formatEventPaymentTriageSummary(counts, t) {
  if (!counts || counts.total === 0) return t('admin.eventConsole.paymentsClear')
  const parts = []
  if (counts.pending > 0) {
    parts.push(t('admin.eventConsole.paymentsPending', { count: counts.pending }))
  }
  if (counts.problem > 0) {
    parts.push(t('admin.eventConsole.paymentsProblem', { count: counts.problem }))
  }
  if (parts.length === 0 && counts.ok > 0) {
    return t('admin.eventConsole.paymentsOk', { count: counts.ok })
  }
  if (parts.length === 0) return t('admin.eventConsole.paymentsClear')
  return parts.join(' · ')
}
