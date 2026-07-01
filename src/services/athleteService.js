import { DEFAULT_FORM, PRICING, PROCEDURE_TYPES } from '../lib/constants.js'
import { generateId, todayISO } from '../lib/format.js'
import { validateAthleteForm } from '../lib/validation.js'
import { getPaymentStatusForMethod, createPaymentReference } from './paymentService.js'
import { notifyAffiliationStarted, notifyPaymentApproved, notifyRegistrationConfirmed } from './emailService.js'

const initialAthletes = [
  {
    id: 'ath-001',
    fullName: 'Martina Rivas',
    documentId: '40111222',
    birthDate: '1997-04-18',
    email: 'martina.rivas@example.com',
    phone: '+54 9 11 3000-1188',
    country: 'Argentina',
    province: 'Buenos Aires',
    city: 'La Plata',
    gym: 'Maximal Power',
    sex: 'Femenino',
    division: 'Open',
    category: 'Raw',
    estimatedWeight: '67.5',
    procedureType: 'both',
    status: 'afiliado_activo',
  },
  {
    id: 'ath-002',
    fullName: 'Nicolás Aguirre',
    documentId: '36888999',
    birthDate: '1992-10-03',
    email: 'nicolas.aguirre@example.com',
    phone: '+54 9 351 420-9921',
    country: 'Argentina',
    province: 'Córdoba',
    city: 'Córdoba',
    gym: 'Pitbull Barbell',
    sex: 'Masculino',
    division: 'Junior',
    category: 'Classic Raw',
    estimatedWeight: '82.5',
    procedureType: 'event',
    status: 'registrado',
  },
]

const initialMemberships = [
  {
    id: 'mem-001',
    athleteId: 'ath-001',
    year: '2026',
    status: 'activa',
    startDate: '2026-02-01',
    expirationDate: '2027-01-31',
    memberCode: 'PLU-ARG-2026-001',
    paymentStatus: 'aprobado',
    mercadoPagoRef: 'MP-90122',
  },
]

const initialRegistrations = [
  {
    id: 'reg-001',
    athleteId: 'ath-001',
    event: 'Pitbull Classic',
    category: 'Raw',
    division: 'Open',
    bodyweight: '67.5',
    status: 'confirmada',
    paymentStatus: 'aprobado',
    notes: 'Afiliación e inscripción pagadas por Mercado Pago.',
  },
  {
    id: 'reg-002',
    athleteId: 'ath-002',
    event: 'Pitbull Classic',
    category: 'Classic Raw',
    division: 'Junior',
    bodyweight: '82.5',
    status: 'pendiente_pago',
    paymentStatus: 'validacion_manual',
    notes: 'Pendiente de validación manual.',
  },
]

const initialPayments = [
  {
    id: 'pay-001',
    athleteId: 'ath-001',
    concept: 'Afiliación anual + Pitbull Classic',
    amount: 78000,
    method: 'mercado_pago',
    status: 'aprobado',
    reference: 'MP-90122',
    createdAt: '2026-02-01',
  },
  {
    id: 'pay-002',
    athleteId: 'ath-002',
    concept: 'Inscripción Pitbull Classic',
    amount: 45000,
    method: 'manual_link',
    status: 'validacion_manual',
    reference: 'LINK-MP-PB-2026',
    createdAt: '2026-03-16',
  },
]

export function getInitialState(storedData) {
  return {
    athletes: storedData?.athletes || initialAthletes,
    memberships: storedData?.memberships || initialMemberships,
    registrations: storedData?.registrations || initialRegistrations,
    payments: storedData?.payments || initialPayments,
    createdOrder: storedData?.createdOrder || null,
    auditLogs: storedData?.auditLogs || [],
  }
}

export function calculateAmount(procedureType) {
  return PROCEDURE_TYPES[procedureType]?.amount ?? 0
}

export function findDuplicateAthlete(athletes, { email, documentId }) {
  return athletes.find(
    (a) =>
      a.email.toLowerCase() === email.toLowerCase() ||
      a.documentId === documentId,
  )
}

export function createAthleteProfile(form, athletes) {
  const validation = validateAthleteForm(form)
  if (!validation.success) return { error: validation.error, errors: validation.errors }

  const duplicate = findDuplicateAthlete(athletes, form)
  if (duplicate) return { error: `Ya existe un atleta con ese correo o documento (${duplicate.fullName}).` }

  const athleteId = generateId('ath', athletes.length + 1)
  const athlete = { id: athleteId, ...validation.data, status: 'registrado' }
  return {
    athlete,
    confirmation: { type: 'profile', athleteName: athlete.fullName, status: 'registrado' },
    auditLog: createAuditLog('athlete.registered', 'athlete', athleteId, 'public'),
    resetForm: { ...DEFAULT_FORM },
  }
}

export function createMembershipOrder({ athlete, form, memberships, payments }) {
  const paymentStatus = getPaymentStatusForMethod(form.paymentMethod)
  const payment = createPayment({ athleteId: athlete.id, concept: 'Afiliación anual', amount: PRICING.membership, method: form.paymentMethod, payments })
  const membership = {
    id: generateId('mem', memberships.length + 1),
    athleteId: athlete.id,
    year: '2026',
    status: 'pendiente_pago',
    startDate: todayISO(),
    expirationDate: '2027-01-31',
    memberCode: `PLU-ARG-2026-${athlete.id.replace('ath-', '')}`,
    paymentStatus,
    mercadoPagoRef: '',
  }
  return {
    membership,
    payment,
    createdOrder: createOrder(athlete, payment, 'membership'),
    auditLog: createAuditLog('membership.created', 'membership', membership.id, athlete.id),
  }
}

export function createCompetitionOrder({ athlete, event, form, registrations, payments }) {
  const payment = createPayment({ athleteId: athlete.id, concept: `Inscripción ${event.title}`, amount: PRICING.event, method: form.paymentMethod, payments })
  const registration = {
    id: generateId('reg', registrations.length + 1),
    athleteId: athlete.id,
    event: event.title,
    eventSlug: event.slug,
    category: form.category,
    division: form.division,
    bodyweight: form.estimatedWeight,
    status: 'pendiente_pago',
    paymentStatus: payment.status,
    notes: '',
  }
  return {
    registration,
    payment,
    createdOrder: createOrder(athlete, payment, 'competition'),
    auditLog: createAuditLog('registration.created', 'registration', registration.id, athlete.id),
  }
}

function createPayment({ athleteId, concept, amount, method, payments }) {
  return {
    id: generateId('pay', payments.length + 1),
    athleteId,
    concept,
    amount,
    method,
    status: getPaymentStatusForMethod(method),
    reference: createPaymentReference(method),
    createdAt: todayISO(),
  }
}

function createOrder(athlete, payment, type) {
  return {
    type,
    athleteName: athlete.fullName,
    athleteDocument: athlete.documentId,
    athleteId: athlete.id,
    paymentId: payment.id,
    paymentMethod: payment.method,
    ...payment,
  }
}

function createAuditLog(action, entityType, entityId, actor) {
  return { id: `audit-${Date.now()}`, action, entityType, entityId, actor, createdAt: new Date().toISOString() }
}

export function createRegistrationFromForm(form, athletes, memberships, registrations, payments) {
  const validation = validateAthleteForm(form)
  if (!validation.success) {
    return { error: validation.error }
  }

  const duplicate = findDuplicateAthlete(athletes, form)
  if (duplicate) {
    return { error: `Ya existe un atleta con ese email o documento (${duplicate.fullName}).` }
  }

  const nextNumber = athletes.length + 1
  const athleteId = generateId('ath', nextNumber)
  const paymentId = generateId('pay', payments.length + 1)
  const today = todayISO()
  const paymentStatus = getPaymentStatusForMethod(form.paymentMethod)
  const amount = calculateAmount(form.procedureType)
  const conceptMap = {
    both: 'Afiliación anual + Pitbull Classic',
    membership: 'Afiliación anual',
    event: 'Inscripción Pitbull Classic',
  }

  const athlete = {
    id: athleteId,
    ...form,
    status: 'pre_registrado',
  }

  const newMemberships = []
  if (['both', 'membership'].includes(form.procedureType)) {
    newMemberships.push({
      id: generateId('mem', memberships.length + 1),
      athleteId,
      year: '2026',
      status: 'pendiente_pago',
      startDate: today,
      expirationDate: '2027-01-31',
      memberCode: `PLU-ARG-2026-${String(nextNumber).padStart(3, '0')}`,
      paymentStatus,
      mercadoPagoRef: '',
    })
  }

  const newRegistrations = []
  if (['both', 'event'].includes(form.procedureType)) {
    newRegistrations.push({
      id: generateId('reg', registrations.length + 1),
      athleteId,
      event: 'Pitbull Classic',
      category: form.category,
      division: form.division,
      bodyweight: form.estimatedWeight,
      status: 'pendiente_pago',
      paymentStatus,
      notes: '',
    })
  }

  const payment = {
    id: paymentId,
    athleteId,
    concept: conceptMap[form.procedureType],
    amount,
    method: form.paymentMethod,
    status: paymentStatus,
    reference: createPaymentReference(form.paymentMethod),
    createdAt: today,
  }

  const createdOrder = {
    athleteName: form.fullName,
    athleteDocument: form.documentId,
    athleteId,
    paymentId,
    paymentMethod: form.paymentMethod,
    ...payment,
  }

  const auditLog = {
    id: `audit-${Date.now()}`,
    action: 'athlete.registered',
    entityType: 'athlete',
    entityId: athleteId,
    actor: 'public',
    createdAt: new Date().toISOString(),
    metadata: { procedureType: form.procedureType },
  }

  return {
    athlete,
    memberships: newMemberships,
    registrations: newRegistrations,
    payment,
    createdOrder,
    auditLog,
    resetForm: { ...DEFAULT_FORM },
  }
}

export async function approvePayment(paymentId, payments) {
  const payment = payments.find((item) => item.id === paymentId)
  if (!payment) return null

  const athleteId = payment.athleteId

  return {
    payment: { ...payment, status: 'aprobado', reference: payment.reference || `MANUAL-${Date.now()}` },
    athleteId,
    auditLog: {
      id: `audit-${Date.now()}`,
      action: 'payment.approved',
      entityType: 'payment',
      entityId: paymentId,
      actor: 'admin',
      createdAt: new Date().toISOString(),
    },
    emails: async (athlete) => {
      await notifyPaymentApproved(athlete, payment)
      if (payment.concept.includes('Pitbull')) {
        await notifyRegistrationConfirmed(athlete, 'Pitbull Classic')
      }
      if (payment.concept.includes('Afiliación')) {
        await notifyAffiliationStarted({ ...athlete, memberCode: athlete.memberCode })
      }
    },
  }
}
