import { money } from '../lib/format.js'
import { isExpiringSoon } from './membershipService.js'

const PENDING_PAYMENT_STATUSES = ['pendiente_pago', 'pendiente', 'validacion_manual', 'creado']

const ACTION_LABELS = {
  'athlete.registered': 'Atleta registrado',
  'membership.created': 'Afiliación creada',
  'registration.created': 'Inscripción creada',
  'payment.approved': 'Pago aprobado',
}

export function buildPendingActions({ payments, athletes, memberships, registrations }) {
  const actions = []

  payments
    .filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status))
    .forEach((payment) => {
      const athlete = athletes.find((item) => item.id === payment.athleteId)
      actions.push({
        id: `action-pay-${payment.id}`,
        type: 'payment',
        priority: payment.status === 'validacion_manual' ? 'high' : 'medium',
        title: `Validar pago de ${athlete?.fullName ?? 'atleta'}`,
        detail: `${payment.concept} · ${money(payment.amount)}`,
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
        title:
          registration.status === 'observada'
            ? `Revisar inscripción observada: ${athlete?.fullName ?? 'atleta'}`
            : `Inscripción pendiente: ${athlete?.fullName ?? 'atleta'}`,
        detail: `${registration.event} · ${registration.category}`,
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
        title: `Afiliación por vencer: ${athlete?.fullName ?? 'atleta'}`,
        detail: `Vence el ${membership.expirationDate}`,
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

export function getAdminNavBadges({ payments, registrations }) {
  return {
    payments: payments.filter((payment) => PENDING_PAYMENT_STATUSES.includes(payment.status)).length,
    registrations: registrations.filter((registration) =>
      ['pendiente_pago', 'observada'].includes(registration.status),
    ).length,
  }
}
