import { EVENT_STATUS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { findGatePendingRegistrations } from '../lib/gateAccess.js'
import { isExpiringSoon } from './membershipService.js'

const PENDING_PAYMENT_STATUSES = ['pendiente_pago', 'pendiente', 'validacion_manual', 'creado']
const EVENT_BREAKDOWN_STATUSES = [
  'inscripcion_abierta',
  'cupos_limitados',
  'agotado',
  'proximamente',
  'finalizado',
  'cerrado',
]
const EVENT_TONE_BY_STATUS_TONE = { success: 'success', warning: 'warning', danger: 'alert', neutral: 'default' }

export function buildPendingActions({
  payments,
  athletes,
  memberships,
  registrations,
  pendingTicketOrders = [],
  events = [],
}) {
  const actions = []

  pendingTicketOrders.forEach((order) => {
    const attendeeLabel = order.attendees?.[0]?.name ?? 'Comprador'
    const hasProof = Boolean(order.paymentProofPath)
    actions.push({
      id: `action-tord-${order.orderId}`,
      type: 'ticket_order',
      priority: hasProof ? 'high' : 'medium',
      subject: attendeeLabel,
      summary: hasProof ? 'Validar transferencia de entrada' : 'Entrada pendiente de pago',
      detail: order.eventTitle ?? order.reference,
      meta: money(order.amount),
      section: 'payments',
      orderId: order.orderId,
      hasProof,
    })
  })

  payments
    .filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status))
    .forEach((payment) => {
      const athlete = athletes.find((item) => item.id === payment.athleteId)
      const hasProof = Boolean(payment.paymentProofPath)
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
        hasProof,
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

  findGatePendingRegistrations(registrations, { memberships, events }).forEach((registration) => {
    const athlete = athletes.find((item) => item.id === registration.athleteId)
    actions.push({
      id: `action-gate-${registration.id}`,
      type: 'registration_gate',
      priority: 'medium',
      subject: athlete?.fullName ?? 'Atleta',
      summary: 'Confirmada sin afiliación vigente',
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

export function getAdminNavBadges({
  payments,
  registrations,
  pendingTicketOrders = [],
  memberships = [],
  events = [],
}) {
  const gatePending = findGatePendingRegistrations(registrations, { memberships, events }).length
  return {
    payments:
      payments.filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status)).length +
      pendingTicketOrders.length,
    registrations:
      registrations.filter((registration) =>
        ['pendiente_pago', 'observada'].includes(registration.status),
      ).length + gatePending,
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
  const observedRegistrations = registrations.filter(
    (registration) => registration.status === 'observada',
  )
  const pendingRegistrations = registrations.filter(
    (registration) => registration.status === 'pendiente_pago',
  )
  const gatePendingRegistrations = findGatePendingRegistrations(registrations, {
    memberships,
    events,
  })
  const activeMemberships = memberships.filter((membership) => membership.status === 'activa')
  const expiringMemberships = activeMemberships.filter((membership) =>
    isExpiringSoon(membership.expirationDate),
  )
  const expiredMemberships = memberships.filter((membership) => membership.status === 'vencida')
  const cancelledMemberships = memberships.filter(
    (membership) => membership.status === 'cancelada',
  )
  const stableActiveMemberships = activeMemberships.length - expiringMemberships.length
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

  const eventBreakdown = countByStatus(events, EVENT_BREAKDOWN_STATUSES).map((item) => ({
    ...item,
    tone: EVENT_TONE_BY_STATUS_TONE[EVENT_STATUS[item.status]?.tone] ?? 'default',
  }))

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const newAthletesThisWeek = athletes.filter(
    (athlete) => athlete.createdAt && new Date(athlete.createdAt) >= oneWeekAgo,
  ).length
  const recentAthletes = [...athletes]
    .filter((athlete) => athlete.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((athlete) => ({
      id: athlete.id,
      fullName: athlete.fullName,
      gym: athlete.gym,
      createdAt: athlete.createdAt,
    }))

  // Afiliaciones recientes, distintas de `recentAthletes`: esa lista son altas
  // de cuenta, y crear la cuenta no afilia a nadie. Lo que el panel necesita
  // ver es quién quedó efectivamente cubierto y desde cuándo.
  const recentMemberships = [...memberships]
    .filter((membership) => membership.startDate)
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
    .slice(0, 5)
    .map((membership) => {
      const athlete = athletes.find((item) => item.id === membership.athleteId)
      return {
        id: membership.id,
        athleteId: membership.athleteId,
        fullName: athlete?.fullName ?? '—',
        memberCode: membership.memberCode,
        status: membership.status,
        startDate: membership.startDate,
        expirationDate: membership.expirationDate,
      }
    })

  const recentRegistrations = [...registrations]
    .filter((registration) => registration.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)
    .map((registration) => {
      const athlete = athletes.find((item) => item.id === registration.athleteId)
      return {
        id: registration.id,
        athleteId: registration.athleteId,
        fullName: athlete?.fullName ?? '—',
        event: registration.event ?? '—',
        category: registration.category,
        division: registration.division,
        status: registration.status,
        createdAt: registration.createdAt,
      }
    })

  const eventLeaderboard = [...events]
    .filter((event) => event.status !== 'finalizado' && event.slots > 0)
    .map((event) => ({
      id: event.id ?? event.slug,
      title: event.title,
      registered: event.registered ?? 0,
      slots: event.slots,
      fillPercent: Math.min(Math.round(((event.registered ?? 0) / event.slots) * 100), 100),
      status: event.status,
    }))
    .sort((a, b) => b.fillPercent - a.fillPercent)
    .slice(0, 5)

  const gymCounts = new Map()
  athletes.forEach((athlete) => {
    const gym = athlete.gym?.trim()
    if (!gym) return
    gymCounts.set(gym, (gymCounts.get(gym) ?? 0) + 1)
  })
  const topGyms = [...gymCounts.entries()]
    .map(([gym, count]) => ({ gym, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    primary: [
      {
        labelKey: 'athletes',
        value: athletes.length,
        icon: 'users',
        section: 'athletes',
        tone: 'celeste',
        hintKey: 'newThisWeek',
        hintValue: newAthletesThisWeek,
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
        hintKey: gatePendingRegistrations.length > 0 ? 'gatePending' : 'observed',
        hintValue:
          gatePendingRegistrations.length > 0
            ? gatePendingRegistrations.length
            : observedRegistrations.length,
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
        gatePending: gatePendingRegistrations.length,
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
      events: {
        total: events.length,
        section: 'events',
        items: eventBreakdown,
        open: openEvents.length,
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
    recentAthletes: {
      items: recentAthletes,
      newThisWeek: newAthletesThisWeek,
    },
    recentMemberships: {
      items: recentMemberships,
    },
    recentRegistrations: {
      items: recentRegistrations,
    },
    eventLeaderboard: {
      items: eventLeaderboard,
    },
    topGyms: {
      items: topGyms,
    },
  }
}
