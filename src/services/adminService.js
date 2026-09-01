import { EVENT_STATUS } from '../lib/events.js'
import { money } from '../lib/format.js'
import { findGatePendingRegistrations } from '../lib/gateAccess.js'
import { getEventConsistencyWarnings } from './eventAdminService.js'
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
const EVENT_TONE_BY_STATUS_TONE = {
  success: 'success',
  warning: 'warning',
  danger: 'alert',
  neutral: 'default',
}

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
    const paymentProofPath = order.paymentProofPath?.trim() || null
    const hasProof = Boolean(paymentProofPath)
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
      provider: order.provider,
      hasProof,
      paymentProofPath,
      paymentProofUploadedAt: order.paymentProofUploadedAt ?? null,
    })
  })

  payments
    .filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status))
    .forEach((payment) => {
      const athlete = athletes.find((item) => item.id === payment.athleteId)
      const paymentProofPath = payment.paymentProofPath?.trim() || null
      const hasProof = Boolean(paymentProofPath)
      const cashAtPitbull = payment.manualPaymentChannel === 'cash_pitbull'
      const requiresProofOverride =
        payment.method === 'manual_link' && !cashAtPitbull && !hasProof
      actions.push({
        id: `action-pay-${payment.id}`,
        type: 'payment',
        priority: payment.status === 'validacion_manual' ? 'high' : 'medium',
        subject: athlete?.fullName ?? 'Atleta',
        summary:
          payment.status === 'validacion_manual'
            ? 'Validar pago manual'
            : 'Pago pendiente de acreditación',
        detail: payment.concept,
        meta: money(payment.amount),
        section: 'payments',
        paymentId: payment.id,
        method: payment.method,
        cashAtPitbull,
        requiresProofOverride,
        documentId: athlete?.documentId ?? null,
        hasProof,
        paymentProofPath,
        paymentProofUploadedAt: payment.paymentProofUploadedAt ?? null,
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
          registration.status === 'observada'
            ? 'Inscripción observada'
            : 'Inscripción pendiente de pago',
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
    .filter(
      (membership) => membership.status === 'activa' && isExpiringSoon(membership.expirationDate),
    )
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

const REMINDER_SEVERITY_ORDER = { urgent: 0, warning: 1, info: 2 }
const OPEN_EVENT_STATUSES = ['inscripcion_abierta', 'cupos_limitados']
const CLOSING_SOON_DAYS = 7
const NEARLY_FULL_RATIO = 0.9

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Días calendario (no fracciones) entre hoy y la fecha objetivo. */
function calendarDaysLeft(target, now) {
  return Math.round((startOfDay(target) - startOfDay(now)) / 24 / 60 / 60 / 1000)
}

/**
 * Mesa de prioridades del dashboard: una sola lectura de qué necesita
 * decisión humana hoy. Cada ítem es un "tema" con severidad y sección
 * destino — el caso individual sigue viviendo en la cola de trabajo.
 * Todos los conteos salen del mismo snapshot que las tablas: ninguna
 * llamada nueva al backend.
 */
export function buildDashboardReminders({
  payments,
  registrations,
  memberships,
  events = [],
  pendingTicketOrders = [],
  now = new Date(),
}) {
  const items = []

  const manualValidationCount = payments.filter(
    (payment) => payment.status === 'validacion_manual',
  ).length
  if (manualValidationCount > 0) {
    items.push({
      id: 'manual_payments',
      kind: 'manual_payments',
      severity: 'urgent',
      count: manualValidationCount,
      section: 'payments',
    })
  }

  const inconsistentEvents = events.filter(
    (event) => getEventConsistencyWarnings(event, event, now).length > 0,
  )
  if (inconsistentEvents.length > 0) {
    items.push({
      id: 'event_consistency',
      kind: 'event_consistency',
      severity: 'urgent',
      count: inconsistentEvents.length,
      section: 'events',
      eventTitles: inconsistentEvents.map((event) => event.title).slice(0, 3),
    })
  }

  const observedCount = registrations.filter(
    (registration) => registration.status === 'observada',
  ).length
  if (observedCount > 0) {
    items.push({
      id: 'observed_registrations',
      kind: 'observed_registrations',
      severity: 'urgent',
      count: observedCount,
      section: 'registrations',
    })
  }

  if (pendingTicketOrders.length > 0) {
    items.push({
      id: 'ticket_orders',
      kind: 'ticket_orders',
      severity: 'warning',
      count: pendingTicketOrders.length,
      section: 'payments',
    })
  }

  const gateCount = findGatePendingRegistrations(registrations, { memberships, events }).length
  if (gateCount > 0) {
    items.push({
      id: 'gate_registrations',
      kind: 'gate_registrations',
      severity: 'warning',
      count: gateCount,
      section: 'registrations',
    })
  }

  const expiring = memberships.filter(
    (membership) => membership.status === 'activa' && isExpiringSoon(membership.expirationDate),
  )
  if (expiring.length > 0) {
    items.push({
      id: 'expiring_memberships',
      kind: 'expiring_memberships',
      severity: 'warning',
      count: expiring.length,
      section: 'memberships',
      earliestDate:
        expiring
          .map((membership) => membership.expirationDate)
          .filter(Boolean)
          .sort()[0] ?? null,
    })
  }

  events
    .filter((event) => {
      if (!OPEN_EVENT_STATUSES.includes(event.status) || !event.registrationClosesAt) return false
      const closesAt = new Date(event.registrationClosesAt)
      if (Number.isNaN(closesAt.getTime())) return false
      const daysLeft = calendarDaysLeft(closesAt, now)
      return daysLeft >= 0 && daysLeft <= CLOSING_SOON_DAYS
    })
    .map((event) => {
      const closesAt = new Date(event.registrationClosesAt)
      return {
        id: event.id ?? event.slug,
        title: event.title,
        closesAt: event.registrationClosesAt,
        daysLeft: calendarDaysLeft(closesAt, now),
      }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .forEach((event) => {
      items.push({
        id: `closing_event_${event.id}`,
        kind: 'closing_event',
        severity: 'warning',
        count: event.daysLeft,
        section: 'events',
        event,
      })
    })

  events
    .filter((event) => {
      if (!OPEN_EVENT_STATUSES.includes(event.status) || !event.slots) return false
      const registered = event.registered ?? 0
      return registered < event.slots && registered / event.slots >= NEARLY_FULL_RATIO
    })
    .forEach((event) => {
      const registered = event.registered ?? 0
      items.push({
        id: `nearly_full_${event.id ?? event.slug}`,
        kind: 'nearly_full_event',
        severity: 'info',
        count: Math.min(Math.round((registered / event.slots) * 100), 100),
        section: 'events',
        event: { title: event.title },
      })
    })

  items.sort((a, b) => REMINDER_SEVERITY_ORDER[a.severity] - REMINDER_SEVERITY_ORDER[b.severity])

  return {
    items,
    openCount: items.length,
    urgentCount: items.filter((item) => item.severity === 'urgent').length,
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
  pendingTicketOrders = [],
  now = new Date(),
  // Agregados contados en la base (`adminDataSummary`): el snapshot operativo
  // viene acotado por ventana, así que los totales del dashboard salen de acá
  // cuando existen. Sin ellos (demo, backend viejo) se derivan del array como
  // siempre — mismo número mientras la ventana alcance.
  serverSummary = null,
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
  const cancelledMemberships = memberships.filter((membership) => membership.status === 'cancelada')
  const confirmedRegistrations = registrations.filter((registration) =>
    ['confirmada', 'acreditada'].includes(registration.status),
  )
  const openEvents = events.filter((event) =>
    ['inscripcion_abierta', 'cupos_limitados'].includes(event.status),
  )
  const manualValidationPayments = payments.filter(
    (payment) => payment.status === 'validacion_manual',
  )
  const softPendingPayments = pendingPayments.filter(
    (payment) => payment.status !== 'validacion_manual',
  )

  // Números autoritativos: primero el conteo de la base, después el array.
  // `pick` no inventa: si el servidor no mandó el número, gana el derivado.
  const pick = (serverValue, derivedValue) =>
    Number.isFinite(serverValue) ? serverValue : derivedValue
  const summaryPayments = serverSummary?.payments ?? null
  const summaryMemberships = serverSummary?.memberships ?? null
  const summaryRegistrations = serverSummary?.registrations ?? null
  const totalAthletes = pick(
    Number.isFinite(serverSummary?.athletes) ? serverSummary?.athletes : undefined,
    athletes.length,
  )
  const totalActiveMemberships = pick(summaryMemberships?.active, activeMemberships.length)
  const totalExpiringMemberships = pick(
    summaryMemberships?.expiringSoon,
    expiringMemberships.length,
  )
  const totalRegistrations = pick(summaryRegistrations?.total, registrations.length)
  const totalPendingPayments = pick(summaryPayments?.pending, pendingPayments.length)
  // `openAmount` de la base puede venir truncado por muestra
  // (`openAmountTruncated`): aún así es una muestra más amplia que la ventana
  // del array, y la pantalla ya sabe marcar ese importe como parcial.
  const totalPendingAmount = Number.isFinite(summaryPayments?.openAmount)
    ? summaryPayments.openAmount
    : pendingPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const totalManualValidation = pick(
    summaryPayments?.validacion_manual,
    manualValidationPayments.length,
  )

  const pendingAmount = totalPendingAmount
  const collectedAmount = approvedPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
  const totalAmount = pendingAmount + collectedAmount
  const spotlightEvent =
    [...events]
      .filter((event) => event.featured && event.status !== 'finalizado')
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO))[0] ?? null

  // `acreditada` se pliega a `confirmada` (alias legacy; el backend no lo
  // escribe). Los conteos de la base ganan cuando existen; los importes
  // siguen saliendo del array — sumarlos en la base sería una RPC nueva para
  // un desglose que ya se lee completo en Finanzas.
  const legacyFold = (status) => (status === 'acreditada' ? 'confirmada' : status)
  const registrationsByStatus = (status) =>
    registrations.filter((registration) => legacyFold(registration.status) === status).length
  const registrationBreakdown = [
    {
      status: 'confirmada',
      value: pick(summaryRegistrations?.confirmed, registrationsByStatus('confirmada')),
    },
    {
      status: 'pendiente_pago',
      value: pick(
        summaryRegistrations?.pendingPayment,
        registrationsByStatus('pendiente_pago'),
      ),
    },
    {
      status: 'observada',
      value: pick(summaryRegistrations?.observed, registrationsByStatus('observada')),
    },
  ]
  const softPendingAmount = softPendingPayments.reduce(
    (sum, payment) => sum + (payment.amount ?? 0),
    0,
  )
  const manualAmount = manualValidationPayments.reduce(
    (sum, payment) => sum + (payment.amount ?? 0),
    0,
  )
  // "Pendientes blandos" = abiertas sin declaración: lo que espera al
  // webhook, no a una persona. Con conteos de la base sale por diferencia.
  const totalSoftPending = Number.isFinite(summaryPayments?.pending)
    ? Math.max(summaryPayments.pending - totalManualValidation, 0)
    : softPendingPayments.length
  const totalApprovedPayments = pick(summaryPayments?.aprobado, approvedPayments.length)
  const totalPaymentsCount = pick(summaryPayments?.all, payments.length)
  const otherPayments = Math.max(
    totalPaymentsCount - (totalApprovedPayments + totalSoftPending + totalManualValidation),
    0,
  )
  const paymentBreakdown = [
    {
      status: 'aprobado',
      value: totalApprovedPayments,
      amount: collectedAmount,
      tone: 'success',
    },
    {
      status: 'pendiente',
      value: totalSoftPending,
      amount: softPendingAmount,
      tone: 'warning',
    },
    {
      status: 'validacion_manual',
      value: totalManualValidation,
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
    {
      status: 'activa',
      value: Math.max(totalActiveMemberships - totalExpiringMemberships, 0),
      tone: 'success',
    },
    { status: 'expiringSoon', value: totalExpiringMemberships, tone: 'gold' },
    {
      status: 'vencida',
      value: pick(summaryMemberships?.expired, expiredMemberships.length),
      tone: 'alert',
    },
    {
      status: 'cancelada',
      value: pick(summaryMemberships?.cancelled, cancelledMemberships.length),
      tone: 'default',
    },
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
      photoUrl: athlete.photoUrl ?? null,
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
        photoUrl: athlete?.photoUrl ?? null,
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
        photoUrl: athlete?.photoUrl ?? null,
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
  const gymVariants = new Map()

  athletes.forEach((athlete) => {
    const gym = athlete.gym?.trim()
    if (!gym) return

    const normalized = gym.toLowerCase()
    gymCounts.set(normalized, (gymCounts.get(normalized) ?? 0) + 1)

    if (!gymVariants.has(normalized)) gymVariants.set(normalized, new Map())
    const variants = gymVariants.get(normalized)
    variants.set(gym, (variants.get(gym) ?? 0) + 1)
  })

  const topGyms = [...gymCounts.entries()]
    .map(([normalized, count]) => {
      const variants = gymVariants.get(normalized)
      const bestVariant = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0]
      return { gym: bestVariant, count }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    reminders: buildDashboardReminders({
      payments,
      registrations,
      memberships,
      events,
      pendingTicketOrders,
      now,
    }),
    primary: [
      {
        labelKey: 'athletes',
        value: totalAthletes,
        icon: 'users',
        section: 'athletes',
        tone: 'celeste',
        hintKey: 'newThisWeek',
        hintValue: newAthletesThisWeek,
      },
      {
        labelKey: 'activeMemberships',
        value: totalActiveMemberships,
        icon: 'badge',
        section: 'memberships',
        tone: 'gold',
        hintKey: 'expiringSoon',
        hintValue: totalExpiringMemberships,
      },
      {
        labelKey: 'registrations',
        value: totalRegistrations,
        icon: 'clipboard',
        section: 'registrations',
        tone: 'default',
        hintKey: gatePendingRegistrations.length > 0 ? 'gatePending' : 'observed',
        hintValue:
          gatePendingRegistrations.length > 0
            ? gatePendingRegistrations.length
            : pick(summaryRegistrations?.observed, observedRegistrations.length),
      },
      {
        labelKey: 'pendingPayments',
        value: totalPendingPayments,
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
        total: totalRegistrations,
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
        pending: pick(summaryRegistrations?.pendingPayment, pendingRegistrations.length),
        observed: pick(summaryRegistrations?.observed, observedRegistrations.length),
        gatePending: gatePendingRegistrations.length,
      },
      memberships: {
        total: pick(summaryMemberships?.total, memberships.length),
        section: 'memberships',
        items: membershipBreakdown,
        expiring: totalExpiringMemberships,
      },
      payments: {
        total: totalPaymentsCount,
        section: 'payments',
        items: paymentBreakdown,
        pending: totalPendingPayments,
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
      pendingCount: totalPendingPayments,
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
    // Esta proyección no toma decisiones de negocio: concentra los estados
    // que el operador necesita leer juntos para elegir el circuito a abrir.
    // Los conteos de la base ganan sobre el array cuando existen; el snapshot
    // acotado no puede alimentarlos, o dejan de ser totales pasado el recorte.
    operationalFlows: {
      payments: {
        manualValidation: totalManualValidation,
        reconciliationPending: totalSoftPending,
      },
      registrations: {
        confirmed: pick(summaryRegistrations?.confirmed, confirmedRegistrations.length),
        pendingPayment: pick(summaryRegistrations?.pendingPayment, pendingRegistrations.length),
        observed: pick(summaryRegistrations?.observed, observedRegistrations.length),
        gatePending: gatePendingRegistrations.length,
      },
      memberships: {
        active: totalActiveMemberships,
        expiring: totalExpiringMemberships,
      },
      events: {
        open: events.filter((event) => event.status === 'inscripcion_abierta').length,
        limited: events.filter((event) => event.status === 'cupos_limitados').length,
      },
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
