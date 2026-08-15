import { HttpError } from '../../lib/errors.js'
import { maskEmail } from '../../lib/logger.js'
import { diagnosePaymentFailure, explainPaymentStatusDetail } from './paymentFailureCatalog.js'

/**
 * paymentForensics.js — PLU ARG
 *
 * Reconstruye la vida completa de un cobro a partir de las cinco fuentes que
 * hasta ahora habia que cruzar a mano en la base:
 *
 *   athlete_payment_orders / ticket_orders   la orden
 *   athlete_payments / ticket_payments       los asientos canonicos
 *   embedded_payment_attempts                los intentos del Brick
 *   payment_integration_events               las notificaciones de MP
 *   operational_event_logs                   la bitacora de etapas y fallas
 *
 * Devuelve una sola linea de tiempo ordenada, con cuanto paso entre cada paso,
 * y un veredicto: hasta donde llego el cobro, donde se corto y que hacer.
 *
 * Tambien resuelve la pregunta inversa: dado un `requestId`, que pasó en esa
 * operacion puntual (`buildRequestTimeline`).
 */

/** Secuencia canonica de un cobro. El indice indica cuanto avanzo. */
const STAGE_ORDER = [
  'order_created',
  'checkout_opened',
  'attempt_claimed',
  'provider_submitted',
  'payment_registered',
  'accredited',
  'fulfilled',
]

const ACTION_STAGE = {
  'payment.order_created': 'order_created',
  'payment.preference_created': 'checkout_opened',
  'payment.preference_reused': 'checkout_opened',
  'payment.attempt_claimed': 'attempt_claimed',
  'payment.provider_submitted': 'provider_submitted',
  'payment.webhook_received': 'provider_submitted',
  'payment.applied': 'accredited',
  'payment.webhook_processed': 'accredited',
  'payment.reconciled': 'accredited',
}

/**
 * Etapa que evidencia una entrada de la linea de tiempo.
 *
 * No alcanza con leer la bitacora: los cobros anteriores a la instrumentacion
 * no la tienen, y ahi el avance se subestimaba. Las tablas transaccionales
 * (intentos, notificaciones, ledger, dominio) son evidencia igual de valida y
 * existen desde siempre.
 */
function stageOf(item) {
  if (ACTION_STAGE[item.event]) return ACTION_STAGE[item.event]
  switch (item.source) {
    case 'orden':
      return 'order_created'
    case 'brick':
      return item.status === 'submitted' ? 'provider_submitted' : 'attempt_claimed'
    case 'webhook':
      return item.status === 'processed' ? 'accredited' : 'provider_submitted'
    case 'ledger':
      return item.status === 'aprobado' ? 'accredited' : 'payment_registered'
    case 'dominio':
      return ['activa', 'confirmada'].includes(item.status) ? 'fulfilled' : null
    default:
      return null
  }
}

function toTime(value) {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? null : time
}

function humanGap(ms) {
  if (ms === null || ms === undefined) return null
  if (ms < 1_000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)} h`
  return `${Math.round(ms / 86_400_000)} d`
}

function entry({ at, source, event, status, severity = 'info', detail = {}, failure = null }) {
  return { at, source, event, status: status ?? null, severity, detail, failure }
}

/**
 * Normaliza una falla para el informe: el mensaje, donde se rompio, por donde
 * habia entrado la operacion, que venia pasando y como se resuelve.
 */
function failureOf(metadata) {
  if (!metadata?.error && !metadata?.diagnosis) return null
  const message = metadata?.error?.message ?? null
  const stored = metadata?.diagnosis ?? null
  const current = message ? diagnosePaymentFailure({ message }) : null
  const diagnosis = current && current.code !== 'UNCLASSIFIED_PAYMENT_FAILURE' ? current : (stored ?? current)
  return {
    message,
    code: metadata?.error?.code ?? null,
    status: metadata?.error?.status ?? null,
    stage: metadata?.stage ?? null,
    entrypoint: metadata?.entrypoint ?? null,
    requestId: metadata?.requestId ?? null,
    origin: metadata?.error?.origin ?? null,
    provider: metadata?.error?.provider ?? null,
    stack: metadata?.error?.stack ?? null,
    trail: metadata?.trail ?? null,
    diagnosis,
  }
}

async function readOrder(client, organizationId, orderId) {
  const athlete = await client
    .from('athlete_payment_orders')
    .select(
      '*, athlete:athletes(id, full_name, email, document_id), registration:event_registrations(id, status, division, category, created_at, event:events(id, title, slug, starts_at))',
    )
    .eq('id', orderId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (athlete.error) throw new HttpError(503, athlete.error.message)
  if (athlete.data) return { kind: 'athlete', row: athlete.data }

  const ticket = await client
    .from('ticket_orders')
    .select('*, event:events(id, title, slug, starts_at)')
    .eq('id', orderId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (ticket.error) throw new HttpError(503, ticket.error.message)
  if (ticket.data) return { kind: 'ticket', row: ticket.data }

  throw new HttpError(404, 'Orden no encontrada.')
}

/**
 * Linea de tiempo completa de una orden.
 *
 * @param {object} client Cliente Supabase con service role.
 * @param {{orderId: string, organizationId: string}} params
 */
export async function buildOrderTimeline(client, { orderId, organizationId }) {
  const { kind, row: order } = await readOrder(client, organizationId, orderId)
  const paymentsTable = kind === 'ticket' ? 'ticket_payments' : 'athlete_payments'

  const [payments, attempts, auditLogs] = await Promise.all([
    client.from(paymentsTable).select('*').eq('order_id', orderId).order('created_at'),
    client.from('embedded_payment_attempts').select('*').eq('order_id', orderId).order('created_at'),
    client
      .from('operational_event_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('entity_id', orderId)
      .order('created_at'),
  ])

  const paymentRows = payments.data ?? []
  const attemptRows = attempts.data ?? []
  const auditRows = auditLogs.data ?? []

  // Las notificaciones de MP se buscan por el id de pago: `resource_id` no
  // conoce la orden, y ese salto es justamente el que costaba hacer a mano.
  const resourceIds = [
    ...new Set([
      ...paymentRows.map((payment) => payment.external_payment_id),
      ...attemptRows.map((attempt) => attempt.external_payment_id),
    ].filter(Boolean).map(String)),
  ]
  const integrationEvents = resourceIds.length
    ? (await client
        .from('payment_integration_events')
        .select('*')
        .in('resource_id', resourceIds)
        .order('received_at')).data ?? []
    : []

  const timeline = []

  timeline.push(entry({
    at: order.created_at,
    source: 'orden',
    event: 'order.created',
    status: order.status,
    severity: 'info',
    detail: {
      concept: kind === 'ticket' ? 'tickets' : order.concept,
      amount: order.amount,
      currency: order.currency,
      method: order.method ?? order.provider,
      reference: order.reference,
      payerEmail: order.payer_email ? maskEmail(order.payer_email) : null,
    },
  }))

  for (const log of auditRows) {
    const failure = log.status === 'failed' ? failureOf(log.metadata) : null
    timeline.push(entry({
      at: log.created_at,
      source: log.source === 'payment' ? 'bitacora' : log.source,
      event: log.action,
      status: log.status,
      severity: log.severity,
      detail: {
        stage: log.metadata?.stage ?? null,
        requestId: log.metadata?.requestId ?? null,
        entrypoint: log.metadata?.entrypoint ?? null,
        externalPaymentId: log.metadata?.externalPaymentId ?? null,
        providerStatus: log.metadata?.providerStatus ?? null,
        statusDetail: log.metadata?.statusDetail ?? null,
      },
      failure,
    }))
  }

  for (const attempt of attemptRows) {
    timeline.push(entry({
      at: attempt.created_at,
      source: 'brick',
      event: `attempt.${attempt.status}`,
      status: attempt.status,
      severity: attempt.status === 'failed' ? 'danger' : 'info',
      detail: {
        attemptId: attempt.id,
        externalPaymentId: attempt.external_payment_id,
        reconciliation: attempt.reconciliation_status,
        reconciliationAttempts: attempt.reconciliation_attempts,
        operationKind: attempt.operation_kind,
      },
      failure: attempt.error ? { message: attempt.error, diagnosis: diagnosePaymentFailure({ message: attempt.error }) } : null,
    }))
  }

  for (const event of integrationEvents) {
    timeline.push(entry({
      at: event.received_at,
      source: 'webhook',
      event: `webhook.${event.event_type}${event.action ? `:${event.action}` : ''}`,
      status: event.status,
      severity: event.status === 'failed' ? 'danger' : event.status === 'processed' ? 'success' : 'info',
      detail: {
        notificationId: event.notification_id,
        resourceId: event.resource_id,
        attempts: `${event.attempts_count}/${event.max_attempts ?? '?'}`,
        providerRequestId: event.request_id,
        processedAt: event.processed_at,
      },
      failure: event.error ? { message: event.error, diagnosis: diagnosePaymentFailure({ message: event.error }) } : null,
    }))
  }

  for (const payment of paymentRows) {
    timeline.push(entry({
      at: payment.confirmed_at ?? payment.updated_at ?? payment.created_at,
      source: 'ledger',
      event: `payment.${payment.status}`,
      status: payment.status,
      severity: payment.status === 'aprobado' ? 'success' : payment.status === 'rechazado' ? 'danger' : 'info',
      detail: {
        externalPaymentId: payment.external_payment_id,
        amount: payment.amount,
        currency: payment.currency,
        statusDetail: payment.status_detail,
        statusDetailMeaning: explainPaymentStatusDetail(payment.status_detail),
        payerEmail: payment.payer_email ? maskEmail(payment.payer_email) : null,
      },
    }))
  }

  // Efecto de negocio: sin esto no se distingue "cobrado" de "cobrado y
  // efectivamente afiliado", que es la falla mas cara de detectar.
  let fulfillment = null
  if (kind === 'athlete') {
    const [membership, registration] = await Promise.all([
      client.from('memberships').select('*').eq('payment_order_id', orderId).maybeSingle(),
      client.from('event_registrations').select('*, event:events(title, slug)').eq('payment_order_id', orderId).maybeSingle(),
    ])
    if (membership.data) {
      fulfillment = { type: 'membership', status: membership.data.status, memberCode: membership.data.member_code }
      timeline.push(entry({
        at: membership.data.created_at,
        source: 'dominio',
        event: `membership.${membership.data.status}`,
        status: membership.data.status,
        severity: membership.data.status === 'activa' ? 'success' : 'warning',
        detail: {
          membershipId: membership.data.id,
          year: membership.data.year,
          memberCode: membership.data.member_code,
          expiresAt: membership.data.expiration_date,
        },
      }))
    }
    if (registration.data) {
      fulfillment = fulfillment ?? { type: 'registration', status: registration.data.status }
      timeline.push(entry({
        at: registration.data.created_at,
        source: 'dominio',
        event: `registration.${registration.data.status}`,
        status: registration.data.status,
        severity: registration.data.status === 'confirmada' ? 'success' : 'info',
        detail: {
          registrationId: registration.data.id,
          event: registration.data.event?.title ?? null,
          division: registration.data.division,
          category: registration.data.category,
        },
      }))
    }
  }

  timeline.sort((a, b) => (toTime(a.at) ?? 0) - (toTime(b.at) ?? 0))

  // Espera entre pasos: hace visible donde se quedo parado el cobro.
  let previous = null
  for (const item of timeline) {
    const current = toTime(item.at)
    item.sincePreviousMs = previous !== null && current !== null ? current - previous : null
    item.sincePrevious = humanGap(item.sincePreviousMs)
    if (current !== null) previous = current
  }

  return { kind, order, fulfillment, timeline, ...verdictFor({ kind, order, timeline, fulfillment }) }
}

/**
 * Hasta donde llego el cobro y que hacer con lo que quedo. Es la lectura que
 * antes tenia que hacer una persona mirando cinco tablas.
 */
function verdictFor({ kind, order, timeline, fulfillment }) {
  const reached = timeline
    .map(stageOf)
    .filter(Boolean)
    .reduce((max, stage) => Math.max(max, STAGE_ORDER.indexOf(stage)), -1)

  const accredited = order.status === 'aprobado'
  const expectsFulfillment = kind === 'athlete' && ['membership', 'combo', 'registration'].includes(order.concept)
  const fulfilled = !expectsFulfillment
    || fulfillment?.status === 'activa'
    || fulfillment?.status === 'confirmada'

  const failures = timeline.filter((item) => item.failure).map((item) => ({
    at: item.at,
    event: item.event,
    ...item.failure,
  }))
  const expiresAt = toTime(order.expires_at)
  const cancelledAt = toTime(order.updated_at)
  const checkoutOpenedAt = timeline.find((item) => stageOf(item) === 'checkout_opened')?.at ?? null
  const cancellation = order.status === 'cancelado'
    // El cron de dominio vence la orden al minuto siguiente de expirar. Limitar
    // la ventana evita atribuir como vencimiento una cancelacion manual tardia.
    && expiresAt !== null
    && cancelledAt !== null
    && cancelledAt >= expiresAt
    && cancelledAt - expiresAt <= 5 * 60 * 1000
    ? {
        code: 'expired_without_payment',
        expiresAt: order.expires_at,
        cancelledAt: order.updated_at,
        checkoutOpenedAt,
        paymentEvidence: timeline.some((item) => item.source === 'ledger'),
        providerPaymentStarted: reached >= STAGE_ORDER.indexOf('provider_submitted'),
      }
    : null

  let verdict
  if (accredited && fulfilled) {
    verdict = { state: 'ok', summary: 'Cobrado y acreditado en el dominio.', action: null }
  } else if (accredited && !fulfilled) {
    // El peor caso: el atleta pago y no tiene lo que compro.
    verdict = {
      state: 'critical',
      summary: 'El pago se acredito pero el efecto de negocio no se aplico.',
      action: 'Revisar la RPC de acreditacion y reprocesar desde Panel > Pagos > Recuperar operaciones.',
    }
  } else if (failures.length) {
    const worst = failures[failures.length - 1]
    verdict = {
      state: worst.diagnosis?.severity === 'expected' ? 'expected' : 'blocked',
      summary: worst.diagnosis?.title ?? worst.message ?? 'El cobro se corto por una falla.',
      action: worst.diagnosis?.fix?.[0] ?? null,
    }
  } else if (cancellation?.code === 'expired_without_payment') {
    verdict = {
      state: 'closed',
      summary: 'La orden vencio automaticamente sin un pago iniciado.',
      action: 'No acreditar manualmente. Generar una orden nueva; si la persona informa un debito, revalidar primero contra Mercado Pago.',
    }
  } else if (['cancelado', 'rechazado', 'reembolsado'].includes(order.status)) {
    verdict = { state: 'closed', summary: `La orden termino en ${order.status}.`, action: null }
  } else {
    verdict = {
      state: 'pending',
      summary: `El cobro quedo en "${STAGE_ORDER[Math.max(reached, 0)]}" sin acreditarse.`,
      action: reached < STAGE_ORDER.indexOf('provider_submitted')
        ? 'El atleta nunca llego a enviar el pago: no hay plata en juego.'
        : 'Hay un pago enviado sin acreditar: forzar la conciliacion desde Panel > Pagos.',
    }
  }

  return {
    verdict,
    stageReached: STAGE_ORDER[Math.max(reached, 0)],
    failures,
    cancellation,
  }
}

/**
 * Recorrido de afiliacion de un atleta, de punta a punta: alta, verificacion
 * de correo, ordenes emitidas, pagos y membresias.
 *
 * Responde la consulta mas frecuente de soporte -- "me afilie y no me llego la
 * credencial" -- diciendo en que eslabon se corto, sin pedir el id de nada.
 */
export async function buildAthleteTimeline(client, { athleteId, email, documentId, organizationId }) {
  let query = client
    .from('athletes')
    .select('id, full_name, email, document_id, status, created_at, email_verified_at')
    .eq('organization_id', organizationId)
  if (athleteId) query = query.eq('id', athleteId)
  else if (email) query = query.eq('email', String(email).toLowerCase())
  else if (documentId) query = query.eq('document_id', String(documentId))
  else throw new HttpError(400, 'Indicá un atleta por id, correo o documento.')

  const { data: athlete, error } = await query.maybeSingle()
  if (error) throw new HttpError(503, error.message)
  if (!athlete) throw new HttpError(404, 'Atleta no encontrado.')

  const [orders, memberships, registrations, logs] = await Promise.all([
    client
      .from('athlete_payment_orders')
      .select('id, concept, status, amount, currency, method, created_at, approved_at')
      .eq('athlete_id', athlete.id)
      .order('created_at'),
    client
      .from('memberships')
      .select('id, year, status, member_code, start_date, expiration_date, payment_order_id, created_at')
      .eq('athlete_id', athlete.id)
      .order('created_at'),
    client
      .from('event_registrations')
      .select('id, status, division, category, payment_order_id, created_at, event:events(title, slug)')
      .eq('athlete_id', athlete.id)
      .order('created_at'),
    client
      .from('operational_event_logs')
      .select('action, status, severity, created_at, metadata, source')
      .eq('organization_id', organizationId)
      .eq('entity_id', athlete.id)
      .order('created_at'),
  ])

  const timeline = [
    entry({
      at: athlete.created_at,
      source: 'identidad',
      event: 'athlete.created',
      status: athlete.status,
      severity: 'info',
      detail: { email: maskEmail(athlete.email), documentId: athlete.document_id },
    }),
    ...(athlete.email_verified_at
      ? [entry({
          at: athlete.email_verified_at,
          source: 'identidad',
          event: 'athlete.email_verified',
          status: 'verificado',
          severity: 'success',
          detail: {},
        })]
      : []),
    ...(logs.data ?? []).map((log) => entry({
      at: log.created_at,
      source: log.source === 'identity' ? 'identidad' : log.source,
      event: log.action,
      status: log.status,
      severity: log.severity,
      detail: { requestId: log.metadata?.requestId ?? null, reason: log.metadata?.reason ?? null },
      failure: log.status === 'failed' ? failureOf(log.metadata) : null,
    })),
    ...(orders.data ?? []).map((order) => entry({
      at: order.created_at,
      source: 'orden',
      event: `order.${order.concept}`,
      status: order.status,
      severity: order.status === 'aprobado' ? 'success' : order.status === 'pendiente' ? 'info' : 'warning',
      detail: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        method: order.method,
        approvedAt: order.approved_at,
      },
    })),
    ...(memberships.data ?? []).map((membership) => entry({
      at: membership.created_at,
      source: 'dominio',
      event: `membership.${membership.status}`,
      status: membership.status,
      severity: membership.status === 'activa' ? 'success' : 'warning',
      detail: {
        year: membership.year,
        memberCode: membership.member_code,
        expiresAt: membership.expiration_date,
        orderId: membership.payment_order_id,
      },
    })),
    ...(registrations.data ?? []).map((registration) => entry({
      at: registration.created_at,
      source: 'dominio',
      event: `registration.${registration.status}`,
      status: registration.status,
      severity: registration.status === 'confirmada' ? 'success' : 'info',
      detail: {
        event: registration.event?.title ?? null,
        division: registration.division,
        category: registration.category,
        orderId: registration.payment_order_id,
      },
    })),
  ].sort((a, b) => (toTime(a.at) ?? 0) - (toTime(b.at) ?? 0))

  // Donde se corta el embudo de afiliacion. Cada eslabon explica el siguiente.
  const paidMembershipOrders = (orders.data ?? []).filter(
    (order) => ['membership', 'combo'].includes(order.concept) && order.status === 'aprobado',
  )
  const activeMembership = (memberships.data ?? []).find((membership) => membership.status === 'activa')

  const funnel = [
    { step: 'alta', done: true, at: athlete.created_at },
    { step: 'email_verificado', done: Boolean(athlete.email_verified_at), at: athlete.email_verified_at },
    {
      step: 'orden_emitida',
      done: (orders.data ?? []).some((order) => ['membership', 'combo'].includes(order.concept)),
    },
    { step: 'pago_acreditado', done: paidMembershipOrders.length > 0 },
    { step: 'afiliacion_activa', done: Boolean(activeMembership) },
  ]
  const brokenAt = funnel.find((step) => !step.done)

  return {
    athlete: { ...athlete, email: maskEmail(athlete.email) },
    timeline,
    funnel,
    verdict: !brokenAt
      ? { state: 'ok', summary: 'Afiliacion completa y activa.', action: null }
      : paidMembershipOrders.length > 0 && !activeMembership
        ? {
            state: 'critical',
            summary: 'Pago acreditado sin afiliacion activa.',
            action: `Revisar la orden ${paidMembershipOrders.at(-1).id} con \`npm run payments:trace\` y reprocesar desde Panel > Pagos.`,
          }
        : {
            state: 'pending',
            summary: `El recorrido se corta en "${brokenAt.step}".`,
            action: brokenAt.step === 'email_verificado'
              ? 'El atleta no confirmo su correo: afiliarse lo exige. Reenviar el enlace.'
              : brokenAt.step === 'orden_emitida'
                ? 'Nunca inicio el checkout de afiliacion.'
                : 'Hay orden emitida sin pago acreditado: ver la traza de esa orden.',
          },
  }
}

/**
 * Que pasó en una operacion puntual. El requestId sale del header
 * `X-Request-Id`, del cuerpo de un error 500 o de cualquier linea del log.
 */
export async function buildRequestTimeline(client, { requestId, organizationId }) {
  const { data, error } = await client
    .from('operational_event_logs')
    .select('*')
    .eq('organization_id', organizationId)
    .contains('metadata', { requestId })
    .order('created_at')
  if (error) throw new HttpError(503, error.message)
  if (!data?.length) throw new HttpError(404, 'No hay asientos para ese requestId.')

  return {
    requestId,
    entrypoint: data.find((row) => row.metadata?.entrypoint)?.metadata?.entrypoint ?? null,
    entries: data.map((row) => ({
      at: row.created_at,
      source: row.source,
      event: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: row.status,
      severity: row.severity,
      stage: row.metadata?.stage ?? null,
      failure: row.status === 'failed' ? failureOf(row.metadata) : null,
    })),
  }
}
