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

/** Canales que se liquidan a mano, en el orden en que los ve el atleta. */
export const MANUAL_PAYMENT_CHANNELS = ['bank_transfer', 'cash_pitbull']

/**
 * Cómo se cobra un código, como UNA decisión en vez de tres interruptores.
 *
 * En la base son tres columnas independientes —`mercado_pago_enabled`,
 * `manual_channels`, `financed`— y el panel las mostraba como cuatro casillas
 * cuya validez dependía entre sí: financiar sin canal manual quedaba inerte,
 * destildar las tres dejaba un código que nadie podía pagar. El operador tenía
 * que reconstruir el contrato en la cabeza.
 *
 * Son tres intenciones, y ninguna combinación inválida es alcanzable:
 *
 *   * 'mercado_pago'    — la pasarela acredita sola. Es el caso por defecto.
 *   * 'manual'          — se cobra a mano; Finanzas valida antes de habilitar.
 *   * 'manual_financed' — se cobra a mano y el atleta queda habilitado en
 *                         afiliación e inscripción cuando avisa que pagó. La
 *                         deuda sigue abierta (`financing_allowed`).
 *
 * `mercadoPagoEnabled` sobrevive como refinamiento de los dos modos manuales
 * ("aceptar también Mercado Pago"): es lo que permite leer sin pérdida los
 * códigos que ya existen con la pasarela abierta y canales manuales.
 */
export const CODE_PAYMENT_MODES = ['mercado_pago', 'manual', 'manual_financed']

/** El modo de un código guardado. Cualquier fila vieja cae en uno de los tres. */
export function codePaymentModeOf(code) {
  const manual = Array.isArray(code?.manualChannels) ? code.manualChannels : []
  if (manual.length === 0) return 'mercado_pago'
  return code?.financed === true ? 'manual_financed' : 'manual'
}

/**
 * Las tres columnas que corresponden al modo elegido.
 *
 * Elegir un modo manual abre los dos canales cuando no había ninguno —sin canal
 * no hay nada que cobrar ni que declarar— y conserva la selección cuando el
 * operador ya la ajustó. Volver a Mercado Pago limpia todo: un código de
 * pasarela con financiamiento guardado es la contradicción que la base rechaza.
 */
export function applyCodePaymentMode(code, mode) {
  const current = Array.isArray(code?.manualChannels) ? code.manualChannels : []
  const filled = (value) => String(value ?? '').trim() !== ''
  if (mode === 'mercado_pago') {
    return {
      ...code,
      manualChannels: [],
      mercadoPagoEnabled: true,
      financed: false,
      // El importe pactado no se pierde al reabrir la pasarela: el campo de
      // Mercado Pago vuelve a aparecer y quedaba vacío aunque el precio ya
      // estuviera acordado para el canal manual.
      fixedPrice: filled(code?.fixedPrice) ? code.fixedPrice : (code?.fixedPriceManual ?? ''),
    }
  }
  // Ya estaba en un modo manual: se conserva lo que el operador ajustó —los
  // canales y una reapertura deliberada de la pasarela—, así moverse entre
  // "cobra a mano" y "habilita al avisar" no pierde nada.
  const wasManual = current.length > 0
  return {
    ...code,
    manualChannels: wasManual ? current : [...MANUAL_PAYMENT_CHANNELS],
    // Viniendo de la pasarela, un modo manual la cierra: es exactamente lo que
    // significa "sí o sí efectivo o transferencia". Se puede reabrir a mano.
    mercadoPagoEnabled: wasManual ? code?.mercadoPagoEnabled === true : false,
    financed: mode === 'manual_financed',
    // Con la pasarela cerrada, el importe que se cobra es el del canal manual
    // (`effective_fixed_price`) y el campo de Mercado Pago desaparece. Si el
    // operador ya había puesto el precio ahí, se traslada: antes el formulario
    // rechazaba el alta pidiendo un importe que la persona creía haber escrito.
    fixedPriceManual: filled(code?.fixedPriceManual)
      ? code.fixedPriceManual
      : (code?.fixedPrice ?? ''),
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
    // Qué afiliación empaqueta la oferta. Vacío la resuelve la RPC —el plan del
    // combo, o la única de pago único vigente—, así que el formulario sólo lo
    // manda cuando hay una elección real que hacer.
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
