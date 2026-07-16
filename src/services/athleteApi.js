import { callRpc } from '../lib/rpcErrors.js'
import { apiGet, apiPost, apiRequest } from '../lib/api.js'

/**
 * athleteApi.js — PLU ARG
 *
 * Capa de acceso a Supabase para atletas/membresías/inscripciones a
 * torneo — hasta ahora este dominio vivía solo en localStorage (por eso el
 * QR de un socio codificaba el memberCode legible y solo podía verificarse
 * en el mismo dispositivo donde se generó). Mismo patrón que ticketApi.js:
 * RPCs SECURITY DEFINER (supabase/migrations/20260715000100_phase2_rpc_functions.sql)
 * como única vía de escritura, columnas snake_case normalizadas a las
 * mismas claves camelCase que ya usaban los componentes existentes
 * (adminService.js, exportService.js, membershipService.js, CheckInSection)
 * para no tener que reescribirlos.
 */

function toCamelAthlete(row) {
  if (!row) return row
  return {
    id: row.id,
    fullName: row.full_name,
    documentId: row.document_id,
    email: row.email,
    birthDate: row.birth_date,
    phone: row.phone,
    country: row.country,
    province: row.province,
    city: row.city,
    gym: row.gym,
    sex: row.sex,
    division: row.division,
    category: row.category,
    estimatedWeight: row.estimated_weight,
    status: row.status,
    photoPath: row.photo_path,
    photoUrl: row.photo_url ?? null,
  }
}

function toCamelMembership(row) {
  if (!row) return row
  return {
    id: row.id,
    athleteId: row.athlete_id,
    year: row.year,
    status: row.status,
    startDate: row.start_date,
    expirationDate: row.expiration_date,
    memberCode: row.member_code,
    qrToken: row.qr_token,
    paymentOrderId: row.payment_order_id,
  }
}

function toCamelPaymentOrder(row) {
  if (!row) return row
  return {
    id: row.id,
    athleteId: row.athlete_id,
    concept: row.concept,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
    status: row.status,
    reference: row.reference,
    paymentProofPath: row.payment_proof_path,
    paymentProofUploadedAt: row.payment_proof_uploaded_at,
    createdAt: row.created_at,
  }
}

function toCamelRegistrationEntry({ registration, event, checkIn }) {
  return {
    id: registration.id,
    athleteId: registration.athlete_id,
    event: event?.title,
    eventSlug: event?.slug,
    category: registration.category,
    division: registration.division,
    bodyweight: registration.bodyweight_kg,
    status: registration.status,
    paymentOrderId: registration.payment_order_id,
    checkedInAt: checkIn?.scanned_at ?? null,
    notes: '',
  }
}

const CONCEPT_LABELS = {
  membership: 'Afiliación anual',
  registration: 'Inscripción',
  combo: 'Afiliación + inscripción',
}

/**
 * Une atletas/membresías/inscripciones/órdenes de pago devueltos por
 * get_athlete_snapshot / list_athlete_admin_data en la forma plana que ya
 * esperaban los componentes (incluye el array `payments`, que antes vivía
 * suelto en localStorage).
 */
function mapAthleteData({ athletes, athlete, memberships, registrations, paymentOrders }) {
  const athleteRows = (athletes ?? (athlete ? [athlete] : [])).map(toCamelAthlete)
  const membershipRows = (memberships ?? []).map(toCamelMembership)
  const registrationRows = (registrations ?? []).map(toCamelRegistrationEntry)
  const orders = paymentOrders ?? []

  const registrationEventByOrderId = new Map(
    registrationRows.filter((item) => item.paymentOrderId).map((item) => [item.paymentOrderId, item.event]),
  )

  const paymentRows = orders.map((order) => {
    const eventTitle = order.concept === 'registration' ? registrationEventByOrderId.get(order.id) : null
    return {
      id: order.id,
      athleteId: order.athlete_id,
      concept: eventTitle ? `Inscripción ${eventTitle}` : CONCEPT_LABELS[order.concept] ?? order.concept,
      amount: order.amount,
      method: order.method,
      status: order.status,
      reference: order.reference,
      createdAt: order.created_at,
    }
  })

  const paymentStatusByOrderId = new Map(paymentRows.map((payment) => [payment.id, payment.status]))
  membershipRows.forEach((membership) => {
    membership.paymentStatus = membership.paymentOrderId
      ? (paymentStatusByOrderId.get(membership.paymentOrderId) ?? null)
      : null
  })
  registrationRows.forEach((registration) => {
    registration.paymentStatus = registration.paymentOrderId
      ? (paymentStatusByOrderId.get(registration.paymentOrderId) ?? null)
      : null
  })

  return {
    athletes: athleteRows,
    memberships: membershipRows,
    registrations: registrationRows,
    payments: paymentRows,
  }
}

/** Snapshot público de UN atleta (perfil propio, sin sesión de Supabase Auth). */
export async function fetchAthleteSnapshot() {
  const result = await apiGet('/api/athletes/session')
  const mapped = mapAthleteData(result)
  return {
    athlete: mapped.athletes[0] ?? null,
    memberships: mapped.memberships,
    registrations: mapped.registrations,
    payments: mapped.payments,
  }
}

export async function fetchAthleteSession() {
  const result = await apiGet('/api/athletes/session')
  const mapped = mapAthleteData(result)
  return {
    user: result.user,
    athlete: mapped.athletes[0] ?? null,
    memberships: mapped.memberships,
    registrations: mapped.registrations,
    payments: mapped.payments,
  }
}

export function logoutAthleteSession() {
  return apiPost('/api/athletes/logout', {})
}

export function loginAthleteSession(credentials) {
  return apiPost('/api/athletes/login', credentials)
}

/** Snapshot completo para el panel admin/seguridad. */
export async function fetchAdminAthleteData() {
  const result = await apiGet('/api/athletes/admin')
  return mapAthleteData(result)
}

export async function registerAthlete(form) {
  const { athlete: row } = await apiPost('/api/athletes/register', {
      fullName: form.fullName,
      documentId: form.documentId,
      email: form.email,
      birthDate: form.birthDate,
      phone: form.phone,
      country: form.country,
      province: form.province,
      city: form.city,
      gym: form.gym,
      sex: form.sex,
      division: form.division,
      category: form.category,
      estimatedWeight: form.estimatedWeight,
      password: form.password,
  })
  return { athlete: toCamelAthlete(row) }
}

export async function updateAthleteProfile(_athleteId, updates) {
  const { athlete: row } = await apiRequest('/api/athletes/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
  return { athlete: toCamelAthlete(row) }
}

function toCamelMembershipPlan(row) {
  if (!row) return row
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    price: row.price,
    currency: row.currency,
    billingFrequency: row.billing_frequency,
    collectionMode: row.collection_mode,
    intervalCount: row.interval_count,
    graceDays: row.grace_days,
  }
}

export async function createMembershipOrder(_athleteId, paymentMethod, planCode = 'plu-annual', idempotencyKey = crypto.randomUUID()) {
  const result = await apiPost('/api/athletes/me/membership-orders', {
    paymentMethod,
    planCode,
    idempotencyKey,
  })
  return {
    order: toCamelPaymentOrder(result.order),
    membership: toCamelMembership(result.membership),
    plan: toCamelMembershipPlan(result.plan),
  }
}

export async function createCompetitionRegistration({
  eventSlug,
  division,
  category,
  bodyweightKg,
  paymentMethod,
  idempotencyKey = crypto.randomUUID(),
}) {
  const result = await apiPost('/api/athletes/me/registrations', {
    eventSlug,
    division,
    category,
    bodyweightKg,
    paymentMethod,
    idempotencyKey,
  })
  return {
    order: toCamelPaymentOrder(result.order),
    registration: toCamelRegistrationEntry({ registration: result.registration, event: { slug: eventSlug } }),
  }
}

export async function approveAthletePaymentOrder(orderId) {
  const result = await apiPost(`/api/athletes/admin/payment-orders/${orderId}/approve`, {})
  return {
    order: toCamelPaymentOrder(result.order),
    membership: toCamelMembership(result.membership),
    registration: result.registration ? toCamelRegistrationEntry({ registration: result.registration }) : null,
  }
}

export async function getMembershipByCodeOrToken(code, eventSlug) {
  const result = await callRpc('get_membership_by_code_or_token', {
    p_code: code,
    p_event_slug: eventSlug ?? null,
  })
  return {
    athlete: toCamelAthlete(result.athlete),
    membership: toCamelMembership(result.membership),
    registration: result.registration ? toCamelRegistrationEntry({ registration: result.registration, event: { slug: eventSlug } }) : null,
  }
}

export async function registerAthletePhoto(_athleteId, photoPath) {
  const { athlete: row } = await apiPost('/api/athletes/me/photo', { photoPath })
  return { athlete: toCamelAthlete(row) }
}

export async function checkInRegistration(registrationId, gate) {
  const result = await apiPost(`/api/tickets/registrations/${registrationId}/checkin`, { gate })
  return {
    registration: toCamelRegistrationEntry({ registration: result.registration }),
    checkIn: { id: result.checkIn?.id, scannedAt: result.checkIn?.scanned_at },
  }
}

export async function getEventCheckinAllowlist(eventSlug) {
  return apiGet(`/api/tickets/allowlist/${encodeURIComponent(eventSlug)}`)
}
