import { CONFIRMED_REGISTRATION_STATUSES } from '../lib/constants.js'
import { money } from '../lib/format.js'
import { isExpiringSoon } from './membershipService.js'

function isConfirmedRegistration(registration) {
  return CONFIRMED_REGISTRATION_STATUSES.includes(registration?.status)
}

const PENDING_PAYMENT_STATUSES = ['pendiente_pago', 'pendiente', 'validacion_manual', 'creado']

const ACTION_LABELS = {
  'athlete.registered': 'Atleta registrado',
  'membership.created': 'Afiliación creada',
  'registration.created': 'Inscripción creada',
  'payment.approved': 'Pago aprobado',
  'event.created': 'Evento creado',
  'event.updated': 'Evento actualizado',
}

export function buildPendingActions({ payments, athletes, memberships, registrations, pendingTicketOrders = [] }) {
  const actions = []

  pendingTicketOrders.forEach((order) => {
    const attendeeLabel = order.attendees?.[0]?.name ?? 'Comprador'
    actions.push({
      id: `action-tord-${order.orderId}`,
      type: 'ticket_order',
      priority: order.paymentProofPath ? 'high' : 'medium',
      subject: attendeeLabel,
      summary: order.paymentProofPath ? 'Validar transferencia de entrada' : 'Entrada pendiente de pago',
      detail: order.eventTitle ?? order.reference,
      meta: money(order.amount),
      section: 'payments',
      orderId: order.orderId,
    })
  })

  payments
    .filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status))
    .forEach((payment) => {
      const athlete = athletes.find((item) => item.id === payment.athleteId)
      actions.push({
        id: `action-pay-${payment.id}`,
        type: 'payment',
        priority: payment.status === 'validacion_manual' ? 'high' : 'medium',
        subject: athlete?.fullName ?? 'Atleta',
        summary:
          payment.status === 'validacion_manual' ? 'Validar pago manual' : 'Pago pendiente de acreditación',
        detail: payment.concept,
        meta: money(payment.amount),
        section: 'payments',
        paymentId: payment.id,
      })
    })

  registrations
    .filter((registration) => ['pendiente_pago', 'observada'].includes(registration.status))
    .forEach((registration) => {
      const athlete = athletes.find((item) => item.id === registration.athleteId)
      actions.push({
        id: `action-reg-${registration.id}`,
        type: 'registration',
        priority: registration.status === 'observada' ? 'high' : 'medium',
        subject: athlete?.fullName ?? 'Atleta',
        summary:
          registration.status === 'observada' ? 'Inscripción observada' : 'Inscripción pendiente de pago',
        detail: registration.event,
        meta: registration.category,
        section: 'registrations',
      })
    })

  memberships
    .filter((membership) => membership.status === 'activa' && isExpiringSoon(membership.expirationDate))
    .forEach((membership) => {
      const athlete = athletes.find((item) => item.id === membership.athleteId)
      actions.push({
        id: `action-mem-${membership.id}`,
        type: 'membership',
        priority: 'low',
        subject: athlete?.fullName ?? 'Atleta',
        summary: 'Afiliación por vencer',
        detail: membership.memberCode ? `Código ${membership.memberCode}` : 'Renovación anual',
        meta: `Vence ${membership.expirationDate}`,
        section: 'memberships',
      })
    })

  const priorityOrder = { high: 0, medium: 1, low: 2 }
  return actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
}

export function getAthleteAuditLogs(athleteId, auditLogs, memberships, registrations, payments) {
  const relatedIds = new Set([athleteId])
  memberships.filter((item) => item.athleteId === athleteId).forEach((item) => relatedIds.add(item.id))
  registrations.filter((item) => item.athleteId === athleteId).forEach((item) => relatedIds.add(item.id))
  payments.filter((item) => item.athleteId === athleteId).forEach((item) => relatedIds.add(item.id))

  return auditLogs
    .filter((log) => log.actor === athleteId || relatedIds.has(log.entityId))
    .map((log) => ({
      ...log,
      action: ACTION_LABELS[log.action] ?? log.action,
      createdAtLabel: new Date(log.createdAt).toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    }))
}

export function buildRecentActivity(
  { auditLogs, athletes, memberships, registrations, payments, events = [] },
  limit = 6,
) {
  function athleteName(athleteId) {
    return athletes.find((item) => item.id === athleteId)?.fullName ?? 'Atleta'
  }

  function resolveDetail(log) {
    if (log.entityType === 'athlete') return athleteName(log.entityId)

    if (log.entityType === 'membership') {
      const membership = memberships.find((item) => item.id === log.entityId)
      return membership ? `${athleteName(membership.athleteId)} · ${membership.memberCode}` : null
    }

    if (log.entityType === 'registration') {
      const registration = registrations.find((item) => item.id === log.entityId)
      return registration ? `${athleteName(registration.athleteId)} · ${registration.event}` : null
    }

    if (log.entityType === 'payment') {
      const payment = payments.find((item) => item.id === log.entityId)
      return payment ? `${athleteName(payment.athleteId)} · ${money(payment.amount)}` : null
    }

    if (log.entityType === 'event') {
      const event = events.find((item) => item.id === log.entityId)
      return event ? `${event.title} · ${event.date}` : null
    }

    return null
  }

  return [...auditLogs]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((log) => ({
      id: log.id,
      action: ACTION_LABELS[log.action] ?? log.action,
      detail: resolveDetail(log),
      actor: log.actor === 'admin' ? 'Panel admin' : log.actor === 'public' ? 'Autogestión' : null,
      createdAt: log.createdAt,
      createdAtLabel: new Date(log.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
    }))
}

export function getAdminNavBadges({ payments, registrations, pendingTicketOrders = [] }) {
  return {
    payments:
      payments.filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status)).length +
      pendingTicketOrders.length,
    registrations: registrations.filter((registration) =>
      ['pendiente_pago', 'observada'].includes(registration.status),
    ).length,
  }
}

function countByStatus(items, statuses) {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0]))
  items.forEach((item) => {
    if (Object.hasOwn(counts, item.status)) counts[item.status] += 1
  })
  return statuses.map((status) => ({ status, value: counts[status] }))
}

export function buildDashboardOverview({
  athletes,
  memberships,
  registrations,
  payments,
  events = [],
}) {
  const pendingPayments = payments.filter((payment) =>
    PENDING_PAYMENT_STATUSES.includes(payment.status),
  )
  const approvedPayments = payments.filter((payment) => payment.status === 'aprobado')
  const confirmedRegistrations = registrations.filter(isConfirmedRegistration)
  const observedRegistrations = registrations.filter(
    (registration) => registration.status === 'observada',
  )
  const pendingRegistrations = registrations.filter(
    (registration) => registration.status === 'pendiente_pago',
  )
  const activeMemberships = memberships.filter((membership) => membership.status === 'activa')
  const expiringMemberships = activeMemberships.filter((membership) =>
    isExpiringSoon(membership.expirationDate),
  )
  const expiredMemberships = memberships.filter((membership) => membership.status === 'vencida')
  const cancelledMemberships = memberships.filter(
    (membership) => membership.status === 'cancelada',
  )
  const stableActiveMemberships = activeMemberships.length - expiringMemberships.length
  const activeEvents = events.filter((event) => event.status !== 'finalizado')
  const openEvents = events.filter((event) =>
    ['inscripcion_abierta', 'cupos_limitados'].includes(event.status),
  )
  const manualValidationPayments = payments.filter(
    (payment) => payment.status === 'validacion_manual',
  )
  const softPendingPayments = pendingPayments.filter(
    (payment) => payment.status !== 'validacion_manual',
  )

  const pendingAmount = pendingPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const collectedAmount = approvedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const totalAmount = pendingAmount + collectedAmount
  const spotlightEvent =
    [...events]
      .filter((event) => event.featured && event.status !== 'finalizado')
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))[0] ?? null

  // `acreditada` se pliega a `confirmada` (alias legacy; el backend no lo escribe).
  const registrationBreakdown = countByStatus(
    registrations.map((registration) =>
      registration.status === 'acreditada'
        ? { ...registration, status: 'confirmada' }
        : registration,
    ),
    ['confirmada', 'pendiente_pago', 'observada'],
  )
  const softPendingAmount = softPendingPayments.reduce(
    (sum, payment) => sum + (payment.amount ?? 0),
    0,
  )
  const manualAmount = manualValidationPayments.reduce(
    (sum, payment) => sum + (payment.amount ?? 0),
    0,
  )
  const categorizedPaymentCount =
    approvedPayments.length + softPendingPayments.length + manualValidationPayments.length
  const otherPayments = payments.length - categorizedPaymentCount
  const paymentBreakdown = [
    { status: 'aprobado', value: approvedPayments.length, amount: collectedAmount, tone: 'success' },
    {
      status: 'pendiente',
      value: softPendingPayments.length,
      amount: softPendingAmount,
      tone: 'warning',
    },
    {
      status: 'validacion_manual',
      value: manualValidationPayments.length,
      amount: manualAmount,
      tone: 'alert',
    },
  ]
  if (otherPayments > 0) {
    paymentBreakdown.push({
      status: 'otros',
      value: otherPayments,
      amount: 0,
      tone: 'default',
    })
  }

  const membershipBreakdown = [
    { status: 'activa', value: Math.max(stableActiveMemberships, 0), tone: 'success' },
    { status: 'expiringSoon', value: expiringMemberships.length, tone: 'gold' },
    { status: 'vencida', value: expiredMemberships.length, tone: 'alert' },
    { status: 'cancelada', value: cancelledMemberships.length, tone: 'default' },
  ]

  return {
    primary: [
      {
        labelKey: 'athletes',
        value: athletes.length,
        icon: 'users',
        section: 'athletes',
        tone: 'celeste',
      },
      {
        labelKey: 'activeMemberships',
        value: activeMemberships.length,
        icon: 'badge',
        section: 'memberships',
        tone: 'gold',
        hintKey: 'expiringSoon',
        hintValue: expiringMemberships.length,
      },
      {
        labelKey: 'registrations',
        value: registrations.length,
        icon: 'clipboard',
        section: 'registrations',
        tone: 'default',
        hintKey: 'observed',
        hintValue: observedRegistrations.length,
      },
      {
        labelKey: 'pendingPayments',
        value: pendingPayments.length,
        icon: 'shield',
        section: 'payments',
        tone: 'alert',
        hintKey: 'pendingAmount',
        hintValue: pendingAmount,
        hintFormat: 'money',
      },
    ],
    secondary: [
      {
        labelKey: 'confirmed',
        value: confirmedRegistrations.length,
        tone: 'success',
        section: 'registrations',
        icon: 'clipboard',
      },
      {
        labelKey: 'observed',
        value: observedRegistrations.length,
        tone: 'warning',
        section: 'registrations',
        icon: 'shield',
      },
      {
        labelKey: 'activeEvents',
        value: activeEvents.length,
        tone: 'celeste',
        section: 'events',
        icon: 'badge',
      },
      {
        labelKey: 'expiringSoon',
        value: expiringMemberships.length,
        tone: 'gold',
        section: 'memberships',
        icon: 'badge',
      },
    ],
    breakdowns: {
      registrations: {
        total: registrations.length,
        section: 'registrations',
        items: registrationBreakdown.map((item) => ({
          ...item,
          tone:
            item.status === 'observada'
              ? 'alert'
              : item.status === 'pendiente_pago'
                ? 'warning'
                : 'success',
        })),
        pending: pendingRegistrations.length,
        observed: observedRegistrations.length,
      },
      memberships: {
        total: memberships.length,
        section: 'memberships',
        items: membershipBreakdown,
        expiring: expiringMemberships.length,
      },
      payments: {
        total: payments.length,
        section: 'payments',
        items: paymentBreakdown,
        pending: pendingPayments.length,
        pendingAmount,
      },
    },
    finance: {
      pendingCount: pendingPayments.length,
      pendingAmount,
      collectedAmount,
      totalAmount,
      collectionRate: totalAmount > 0 ? Math.round((collectedAmount / totalAmount) * 100) : 0,
      openEvents: openEvents.length,
      pendingItems: pendingPayments.slice(0, 5).map((payment) => {
        const athlete = athletes.find((item) => item.id === payment.athleteId)
        return {
          id: payment.id,
          athlete: athlete?.fullName ?? 'Atleta',
          amount: payment.amount,
          concept: payment.concept,
          status: payment.status,
        }
      }),
    },
    spotlightEvent,
  }
}
