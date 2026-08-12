import { callRpc } from '../lib/rpcErrors.js'
import { apiDelete, apiGet, apiPost, apiRequest } from '../lib/api.js'
import { toCamelSchedule } from '../lib/eventSchedule.js'

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
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    photoPath: row.photo_path,
    photoUrl: row.photo_url ?? null,
    // Afiliarse e inscribirse exigen correo confirmado (ver
    // `assertEmailVerified` en server/routes/athletes.js). Sin este campo la
    // cuenta no podía avisar por qué el checkout se bloqueaba ni ofrecer el
    // reenvío del enlace.
    emailVerifiedAt: row.email_verified_at ?? null,
    // Credencial de la persona: estable de por vida, a diferencia del
    // `qrToken` de cada afiliación (que cambia con cada renovación y no existe
    // para un inscripto a un evento que no exige afiliación).
    credentialToken: row.credential_token ?? null,
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
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
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
    paymentProofPath: row.payment_proof_path ?? row.paymentProofPath ?? null,
    paymentProofUploadedAt:
      row.payment_proof_uploaded_at ?? row.paymentProofUploadedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  }
}

function toCamelRegistrationEntry({ registration, event, checkIn, schedule }) {
  return {
    id: registration.id,
    athleteId: registration.athlete_id,
    event: event?.title ?? registration.event_title,
    eventSlug: event?.slug ?? registration.event_slug,
    // La fecha del evento ya viajaba en la proyección y se descartaba acá, así
    // que la credencial no tenía con qué decir cuándo se compite.
    eventStartsAt: event?.starts_at ?? registration.event_starts_at ?? null,
    eventEndsAt: event?.ends_at ?? registration.event_ends_at ?? null,
    category: registration.category,
    division: registration.division,
    bodyweight: registration.bodyweight_kg,
    status: registration.status,
    paymentOrderId: registration.payment_order_id,
    createdAt: registration.created_at ?? registration.createdAt ?? null,
    updatedAt: registration.updated_at ?? registration.updatedAt ?? null,
    checkedInAt: checkIn?.scanned_at ?? null,
    // Día y tanda asignados. null mientras la organización no armó la grilla.
    schedule: toCamelSchedule(schedule ?? registration.schedule),
    // El torneo todavía no terminó. Lo calcula la proyección contra el reloj,
    // no contra `events.status`, que se edita a mano y queda viejo.
    upcoming: registration.upcoming ?? null,
    // Misma bandera que mira el check-in: si el meet la pide, la puerta
    // exige afiliación vigente aunque la inscripción ya esté confirmada.
    requiresMembership:
      registration.requires_membership ??
      event?.requires_membership ??
      event?.requiresMembership ??
      null,
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
export function mapAthleteData({ athletes, athlete, memberships, registrations, paymentOrders }) {
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
      paymentProofPath: order.payment_proof_path ?? order.paymentProofPath ?? null,
      paymentProofUploadedAt:
        order.payment_proof_uploaded_at ?? order.paymentProofUploadedAt ?? null,
      createdAt: order.created_at ?? order.createdAt ?? null,
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

const EMPTY_ATHLETE_SESSION = {
  user: null,
  athlete: null,
  memberships: [],
  registrations: [],
  payments: [],
}

/** Snapshot público de UN atleta (perfil propio, sin sesión de Supabase Auth). */
export async function fetchAthleteSnapshot() {
  const result = await apiGet('/api/athletes/session')
  if (!result?.user) {
    return {
      athlete: null,
      memberships: [],
      registrations: [],
      payments: [],
    }
  }
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
  if (!result?.user) return { ...EMPTY_ATHLETE_SESSION }
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

export function forgotAthletePassword(email) {
  return apiPost('/api/athletes/forgot-password', { email })
}

export function resetAthletePassword({ token, password }) {
  return apiPost('/api/athletes/reset-password', { token, password })
}

/** Confirma el correo desde el link que llega por email. No requiere sesión. */
export function verifyAthleteEmail(token) {
  return apiPost('/api/athletes/verify-email', { token })
}

/** Reenvía el enlace de confirmación al atleta con sesión iniciada. */
export function resendAthleteVerification() {
  return apiPost('/api/athletes/me/resend-verification', {})
}

/** Confirma el correo con el OTP del mail (fallback si el link no abre). */
export function verifyAthleteEmailCode(code) {
  return apiPost('/api/athletes/me/verify-email-code', { code })
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

/**
 * Consulta pública: ¿email/documento ya tienen cuenta?
 * Devuelve solo booleanos (`emailTaken`, `documentTaken`).
 */
export function checkAthleteAvailability({ email, documentId } = {}) {
  const body = {}
  if (email) body.email = email
  if (documentId) body.documentId = documentId
  return apiPost('/api/athletes/check-availability', body)
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
    familyCode: row.familyCode ?? row.family_code,
    version: row.version,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    billingFrequency: row.billing_frequency,
    collectionMode: row.collection_mode,
    intervalCount: row.interval_count,
    graceDays: row.grace_days,
    effectiveFrom: row.effectiveFrom ?? row.effective_from,
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

export async function createCompetitionRegistrationCombo({
  eventSlug,
  division,
  category,
  bodyweightKg,
  paymentMethod,
  idempotencyKey = crypto.randomUUID(),
}) {
  const result = await apiPost('/api/athletes/me/registration-combos', {
    eventSlug,
    division,
    category,
    bodyweightKg,
    paymentMethod,
    idempotencyKey,
  })
  return {
    order: toCamelPaymentOrder(result.order),
    membership: toCamelMembership(result.membership),
    registration: toCamelRegistrationEntry({
      registration: result.registration,
      event: { slug: eventSlug },
    }),
    plan: toCamelMembershipPlan(result.plan),
    comboOffer: result.comboOffer
      ? {
          id: result.comboOffer.id,
          membershipPlanId: result.comboOffer.membership_plan_id,
          price: result.comboOffer.price,
          currency: result.comboOffer.currency,
          startsAt: result.comboOffer.starts_at,
          endsAt: result.comboOffer.ends_at,
        }
      : null,
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

function toCredentialResult(result, eventSlug) {
  return {
    // La proyección solo trae documento y fecha de nacimiento cuando el
    // código era un token no adivinable: por member_code, que es correlativo,
    // devolverlos permitiría cosechar el padrón iterando números de socio.
    athlete: toCamelAthlete(result.athlete),
    // Puede venir null: un inscripto a un evento que no exige afiliación
    // también tiene credencial, y su veredicto lo da la inscripción.
    membership: result.membership ? toCamelMembership(result.membership) : null,
    registration: result.registration
      ? toCamelRegistrationEntry({
          registration: result.registration,
          event: {
            slug: eventSlug ?? result.registration.event_slug,
            title: result.registration.event_title,
            starts_at: result.registration.event_starts_at,
            ends_at: result.registration.event_ends_at,
          },
          // La proyección ahora incluye el ingreso ya registrado: sin esto una
          // credencial usada volvía a mostrarse como válida y el rechazo
          // aparecía recién al apretar "marcar ingreso".
          checkIn: result.registration.check_in ?? null,
        })
      : null,
    // Inscripciones vigentes del atleta. Se usan cuando el QR se escanea sin
    // `?evento=`: antes ese caso no devolvía ninguna y la puerta se quedaba
    // sin acción posible.
    registrations: (result.registrations ?? []).map((row) =>
      toCamelRegistrationEntry({
        registration: row,
        event: {
          slug: row.event_slug,
          title: row.event_title,
          starts_at: row.event_starts_at,
          ends_at: row.event_ends_at,
        },
        checkIn: row.check_in ?? null,
      }),
    ),
  }
}

/**
 * Verificación pública de credencial: a donde apunta el QR impreso, sin
 * sesión. La proyección no trae documento ni `qr_token` — el `member_code` es
 * correlativo, así que devolver cualquiera de los dos permitía cosecharlos
 * iterando códigos desde la home.
 *
 * La foto (si el QR era un token y el atleta tiene `photo_path`) se firma en
 * un endpoint Express rate-limited; si falla, la credencial igual se muestra
 * con iniciales.
 */
export async function getMembershipByCodeOrToken(code, eventSlug) {
  const result = await callRpc('get_membership_by_code_or_token', {
    p_code: code,
    p_event_slug: eventSlug ?? null,
  })
  const mapped = toCredentialResult(result, eventSlug)

  if (mapped.athlete?.photoPath && !mapped.athlete.photoUrl) {
    try {
      const { photoUrl } = await apiGet(
        `/api/athletes/public/credential-photo?code=${encodeURIComponent(code)}`,
      )
      if (photoUrl) mapped.athlete.photoUrl = photoUrl
    } catch {
      // La verificación de puerta no depende de la foto.
    }
  }

  return mapped
}

/**
 * Misma credencial, con documento, para el operador en la puerta. Va por la
 * API con sesión de staff (`admin.checkin.execute` + alcance de evento) en vez
 * de por la RPC pública.
 */
export async function getStaffMembershipCredential(code, eventSlug) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : ''
  const result = await apiGet(`/api/tickets/credentials/${encodeURIComponent(code)}${query}`)
  return toCredentialResult(result, eventSlug)
}

/** Órdenes de afiliación/inscripción para la bandeja de Finanzas. */
export async function listAthletePaymentOrders(filters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.method) params.set('method', filters.method)
  if (filters.concept) params.set('concept', filters.concept)
  if (filters.limit) params.set('limit', String(filters.limit))
  const query = params.toString()
  const { orders } = await apiGet(`/api/athletes/admin/payment-orders${query ? `?${query}` : ''}`)

  return orders.map((row) => ({
    ...toCamelPaymentOrder(row),
    concept: row.concept,
    conceptLabel: CONCEPT_LABELS[row.concept] ?? row.concept,
    athlete: row.athlete
      ? {
          id: row.athlete.id,
          fullName: row.athlete.full_name,
          documentId: row.athlete.document_id,
          email: row.athlete.email,
        }
      : null,
  }))
}

export async function getAthletePaymentProofUrl(orderId) {
  const { url } = await apiGet(`/api/athletes/admin/payment-orders/${orderId}/proof-url`)
  return url
}

export async function registerAthletePaymentProof(orderId, proofPath) {
  const { order } = await apiPost(`/api/athletes/me/payment-orders/${orderId}/proof`, { proofPath })
  return { order: toCamelPaymentOrder(order) }
}

/** Credencial emitida de un socio, para verla y reemitirla desde el panel. */
export async function getMembershipCredential(membershipId) {
  const { membership } = await apiGet(`/api/athletes/admin/memberships/${membershipId}/credential`)
  return {
    membership: toCamelMembership(membership),
    athlete: membership.athlete
      ? {
          id: membership.athlete.id,
          fullName: membership.athlete.full_name,
          documentId: membership.athlete.document_id,
          email: membership.athlete.email,
          credentialToken: membership.athlete.credential_token ?? null,
        }
      : null,
  }
}

export async function rotateMembershipQrToken(membershipId) {
  const { membership } = await apiPost(`/api/athletes/admin/memberships/${membershipId}/rotate-qr`, {})
  return { membership: toCamelMembership(membership) }
}

/** Activa o da de baja una afiliación a mano. Queda auditada con el actor. */
export async function setMembershipStatus(membershipId, status) {
  const { membership } = await apiPost(
    `/api/athletes/admin/memberships/${membershipId}/status`,
    { status },
  )
  return { membership: toCamelMembership(membership) }
}

/** Rota la credencial de la persona: invalida la card impresa de ese atleta. */
export async function rotateAthleteCredentialToken(athleteId) {
  const { athlete } = await apiPost(`/api/athletes/admin/${athleteId}/rotate-credential`, {})
  return { athlete: toCamelAthlete(athlete) }
}

/**
 * Borrado definitivo del atleta y todo lo asociado. Solo Super Admin: el
 * backend lo exige con requireRole(['admin_maximal']).
 */
export async function deleteAthleteRequest(athleteId) {
  const result = await apiDelete(`/api/athletes/admin/${encodeURIComponent(athleteId)}`)
  return { deletedAthlete: result.deletedAthlete }
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
