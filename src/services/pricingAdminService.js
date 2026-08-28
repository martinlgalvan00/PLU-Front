import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'

function dateTimeToIso(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function mapMembershipPlan(row) {
  return {
    id: row.id,
    code: row.code,
    familyCode: row.family_code ?? row.familyCode ?? row.code,
    version: Number(row.version) || 1,
    name: row.name,
    description: row.description ?? '',
    price: Number(row.price) || 0,
    manualPrice: row.manual_price != null ? Number(row.manual_price) : (row.manualPrice ?? null),
    currency: row.currency ?? 'ARS',
    billingFrequency: row.billing_frequency ?? row.billingFrequency ?? 'annual',
    collectionMode: row.collection_mode ?? row.collectionMode ?? 'one_time',
    intervalCount: Number(row.interval_count ?? row.intervalCount) || 1,
    graceDays: Number(row.grace_days ?? row.graceDays) || 0,
    providerPlanId: row.provider_plan_id ?? row.providerPlanId ?? null,
    active: row.active !== false,
    effectiveFrom: row.effective_from ?? row.effectiveFrom ?? null,
    retiredAt: row.retired_at ?? row.retiredAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

export function mapDiscountCode(row) {
  const fixedPrice = row.fixed_price ?? row.fixedPrice ?? null
  const fixedPriceManual = row.fixed_price_manual ?? row.fixedPriceManual ?? null
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? '',
    // Los cupones creados antes de que existiera el precio promocional no
    // traen `kind`: son todos de porcentaje.
    kind: row.kind ?? (fixedPrice != null ? 'fixed_price' : 'percent'),
    percentOff: Number(row.percent_off ?? row.percentOff) || 0,
    fixedPrice: fixedPrice != null ? Number(fixedPrice) : null,
    // Importe final para transferencia y efectivo. `null` = cobra lo mismo que
    // `fixedPrice` en cualquier canal.
    fixedPriceManual: fixedPriceManual != null ? Number(fixedPriceManual) : null,
    // Quien accede a la promo: 'code' hay que tipearla, 'public' se aplica
    // sola. Las promos anteriores a la audiencia eran todas por codigo.
    audience: row.audience === 'public' ? 'public' : 'code',
    appliesTo: row.applies_to ?? row.appliesTo ?? 'membership',
    // Afiliación que empaqueta la oferta. Null en el resto de las modalidades:
    // el paquete sale del combo del evento (20260913100000).
    membershipPlanId: row.membership_plan_id ?? row.membershipPlanId ?? null,
    // Inscripción a la que está atado el código. Null = cualquiera, que es como
    // se comportaban todos los códigos antes de 20260902100000.
    eventId: row.event_id ?? row.eventId ?? null,
    eventSlug: row.event_slug ?? row.eventSlug ?? null,
    eventTitle: row.event_title ?? row.eventTitle ?? null,
    maxRedemptions: row.max_redemptions ?? row.maxRedemptions ?? null,
    // Ventana de la promo. `startsAt` null = vigente desde que está encendida.
    startsAt: row.starts_at ?? row.startsAt ?? null,
    expiresAt: row.expires_at ?? row.expiresAt ?? null,
    active: row.active !== false,
    // Emails con acceso exclusivo. Lista vacía = promo abierta.
    invitees: Array.isArray(row.invitees) ? row.invitees : [],
    // Canales manuales que el código destraba. Los códigos anteriores a la
    // lista sólo traen el booleano: `true` significaba los dos canales.
    manualChannels:
      row.manual_channels ??
      row.manualChannels ??
      ((row.enables_manual_payment ?? row.enablesManualPayment)
        ? ['bank_transfer', 'cash_pitbull']
        : []),
    // Mercado Pago para este código. `false` lo cierra (20260908100000);
    // ausente = abierto, que es como se comportaban todos los códigos antes.
    mercadoPagoEnabled: (row.mercado_pago_enabled ?? row.mercadoPagoEnabled) !== false,
    // Financiamiento del código (20260912100000): quien lo canjea puede declarar
    // el pago manual y queda habilitado mientras Finanzas valida. Antes era una
    // condición del combo del evento, compartida por todos sus códigos.
    financed: (row.financed ?? false) === true,
    // Plazo de pago del financiamiento (20260922100000). El servidor lo devuelve
    // desde esa migración, pero este mapper lo descartaba: `openCodeForm` leía
    // `source.financingTermDays ?? 7` y por lo tanto SIEMPRE 7, así que abrir
    // para editar un código de 30 días mostraba 7 y guardarlo le reescribía el
    // plazo sin que nadie lo hubiera tocado. Null cuando el código no financia.
    financingTermDays:
      Number(row.financing_term_days ?? row.financingTermDays) || null,
    redeemedCount: Number(row.redeemed_count ?? row.redeemedCount) || 0,
    // Cuánta gente canjeó la llave, contra `redeemedCount`, que es cuánta la
    // usó para comprar. Son dos números distintos en una oferta secreta.
    unlockedCount: Number(row.unlocked_count ?? row.unlockedCount) || 0,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  }
}

/**
 * Proyección operativa de un cupón para el panel. El conteo definitivo vive
 * en Postgres y se actualiza al crear la orden; este helper sólo traduce esa
 * respuesta canónica a estados legibles, sin intentar reservar usos en React.
 */
export function getDiscountCodeAvailability(code = {}, now = new Date()) {
  const maxRedemptions = Number(code.maxRedemptions)
  const hasLimit = Number.isInteger(maxRedemptions) && maxRedemptions > 0
  const redeemedCount = Math.max(0, Number(code.redeemedCount) || 0)
  const remaining = hasLimit ? Math.max(0, maxRedemptions - redeemedCount) : null
  const exhausted = hasLimit && remaining === 0
  const expired = Boolean(code.expiresAt) && new Date(code.expiresAt) < now
  // Programada: encendida pero todavía no abrió. No es lo mismo que apagada —
  // el operador ya la dejó lista y no tiene que volver a tocarla.
  const scheduled = Boolean(code.startsAt) && new Date(code.startsAt) > now
  const inviteeCount = Array.isArray(code.invitees) ? code.invitees.length : 0

  let status = 'active'
  // El cupón se desactiva automáticamente al llegar al límite. Se prioriza
  // "agotado" por encima de "inactivo" para explicarle al operador qué pasó.
  if (exhausted) status = 'exhausted'
  else if (code.active === false) status = 'inactive'
  else if (expired) status = 'expired'
  else if (scheduled) status = 'scheduled'

  return {
    scheduled,
    // La exclusividad se deriva de la lista: no hay un flag aparte que pueda
    // quedar encendido sobre una lista vacía.
    exclusive: inviteeCount > 0,
    inviteeCount,
    // El estado que edita el operador, en un solo valor. Se deriva de los dos
    // ejes que guarda la base (`active` × `audience`) porque el interruptor de
    // encendido lo escribe también el cierre automático por cupo, y perder la
    // audiencia al agotarse haria que reabrir la promo la volviera restringida
    // sin que nadie lo pidiera.
    state: code.active === false ? 'off' : code.audience === 'public' ? 'public' : 'code',
    hasLimit,
    maxRedemptions: hasLimit ? maxRedemptions : null,
    redeemedCount,
    remaining,
    exhausted,
    progress: hasLimit ? Math.min(100, (redeemedCount / maxRedemptions) * 100) : 0,
    status,
  }
}

export function mapPricingConfiguration(payload = {}) {
  const campaignAnalytics = Array.isArray(payload.campaignAnalytics)
    ? payload.campaignAnalytics
    : []
  const campaignMetricsByCode = new Map(
    campaignAnalytics.map((metrics) => [metrics.codeId ?? metrics.code_id, metrics]),
  )
  return {
    plans: (payload.plans ?? []).map(mapMembershipPlan),
    events: (payload.events ?? []).map((event) => ({
      ...event,
      registrationPrice: Number(event.registrationPrice) || 0,
      registrationManualPrice:
        event.registrationManualPrice != null ? Number(event.registrationManualPrice) : null,
      // Cambio de precio pendiente (20260929100000). `priceEffectiveAt` null =
      // no hay nada programado; `scheduledManualPrice` null con fecha puesta =
      // desde esa fecha cobra lo mismo por cualquier canal.
      scheduledPrice: event.scheduledPrice != null ? Number(event.scheduledPrice) : null,
      scheduledManualPrice:
        event.scheduledManualPrice != null ? Number(event.scheduledManualPrice) : null,
      priceEffectiveAt: event.priceEffectiveAt ?? null,
      comboOffer: event.comboOffer
        ? {
            ...event.comboOffer,
            price: Number(event.comboOffer.price) || 0,
            manualPrice:
              event.comboOffer.manualPrice != null ? Number(event.comboOffer.manualPrice) : null,
            financed: event.comboOffer.financed === true,
          }
        : null,
    })),
    // Las filas históricas de ofertas por código no forman parte del catálogo:
    // nunca se exponen en el panel, aunque un entorno aún las conserve.
    discountCodes: (payload.discountCodes ?? [])
      .filter((row) => !['offer', 'access'].includes(row.kind))
      .map((row) => {
      const code = mapDiscountCode(row)
      const metrics = campaignMetricsByCode.get(code.id)
      return {
        ...code,
        campaignMetrics: metrics
          ? {
              resolvedCount: Number(metrics.resolvedCount ?? metrics.resolved_count) || 0,
              rejectedCount: Number(metrics.rejectedCount ?? metrics.rejected_count) || 0,
              unlockedCount: Number(metrics.unlockedCount ?? metrics.unlocked_count) || 0,
              checkoutCount: Number(metrics.checkoutCount ?? metrics.checkout_count) || 0,
              paidCount: Number(metrics.paidCount ?? metrics.paid_count) || 0,
              revenue: Number(metrics.revenue) || 0,
            }
          : null,
      }
      }),
    campaignAnalytics,
    availability: payload.availability ?? { editable: true, reason: null },
  }
}

export async function fetchPricingConfigurationRequest() {
  return mapPricingConfiguration(await apiGet('/api/pricing'))
}

export async function simulatePromotionCodeRequest(codeId) {
  const result = await apiGet(
    `/api/pricing/discount-codes/${encodeURIComponent(codeId)}/simulation`,
  )
  return result.simulation ?? null
}

/** Una fila del historial: quién canjeó, cuánto descontó y sobre qué orden. */
export function mapDiscountCodeRedemption(row) {
  const athlete = row.athlete ?? row.athletes ?? null
  const order = row.order ?? row.athlete_payment_orders ?? null
  return {
    id: row.id,
    discountAmount: Number(row.discount_amount ?? row.discountAmount) || 0,
    redeemedAt: row.created_at ?? row.createdAt ?? null,
    athlete: athlete
      ? {
          id: athlete.id,
          fullName: athlete.full_name ?? athlete.fullName ?? '',
          email: athlete.email ?? '',
        }
      : null,
    order: order
      ? {
          id: order.id,
          status: order.status ?? '',
          amount: Number(order.amount) || 0,
          currency: order.currency ?? 'ARS',
          method: order.method ?? null,
          concept: order.concept ?? null,
        }
      : null,
  }
}

export async function fetchDiscountCodeRedemptionsRequest(codeId) {
  const result = await apiGet(
    `/api/pricing/discount-codes/${encodeURIComponent(codeId)}/redemptions`,
  )
  return (result.redemptions ?? []).map(mapDiscountCodeRedemption)
}

export async function createMembershipPlanVersionRequest(plan) {
  const result = await apiPost('/api/pricing/membership-plans/versions', {
    ...plan,
    effectiveFrom: dateTimeToIso(plan.effectiveFrom),
  })
  return mapMembershipPlan(result.plan)
}

export async function setMembershipPlanActiveRequest(planId, active) {
  const result = await apiPatch(
    `/api/pricing/membership-plans/${encodeURIComponent(planId)}/status`,
    { active },
  )
  return mapMembershipPlan(result.plan)
}

export async function deleteMembershipPlanRequest(planId) {
  return apiDelete(`/api/pricing/membership-plans/${encodeURIComponent(planId)}`)
}

export async function setMembershipPlanRetirementRequest(planId, retiresAt) {
  const result = await apiPatch(
    `/api/pricing/membership-plans/${encodeURIComponent(planId)}/retirement`,
    { retiresAt: dateTimeToIso(retiresAt) },
  )
  return mapMembershipPlan(result.plan)
}

/**
 * El precio de inscripción de un evento, ahora o desde una fecha. `effectiveAt`
 * vacío = rige desde ya. `manualPrice` vacío = cobra igual que `price` en
 * cualquier canal. Devuelve el snapshot de precios que dejó el servidor.
 */
export async function setEventRegistrationPriceRequest(eventSlug, { price, manualPrice, effectiveAt }) {
  const result = await apiPatch(
    `/api/pricing/events/${encodeURIComponent(eventSlug)}/registration-price`,
    {
      price,
      ...(manualPrice !== '' && manualPrice != null ? { manualPrice: Number(manualPrice) } : {}),
      effectiveAt: dateTimeToIso(effectiveAt),
    },
  )
  return result.event
}

/** Cancela el cambio de precio programado de una inscripción. Idempotente. */
export async function clearEventRegistrationPriceScheduleRequest(eventSlug) {
  const result = await apiDelete(
    `/api/pricing/events/${encodeURIComponent(eventSlug)}/registration-price/schedule`,
  )
  return result.event
}

/** Canales que se liquidan a mano, en el orden en que los ve el atleta. */
export const MANUAL_PAYMENT_CHANNELS = ['bank_transfer', 'cash_pitbull']

/**
 * El importe pactado no se pierde al cerrar o abrir un canal de cobro.
 *
 * `fixedPrice` (Mercado Pago) y `fixedPriceManual` (transferencia/efectivo)
 * son dos campos del formulario que se muestran u ocultan según qué canales
 * estén tildados. Si el operador sólo escribió el importe en el que ahora se
 * oculta, se traslada al que queda visible: sin esto, tildar o destildar
 * Mercado Pago dejaba el precio manual vacío pidiendo un importe que la
 * persona ya había escrito.
 */
export function transferPriceOnChannelToggle(code, mercadoPagoEnabled) {
  const filled = (value) => String(value ?? '').trim() !== ''
  return {
    ...code,
    mercadoPagoEnabled,
    fixedPrice: mercadoPagoEnabled
      ? filled(code?.fixedPrice)
        ? code.fixedPrice
        : (code?.fixedPriceManual ?? '')
      : code?.fixedPrice,
    fixedPriceManual: !mercadoPagoEnabled
      ? filled(code?.fixedPriceManual)
        ? code.fixedPriceManual
        : (code?.fixedPrice ?? '')
      : code?.fixedPriceManual,
  }
}

/**
 * Alfabeto sin caracteres que se confunden al dictar o tipear un código:
 * afuera 0/O, 1/I/L y el 5/S. Un código secreto se pasa por WhatsApp y se
 * escribe a mano en el checkout.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY2346789'
const CODE_BLOCK = 4
const CODE_BLOCKS = 2

function randomCodeBody() {
  const size = CODE_BLOCK * CODE_BLOCKS
  const bytes = new Uint8Array(size)
  // `crypto` y no `Math.random`: el código ES el secreto de la oferta, y una
  // secuencia predecible deja adivinar el de otra persona. Además el generador
  // anterior podía devolver menos caracteres de los pedidos
  // (`Math.random().toString(36)` no siempre trae 4 dígitos después del punto),
  // así que había códigos de dos letras conviviendo con los de ocho.
  globalThis.crypto.getRandomValues(bytes)
  const letters = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
  return Array.from({ length: CODE_BLOCKS }, (_, block) =>
    letters.slice(block * CODE_BLOCK, (block + 1) * CODE_BLOCK).join(''),
  ).join('-')
}

/** Prefijo normalizado al formato que acepta la base: mayúsculas y guiones. */
export function normalizeCodePrefix(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
}

/**
 * Un código nuevo, único contra los que ya existen y los del mismo lote.
 *
 * `taken` es un Set de códigos en mayúsculas: la lista del panel más lo
 * generado hasta ahora. El servidor tiene la última palabra (índice único), pero
 * chocar acá cuesta un reintento local en vez de un 409 a mitad de un lote de
 * 300.
 */
export function generateDiscountCode({ prefix = '', taken = new Set() } = {}) {
  const head = normalizeCodePrefix(prefix)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = head ? `${head}-${randomCodeBody()}` : randomCodeBody()
    if (!taken.has(candidate)) return candidate
  }
  // 28^8 combinaciones: 50 choques seguidos no es mala suerte, es un `taken`
  // gigante. Se devuelve con sufijo para no entrar en un bucle infinito.
  return `${head ? `${head}-` : ''}${randomCodeBody()}-${randomCodeBody()}`
}

/**
 * Corre `task` sobre cada item con concurrencia acotada y NO corta en el primer
 * error: un lote de 200 códigos que falla en el 3º dejaba 2 creados y ningún
 * reporte de cuáles. Devuelve el resultado de cada uno en orden.
 *
 * El límite es 6 por dos motivos: `staffLimiter` permite 900 requests cada 5
 * minutos (un lote de 500 entra), y el alta escribe en una tabla con índice
 * único —serializar de más sólo alarga el trámite, y de menos sube los choques.
 */
export async function mapWithConcurrency(items, task, { limit = 6 } = {}) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { ok: true, value: await task(items[index], index) }
      } catch (error) {
        results[index] = { ok: false, error }
      }
    }
  })
  await Promise.all(workers)
  return results
}

const DISCOUNT_CODE_KINDS = ['percent', 'fixed_price']

export async function upsertDiscountCodeRequest(code) {
  // Lista blanca y no un ternario: colapsar a 'percent'/'fixed_price' convertía
  // en silencio un código de acceso en uno de porcentaje (y el servidor lo
  // rebotaba después por falta de `percentOff`). Con la lista, cada modalidad
  // nueva viaja tal cual y una desconocida cae en el default de siempre.
  const kind = DISCOUNT_CODE_KINDS.includes(code.kind) ? code.kind : 'percent'
  // Una oferta exclusiva no puede ser pública: si se aplicara sola, no sería un
  // secreto. Mismo criterio que la RPC y el schema.
  const audience = code.audience === 'public' ? 'public' : 'code'
  const result = await apiPost('/api/pricing/discount-codes', {
    ...code,
    kind,
    audience,
    // Una promo publica no abre canales manuales (lo rechazan el schema y la
    // RPC): se limpian aca para que cambiar de restringida a publica en el
    // formulario no mande un payload que el servidor va a rebotar.
    manualChannels: audience === 'public' ? [] : (code.manualChannels ?? []),
    // Por el mismo motivo, una promo publica no puede cerrar la pasarela: el
    // formulario la reabre al pasar a publica en vez de mandar un payload que
    // el servidor rebota.
    mercadoPagoEnabled: audience === 'public' ? true : code.mercadoPagoEnabled !== false,
    // El financiamiento vive sobre un canal que se liquida a mano: sin
    // transferencia ni efectivo declarados no hay nada que el atleta pueda
    // declarar, así que no viaja prendido. Lo mismo para una promo pública.
    // Mismo criterio que el schema, la RPC y el check de la tabla.
    financed:
      code.financed === true &&
      audience === 'code' &&
      (code.manualChannels ?? []).length > 0,
    // Cada modalidad manda sólo su campo: el schema del servidor descarta el
    // otro, y un string vacío haría fallar la coerción numérica.
    percentOff: kind === 'percent' ? code.percentOff : undefined,
    // 'offer' comparte el importe con 'fixed_price': es un precio promocional
    // que además desbloquea el combo.
    fixedPrice: kind === 'fixed_price' ? code.fixedPrice : undefined,
    // Vacío = los canales manuales cobran lo mismo que Mercado Pago. Se manda
    // `undefined` y no 0 para que el schema lo lea como "sin precio manual".
    fixedPriceManual:
      kind === 'fixed_price' &&
      code.fixedPriceManual !== '' &&
      code.fixedPriceManual != null
        ? Number(code.fixedPriceManual)
        : undefined,
    // Sólo una inscripción o un combo pueden limitarse a un evento, y una promo
    // pública nunca (el resolver de promo pública no recibe el evento).
    eventId:
      code.eventId && audience === 'code' && ['registration', 'combo'].includes(code.appliesTo)
        ? code.eventId
        : undefined,
    // Qué afiliación empaqueta el combo. Sólo un precio promocional con alcance
    // 'combo' instancia un paquete (20260918100000); en el resto de las
    // modalidades el campo viaja vacío para que el servidor lo descarte en vez
    // de dejar colgado un plan que nadie eligió. Vacío también lo resuelve la
    // RPC —el plan del combo si hay combo, o la única afiliación de pago único
    // vigente—, así que el formulario sólo lo manda cuando hubo una elección.
    membershipPlanId:
      kind === 'fixed_price' && code.appliesTo === 'combo' && code.membershipPlanId
        ? code.membershipPlanId
        : undefined,
    startsAt: dateTimeToIso(code.startsAt),
    expiresAt: dateTimeToIso(code.expiresAt),
    // Siempre se manda la lista completa: el array presente reemplaza la
    // exclusividad entera, y vacío significa "abierta a todos".
    invitees: code.invitees ?? [],
  })
  return mapDiscountCode(result.code)
}

/**
 * Los tres estados en una sola llamada. `audience` ausente conserva la que ya
 * tenia la promo, asi el toggle de encendido no la convierte en publica.
 */
export async function setDiscountCodeStateRequest(codeId, { active, audience } = {}) {
  const result = await apiPatch(`/api/pricing/discount-codes/${encodeURIComponent(codeId)}/state`, {
    active,
    ...(audience ? { audience } : {}),
  })
  return mapDiscountCode(result.code)
}

/** Traduce el estado unico del panel a los dos ejes que guarda la base. */
export function discountCodeStatePayload(state) {
  if (state === 'off') return { active: false }
  return { active: true, audience: state === 'public' ? 'public' : 'code' }
}

export async function deleteDiscountCodeRequest(codeId) {
  return apiDelete(`/api/pricing/discount-codes/${encodeURIComponent(codeId)}`)
}

export async function fetchBillingSubscriptionsRequest(filters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.athleteId) params.set('athleteId', filters.athleteId)
  const query = params.toString()
  const result = await apiGet(`/api/payments/subscriptions${query ? `?${query}` : ''}`)
  return result.subscriptions ?? []
}

export async function cancelBillingSubscriptionRequest(subscriptionId) {
  const result = await apiPost(
    `/api/payments/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {},
  )
  return result.subscription
}
