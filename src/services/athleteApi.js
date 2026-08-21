import { callRpc } from '../lib/rpcErrors.js'
import { apiDelete, apiGet, apiPatch, apiPost, apiRequest } from '../lib/api.js'
import { toCamelSchedule } from '../lib/eventSchedule.js'
import { describePaymentConcept } from '../lib/paymentConcept.js'
import { derivePaymentProgress } from '../lib/paymentProgress.js'

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
    bestTotalKg: row.declared_best_total_kg ?? row.bestTotalKg ?? null,
    emergencyContactName: row.emergency_contact_name ?? row.emergencyContactName ?? '',
    emergencyContactPhone: row.emergency_contact_phone ?? row.emergencyContactPhone ?? '',
    instagramHandle: row.instagram_handle ?? row.instagramHandle ?? '',
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
    manualPaymentChannel: row.manual_payment_channel ?? row.manualPaymentChannel ?? null,
    status: row.status,
    reference: row.reference,
    rejectedBy: row.rejected_by ?? row.rejectedBy ?? null,
    rejectionReason: row.rejection_reason ?? row.rejectionReason ?? null,
    rejectedAt: row.rejected_at ?? row.rejectedAt ?? null,
    paymentProofPath: row.payment_proof_path ?? row.paymentProofPath ?? null,
    paymentProofUploadedAt: row.payment_proof_uploaded_at ?? row.paymentProofUploadedAt ?? null,
    discountCode: row.discount_code ?? row.discountCode ?? null,
    discountAmount: Number(row.discount_amount ?? row.discountAmount) || 0,
    notes: row.notes ?? null,
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
    publicVisible: registration.public_visible ?? registration.publicVisible ?? true,
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

  const registrationByOrderId = new Map(
    registrationRows.filter((item) => item.paymentOrderId).map((item) => [item.paymentOrderId, item]),
  )
  const membershipByOrderId = new Map(
    membershipRows.filter((item) => item.paymentOrderId).map((item) => [item.paymentOrderId, item]),
  )

  const paymentRows = orders.map((order) => {
    const registration = registrationByOrderId.get(order.id) ?? null
    const membership = membershipByOrderId.get(order.id) ?? null
    const paymentProofPath = order.payment_proof_path ?? order.paymentProofPath ?? null
    // La descripción declarada sale del mismo módulo que arma el título que
    // viaja a Mercado Pago: lo que ve el atleta en la app y lo que le llega al
    // resumen de la tarjeta dicen lo mismo.
    const described = describePaymentConcept({
      concept: order.concept,
      membershipYear: membership?.year ?? null,
      fallbackYear: String(order.created_at ?? order.createdAt ?? '').slice(0, 4) || null,
      eventTitle: registration?.event ?? null,
      division: registration?.division ?? null,
      category: registration?.category ?? null,
    })
    const normalizedOrder = {
      status: order.status,
      method: order.method,
      manualPaymentChannel: order.manual_payment_channel ?? order.manualPaymentChannel ?? null,
      expiresAt: order.expires_at ?? order.expiresAt ?? null,
      updatedAt: order.updated_at ?? order.updatedAt ?? null,
      rejectionReason: order.rejection_reason ?? order.rejectionReason ?? null,
      paymentProofUploadedAt:
        order.payment_proof_uploaded_at ?? order.paymentProofUploadedAt ?? null,
    }

    return {
      id: order.id,
      athleteId: order.athlete_id,
      concept: described.title,
      conceptDetail: described.detail,
      // Valor crudo ('membership' | 'registration' | 'combo'), distinto de
      // `concept` (la etiqueta ya formateada arriba) -- lo necesita
      // paymentReconciliationService para saber qué entitlement debería
      // existir sin tener que parsear el label.
      conceptType: order.concept,
      amount: order.amount,
      method: order.method,
      manualPaymentChannel: normalizedOrder.manualPaymentChannel,
      status: order.status,
      reference: order.reference,
      rejectionReason: normalizedOrder.rejectionReason,
      expiresAt: normalizedOrder.expiresAt,
      updatedAt: normalizedOrder.updatedAt,
      paymentProofPath:
        typeof paymentProofPath === 'string' ? paymentProofPath.trim() || null : paymentProofPath,
      paymentProofUploadedAt: normalizedOrder.paymentProofUploadedAt,
      createdAt: order.created_at ?? order.createdAt ?? null,
      // Estado real derivado del agregado + el libro de intentos, no del último
      // intento aplicado. `outcome` es el derecho que este cobro pagaba: si el
      // cobro murió y el derecho igual quedó otorgado (activación manual desde
      // el panel), la fila lo dice en vez de contradecir a la sección de
      // Afiliación.
      progress: derivePaymentProgress({
        order: normalizedOrder,
        attempts: order.attempts ?? [],
        outcome: membership
          ? { kind: 'membership', status: membership.status }
          : registration
            ? { kind: 'registration', status: registration.status }
            : null,
      }),
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
  const { athlete: row, emailVerification } = await apiPost('/api/athletes/register', {
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
  return { athlete: toCamelAthlete(row), emailVerification }
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

export async function createMembershipOrder(
  _athleteId,
  paymentMethod,
  planCode = 'plu-annual',
  idempotencyKey = crypto.randomUUID(),
  discountCode,
  accessCode,
) {
  const result = await apiPost('/api/athletes/me/membership-orders', {
    paymentMethod,
    planCode,
    idempotencyKey,
    discountCode: discountCode || undefined,
    accessCode: accessCode || undefined,
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
  discountCode,
  accessCode,
}) {
  const result = await apiPost('/api/athletes/me/registrations', {
    eventSlug,
    division,
    category,
    bodyweightKg,
    paymentMethod,
    idempotencyKey,
    discountCode: discountCode || undefined,
    accessCode: accessCode || undefined,
  })
  return {
    order: toCamelPaymentOrder(result.order),
    registration: toCamelRegistrationEntry({
      registration: result.registration,
      event: { slug: eventSlug },
    }),
  }
}

/**
 * Sin `code` el servidor responde con la promoción pública que se va a aplicar
 * sola al crear la orden (`source: 'public_promo'`). Es la única forma de que
 * el checkout muestre el precio real antes de confirmar: el auto-aplicado pasa
 * dentro de la transacción de compra, no acá.
 */
/**
 * Chequeo previo del código de un combo restringido. Devuelve true o lanza el
 * 403 del servidor: no habilita nada por sí solo, el alta de la orden vuelve a
 * exigir el mismo código.
 */
export async function verifyComboAccessCode({ eventSlug, code }) {
  const result = await apiPost('/api/athletes/me/combo-access/verify', { eventSlug, code })
  return result?.valid === true
}

export async function previewDiscountCode({
  code = '',
  appliesTo,
  planCode,
  eventSlug,
  paymentMethod,
} = {}) {
  const result = await apiPost('/api/athletes/me/discount-preview', {
    code,
    appliesTo,
    planCode: planCode || undefined,
    eventSlug: eventSlug || undefined,
    // Sin el canal, el servidor calcula el ahorro sobre el precio de catálogo
    // y muestra un número distinto al que se cobra durante la ventana Pitbull.
    paymentMethod: paymentMethod || undefined,
  })
  const preview = result.preview ?? {}
  return {
    valid: preview.valid === true,
    reason: preview.reason ?? null,
    code: preview.code ?? null,
    // 'code' lo tipeó el atleta; 'public_promo' se aplica sola.
    source: preview.source === 'public_promo' ? 'public_promo' : 'code',
    description: preview.description ?? '',
    // 'percent' descuenta un porcentaje; 'fixed_price' fija el importe final;
    // 'access' no descuenta nada, sólo desbloquea el combo; 'offer' desbloquea
    // y además fija el importe — es la oferta exclusiva de un código secreto.
    // Un rechazo de una RPC anterior puede no incluir modalidad. No se lo
    // inventa como porcentaje: las pantallas deben consultar el alcance combo
    // o el endpoint de canje antes de concluir que no aplica.
    kind: preview.kind ?? null,
    // Alcance del código: viaja también con `reason: 'not_applicable'` y con
    // `reason: 'other_event'`, para poder decir de qué inscripción es en vez de
    // un "no aplica" seco.
    appliesTo: preview.appliesTo ?? null,
    eventSlug: preview.eventSlug ?? null,
    eventTitle: preview.eventTitle ?? null,
    percentOff: preview.percentOff ?? null,
    // Ya viene resuelto para el canal que se mandó en `paymentMethod`: una
    // promo puede tener un importe pactado para Mercado Pago y otro para
    // transferencia o efectivo, y el servidor elige antes de responder.
    fixedPrice: preview.fixedPrice ?? null,
    // Ventana de la promo. `startsAt` también viaja con `reason: 'not_started'`,
    // para poder decir desde cuándo sirve un código que todavía no abrió.
    startsAt: preview.startsAt ?? null,
    expiresAt: preview.expiresAt ?? null,
    discountAmount: preview.discountAmount ?? null,
    finalAmount: preview.finalAmount ?? null,
    // Canales manuales que este código destraba además de la pasarela. Un
    // código anterior a la lista sólo trae el booleano.
    manualChannels: Array.isArray(preview.manualChannels)
      ? preview.manualChannels
      : preview.enablesManualPayment
        ? ['bank_transfer', 'cash_pitbull']
        : [],
    // La otra mitad de la matriz: `false` cierra Mercado Pago para este código
    // (20260908100000). Ausente = abierta, que es lo que valía para todos los
    // códigos anteriores y también lo que responde una API sin la migración.
    mercadoPagoEnabled: preview.mercadoPagoEnabled !== false,
  }
}

/**
 * Canje de un código secreto de oferta exclusiva.
 *
 * A diferencia del preview, no necesita saber contra qué se está comprando: la
 * oferta trae su propia inscripción y su propio precio. Es lo que permite
 * canjear el código desde Afiliación, donde el atleta todavía no eligió evento.
 *
 * Devuelve `{ unlocked: false, reason }` cuando el código no sirve: no es un
 * error de red, es una respuesta que la pantalla tiene que explicar.
 */
export async function unlockOfferCode({ code }) {
  const result = await apiPost('/api/athletes/me/offer-unlocks', { code })
  return {
    unlocked: result?.unlocked === true,
    alreadyUnlocked: result?.alreadyUnlocked === true,
    reason: result?.reason ?? null,
    startsAt: result?.startsAt ?? null,
    offer: result?.offer ?? null,
  }
}

/** Resolvedor universal: el servidor decide beneficio, alcance y destino. */
export async function redeemPromotionCodeRequest({ code, context = {} }) {
  const result = await apiPost('/api/athletes/me/codes/redeem', { code, context })
  return {
    status: result?.status === 'accepted' ? 'accepted' : 'rejected',
    accepted: result?.status === 'accepted',
    reason: result?.reason ?? null,
    action: result?.action ?? null,
    code: result?.code ?? code,
    kind: result?.kind ?? null,
    appliesTo: result?.appliesTo ?? null,
    destination: result?.destination ?? null,
    campaign: result?.campaign ?? null,
    benefit: result?.benefit ?? null,
    offer: result?.offer ?? null,
    startsAt: result?.startsAt ?? null,
  }
}

/** Ofertas exclusivas que este atleta ya canjeó. Sostiene la ficha de Mi cuenta. */
export async function fetchOfferUnlocks() {
  const result = await apiGet('/api/athletes/me/offer-unlocks')
  return Array.isArray(result?.offers) ? result.offers : []
}

export async function createCompetitionRegistrationCombo({
  eventSlug,
  division,
  category,
  bodyweightKg,
  paymentMethod,
  idempotencyKey = crypto.randomUUID(),
  membershipAccessCode,
  registrationAccessCode,
  comboAccessCode,
  discountCode,
}) {
  const result = await apiPost('/api/athletes/me/registration-combos', {
    eventSlug,
    division,
    category,
    bodyweightKg,
    paymentMethod,
    idempotencyKey,
    discountCode: discountCode || undefined,
    membershipAccessCode: membershipAccessCode || undefined,
    registrationAccessCode: registrationAccessCode || undefined,
    comboAccessCode: comboAccessCode || undefined,
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
    registration: result.registration
      ? toCamelRegistrationEntry({ registration: result.registration })
      : null,
  }
}

export async function rejectAthletePaymentOrder(orderId, reason) {
  const result = await apiPost(`/api/athletes/admin/payment-orders/${orderId}/reject`, { reason })
  return { order: toCamelPaymentOrder(result.order) }
}

/**
 * Acredita a mano una orden que el proveedor dio por perdida. Devuelve la misma
 * forma que `approveAthletePaymentOrder` para que la bandeja no tenga que
 * distinguir de qué acción viene el resultado.
 */
export async function forceSettleAthletePaymentOrder(orderId, { reason, reference } = {}) {
  const result = await apiPost(`/api/athletes/admin/payment-orders/${orderId}/force-settle`, {
    reason,
    ...(reference ? { reference } : {}),
  })
  return {
    order: toCamelPaymentOrder(result.order),
    membership: toCamelMembership(result.membership),
    registration: result.registration
      ? toCamelRegistrationEntry({ registration: result.registration })
      : null,
    duplicate: Boolean(result.duplicate),
  }
}

export async function setEventRegistrationStatus(registrationId, status, reason) {
  const result = await apiPost(`/api/athletes/admin/registrations/${registrationId}/status`, {
    status,
    reason,
  })
  return {
    registration: result.registration
      ? toCamelRegistrationEntry({ registration: result.registration })
      : null,
    duplicate: Boolean(result.duplicate),
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

export async function registerAthletePaymentProof(orderId, proofPath, notes) {
  const { order } = await apiPost(`/api/athletes/me/payment-orders/${orderId}/proof`, {
    proofPath,
    notes,
  })
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
  const { membership } = await apiPost(
    `/api/athletes/admin/memberships/${membershipId}/rotate-qr`,
    {},
  )
  return { membership: toCamelMembership(membership) }
}

/** Activa o da de baja una afiliación a mano. Queda auditada con el actor. */
export async function setMembershipStatus(membershipId, status) {
  const { membership } = await apiPost(`/api/athletes/admin/memberships/${membershipId}/status`, {
    status,
  })
  return { membership: toCamelMembership(membership) }
}

export async function deleteMembershipRequest(membershipId) {
  const result = await apiDelete(
    `/api/athletes/admin/memberships/${encodeURIComponent(membershipId)}`,
  )
  return { deletedMembership: result.deletedMembership }
}

export async function deleteRegistrationRequest(registrationId) {
  const result = await apiDelete(
    `/api/athletes/admin/registrations/${encodeURIComponent(registrationId)}`,
  )
  return { deletedRegistration: result.deletedRegistration }
}

/** Publica u oculta una inscripción del padrón público del evento. */
export async function setRegistrationPublicVisibility(registrationId, publicVisible) {
  const { registration } = await apiPost(
    `/api/athletes/admin/registrations/${encodeURIComponent(registrationId)}/public-visibility`,
    { publicVisible },
  )
  return { registration: toCamelRegistrationEntry({ registration }) }
}

/** Rota la credencial de la persona: invalida la card impresa de ese atleta. */
export async function rotateAthleteCredentialToken(athleteId) {
  const { athlete } = await apiPost(`/api/athletes/admin/${athleteId}/rotate-credential`, {})
  return { athlete: toCamelAthlete(athlete) }
}

/**
 * Borrado definitivo del atleta y todo lo asociado. El backend exige el
 * permiso granular admin.athletes.delete.
 */
export async function deleteAthleteRequest(athleteId) {
  const result = await apiDelete(`/api/athletes/admin/${encodeURIComponent(athleteId)}`)
  return { deletedAthlete: result.deletedAthlete }
}

/** Edición admin de un atleta (status/gym). Requiere admin.athletes.write. */
export async function updateAthleteAdminRequest(athleteId, patch) {
  const { athlete } = await apiPatch(`/api/athletes/admin/${encodeURIComponent(athleteId)}`, patch)
  return { athlete: toCamelAthlete(athlete) }
}

/**
 * Edición en bloque — partial success: `failed` trae los ids que no se
 * pudieron actualizar sin frenar al resto del lote.
 */
export async function bulkUpdateAthletesRequest(athleteIds, patch) {
  const { updated, failed } = await apiPatch('/api/athletes/admin/bulk', { athleteIds, patch })
  return { updated: (updated ?? []).map(toCamelAthlete), failed: failed ?? [] }
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
