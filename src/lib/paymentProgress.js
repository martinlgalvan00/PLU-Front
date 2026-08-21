/**
 * paymentProgress.js — PLU ARG
 *
 * Un solo lugar que contesta "¿en qué estado está realmente este cobro?".
 *
 * El estado de la orden (`athlete_payment_orders.status`) es el agregado que
 * calcula la base sobre TODOS los intentos del pedido: si hay uno aprobado, la
 * orden está aprobada. Los intentos individuales, en cambio, cuentan otra
 * historia — una orden aprobada puede tener adelante un intento rechazado por
 * prevención de fraude y otro que entró seis horas después.
 *
 * Mezclar los dos niveles es lo que hacía que un cobro acreditado en Mercado
 * Pago se mostrara (y se avisara por mail) como rechazado: se leía el último
 * intento en lugar del agregado. Acá el agregado manda siempre, y los intentos
 * quedan como historial visible en vez de pisar el estado.
 *
 * Es pura y no traduce: devuelve claves y códigos estables para que la UI los
 * pase por i18n y el backend los sirva tal cual.
 */

/** Etapas por canal de cobro. La última es siempre la acreditación. */
const STAGES_BY_CHANNEL = Object.freeze({
  mercado_pago: ['creada', 'pagando', 'acreditado'],
  bank_transfer: ['creada', 'comprobante', 'revision', 'acreditado'],
  wise_transfer: ['creada', 'comprobante', 'revision', 'acreditado'],
  cash_pitbull: ['creada', 'pago_en_sede', 'acreditado'],
})

const TONE_BY_STATE = Object.freeze({
  acreditado: 'success',
  en_revision: 'warning',
  esperando_comprobante: 'warning',
  esperando_pago: 'warning',
  esperando_pago_en_sede: 'warning',
  procesando: 'warning',
  revision_pendiente: 'warning',
  rechazado: 'danger',
  cancelado: 'danger',
  reembolsado: 'danger',
})

/** Intentos que todavía no resolvieron: la plata está en camino. */
const IN_FLIGHT_ATTEMPT_STATUSES = new Set(['pendiente'])

/** El canal define las etapas y qué se espera del atleta en cada una. */
export function paymentChannelOf(order = {}) {
  const method = order.method ?? order.provider ?? null
  if (method === 'mercado_pago') return 'mercado_pago'
  const channel = order.manualPaymentChannel ?? order.manual_payment_channel ?? null
  if (channel && STAGES_BY_CHANNEL[channel]) return channel
  // Una orden manual sin canal declarado es el caso histórico: transferencia.
  return 'bank_transfer'
}

function normalizeAttempt(attempt = {}) {
  const rawStatus = attempt.status ?? null
  return {
    id: attempt.external_payment_id ?? attempt.externalPaymentId ?? attempt.id ?? null,
    status: rawStatus,
    // El código crudo de Mercado Pago (`cc_rejected_high_risk`) es la clave
    // estable: la UI lo traduce, el panel lo muestra tal cual.
    reasonCode: attempt.status_detail ?? attempt.statusDetail ?? null,
    amount: attempt.amount ?? null,
    at:
      attempt.confirmed_at ??
      attempt.confirmedAt ??
      attempt.updated_at ??
      attempt.updatedAt ??
      attempt.created_at ??
      attempt.createdAt ??
      null,
  }
}

function timeOf(value) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * Motivo por el que una orden cancelada quedó así.
 *
 * "Cancelado" tapa tres cosas que para la persona no tienen nada que ver entre
 * sí, y sin distinguirlas no hay forma de contestar un reclamo:
 *
 *   · nunca llegó a pagar y el cobro venció solo (abandonó el checkout),
 *   · intentó pagar, algo falló y el cobro venció igual,
 *   · lo cerró la organización, con un motivo escrito.
 *
 * El vencimiento no deja rastro propio: el cron sólo mueve `status` y
 * `updated_at`. Se reconoce porque la orden se cerró en el mismo momento en que
 * vencía o después — el cron corre cada tres minutos, así que la ventana es
 * chica y no se confunde con una cancelación de otro origen.
 */
function cancellationReason(order = {}, { hasAttempts, canonical } = {}) {
  const explicit = order.rejectionReason ?? order.rejection_reason ?? null
  if (explicit) return { reasonCode: 'staff_rejected', reasonText: explicit }

  const expiresAt = order.expiresAt ?? order.expires_at ?? null
  const closedAt = order.updatedAt ?? order.updated_at ?? null
  if (expiresAt && closedAt && timeOf(closedAt) >= timeOf(expiresAt)) {
    return {
      reasonCode: hasAttempts ? 'expired_after_attempt' : 'expired_without_attempt',
      reasonText: null,
      expiredAt: expiresAt,
      attemptReasonCode: canonical?.reasonCode ?? null,
    }
  }
  // Cancelación que no vino del vencimiento: si el proveedor reportó el pago
  // como cancelado, ese es el origen.
  if (canonical?.status === 'cancelado') {
    return { reasonCode: 'provider_cancelled', reasonText: null }
  }
  return {
    reasonCode: hasAttempts ? 'closed_after_attempt' : 'closed_without_attempt',
    reasonText: null,
    attemptReasonCode: canonical?.reasonCode ?? null,
  }
}

/**
 * Estados en los que el derecho asociado (afiliación o inscripción) está
 * efectivamente otorgado. Si el cobro murió y el derecho igual está otorgado, es
 * porque se resolvió por otra vía — típicamente una activación manual desde el
 * panel. Sin decirlo, la cuenta se contradice sola: "Afiliación: activa" contra
 * "Pagos: afiliación cancelada".
 */
const GRANTED_OUTCOME_STATUSES = new Set(['activa', 'confirmada', 'pagada'])

function hasProof(order = {}) {
  return Boolean(order.paymentProofUploadedAt ?? order.payment_proof_uploaded_at ?? null)
}

/**
 * Estado real de un cobro, con su historial de intentos.
 *
 * @param {{ order: object, attempts?: object[] }} input
 * @returns {{
 *   state: string,
 *   tone: string,
 *   channel: string,
 *   stages: Array<{ key: string, done: boolean, current: boolean }>,
 *   settled: boolean,
 *   open: boolean,
 *   mismatch: boolean,
 *   reasonCode: string|null,
 *   reasonText: string|null,
 *   action: string|null,
 *   attempts: Array<object>,
 *   failedAttempts: number,
 * }}
 */
export function derivePaymentProgress({ order = {}, attempts = [], outcome = null } = {}) {
  const channel = paymentChannelOf(order)
  const status = order.status ?? null
  const normalized = [...(attempts ?? [])]
    .map(normalizeAttempt)
    .sort((a, b) => timeOf(a.at) - timeOf(b.at))

  const approvedAttempt = normalized.find((attempt) => attempt.status === 'aprobado') ?? null
  const inFlight = normalized.some((attempt) => IN_FLIGHT_ATTEMPT_STATUSES.has(attempt.status))
  const failedAttempts = normalized.filter((attempt) =>
    ['rechazado', 'cancelado'].includes(attempt.status),
  ).length

  // El intento que explica el estado actual: el aprobado si hay, y si no el
  // último que se movió. Nunca "el más nuevo" a secas — ese es justamente el
  // criterio que reportaba rechazos sobre órdenes ya cobradas.
  const canonical = approvedAttempt ?? normalized.at(-1) ?? null

  let state
  let reasonCode = null
  let reasonText = null
  let expiredAt = null
  let attemptReasonCode = null

  if (status === 'aprobado') {
    state = 'acreditado'
  } else if (status === 'reembolsado') {
    state = 'reembolsado'
  } else if (approvedAttempt) {
    // La orden no está aprobada pero hay un intento acreditado: la plata entró
    // y el agregado no lo refleja. Se muestra como pendiente de revisión, nunca
    // como rechazo, y queda marcado para que Finanzas lo vea.
    state = 'revision_pendiente'
  } else if (status === 'rechazado') {
    state = 'rechazado'
    reasonText = order.rejectionReason ?? order.rejection_reason ?? null
    reasonCode = canonical?.reasonCode ?? (reasonText ? 'staff_rejected' : null)
  } else if (status === 'cancelado') {
    state = 'cancelado'
    const reason = cancellationReason(order, {
      hasAttempts: normalized.length > 0,
      canonical,
    })
    reasonCode = reason.reasonCode
    reasonText = reason.reasonText
    expiredAt = reason.expiredAt ?? null
    attemptReasonCode = reason.attemptReasonCode ?? null
  } else if (status === 'validacion_manual') {
    state = 'en_revision'
  } else if (channel === 'cash_pitbull') {
    state = 'esperando_pago_en_sede'
  } else if (channel !== 'mercado_pago') {
    state = hasProof(order) ? 'en_revision' : 'esperando_comprobante'
  } else if (inFlight) {
    state = 'procesando'
    reasonCode = canonical?.reasonCode ?? null
  } else {
    state = 'esperando_pago'
  }

  const settled = state === 'acreditado'
  const stageKeys = STAGES_BY_CHANNEL[channel] ?? STAGES_BY_CHANNEL.mercado_pago
  const reached = resolveReachedStage({ state, channel, stageKeys, order, hasAttempts: normalized.length > 0 })

  // El derecho quedó otorgado con el cobro muerto: pasó por otra vía (una
  // activación manual desde el panel). Es el dato que le faltaba a la cuenta
  // para no contradecirse con la sección de Afiliación.
  const granted = Boolean(outcome && GRANTED_OUTCOME_STATUSES.has(outcome.status))
  const resolvedElsewhere = granted && !settled

  return {
    outcome: outcome ? { ...outcome, granted } : null,
    resolvedElsewhere,
    expiredAt,
    attemptReasonCode,
    state,
    tone: TONE_BY_STATE[state] ?? 'neutral',
    channel,
    stages: stageKeys.map((key, index) => ({
      key,
      done: index < reached || settled,
      current: !settled && index === reached,
    })),
    settled,
    open: ['esperando_pago', 'esperando_comprobante', 'esperando_pago_en_sede', 'procesando', 'en_revision'].includes(
      state,
    ),
    mismatch: state === 'revision_pendiente',
    reasonCode,
    reasonText,
    action: resolveAction({ state, channel }),
    attempts: normalized,
    failedAttempts,
  }
}

/**
 * Forma de cable del progreso. Un solo contrato para el estado público de una
 * orden y para la sesión del atleta, y sin nada del proveedor que no haga falta
 * mostrar: del intento sólo viaja su id, su estado, su código de motivo y
 * cuándo se movió.
 */
export function serializePaymentProgress(progress) {
  return {
    state: progress.state,
    tone: progress.tone,
    channel: progress.channel,
    stages: progress.stages,
    settled: progress.settled,
    open: progress.open,
    mismatch: progress.mismatch,
    reasonCode: progress.reasonCode,
    reasonText: progress.reasonText,
    expiredAt: progress.expiredAt,
    attemptReasonCode: progress.attemptReasonCode,
    outcome: progress.outcome,
    resolvedElsewhere: progress.resolvedElsewhere,
    action: progress.action,
    failedAttempts: progress.failedAttempts,
    attempts: progress.attempts.map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      reasonCode: attempt.reasonCode,
      amount: attempt.amount,
      at: attempt.at,
    })),
  }
}

/** Índice de la etapa donde está parado el cobro. */
function resolveReachedStage({ state, channel, stageKeys, order, hasAttempts }) {
  if (state === 'acreditado' || state === 'reembolsado') return stageKeys.length - 1
  if (state === 'en_revision' || state === 'revision_pendiente') {
    const index = stageKeys.indexOf('revision')
    return index >= 0 ? index : stageKeys.length - 2
  }
  if (state === 'procesando') return stageKeys.indexOf('pagando')
  if (state === 'esperando_comprobante') return stageKeys.indexOf('comprobante')
  if (state === 'esperando_pago_en_sede') return stageKeys.indexOf('pago_en_sede')
  if (state === 'rechazado' || state === 'cancelado') {
    // Un cobro muerto se muestra donde se murió, no en la última etapa: es la
    // diferencia entre "no llegó a pagar" y "pagó y se lo rechazaron".
    if (channel === 'mercado_pago') return hasAttempts ? stageKeys.indexOf('pagando') : 0
    return hasProof(order) ? stageKeys.indexOf('revision') : stageKeys.indexOf('comprobante')
  }
  return 0
}

/** Qué puede hacer el atleta ahora mismo. */
function resolveAction({ state, channel }) {
  if (state === 'esperando_comprobante') return 'upload_proof'
  if (state === 'esperando_pago') return channel === 'mercado_pago' ? 'pay' : null
  if (state === 'rechazado' || state === 'cancelado') return 'retry'
  if (state === 'procesando' || state === 'en_revision' || state === 'revision_pendiente') {
    return 'wait'
  }
  return null
}
