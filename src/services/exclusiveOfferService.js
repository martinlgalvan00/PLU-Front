import { previewCheckoutPrice } from './checkoutPricing.js'

/**
 * Oferta exclusiva: lo que desbloquea un código secreto.
 *
 * No es un descuento. Un cupón resta plata sobre un precio que ya se estaba
 * mostrando; una oferta exclusiva es un paquete distinto —afiliación +
 * inscripción a un precio propio— que sólo existe para quien tiene el código.
 * Por eso vive en su propia ficha de Mi cuenta y no en el campo de descuento del
 * checkout: el checkout la cobra, pero no es donde se entiende.
 *
 * El payload lo arma `plu_private.offer_code_payload` (20260902100000). Acá sólo
 * se lo interpreta: precio por canal, ahorro y si todavía se puede comprar.
 */

/** Modalidades que abren la ficha. Espejo de OFFER_UNLOCK_KINDS del backend. */
export const OFFER_UNLOCK_KINDS = ['offer', 'access']

export function isOfferUnlockKind(kind) {
  return OFFER_UNLOCK_KINDS.includes(kind)
}

/**
 * Un preview de código que en realidad es una llave. Lo usan las dos pantallas
 * de canje (afiliación e inscripción) para decidir si anuncian "canjeaste el
 * código secreto" en vez de "ahorrás $X".
 */
export function previewUnlocksOffer(preview) {
  return Boolean(preview?.valid) && isOfferUnlockKind(preview.kind)
}

/**
 * Precio de la oferta y su ahorro, resueltos para el canal que se está mirando.
 *
 * Sólo previsualización: el importe que se cobra sale de la respuesta del POST
 * que crea la orden, igual que en el resto del checkout. Un `kind = 'access'` no
 * trae precio propio — la oferta es el precio del combo del evento, y el ahorro
 * se mide igual contra la suma de las partes.
 */
export function resolveOfferPricing(offer, { paymentMethod = 'mercado_pago' } = {}) {
  const membership = Number(offer?.membershipPlan?.price) || 0
  const registration = Number(offer?.event?.registrationPrice) || 0
  const membershipManual = offer?.membershipPlan?.manualPrice ?? null
  const registrationManual = offer?.event?.registrationManualPrice ?? null

  const membershipPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: membershipManual,
    fallback: membership,
  })
  const registrationPrice = previewCheckoutPrice({
    paymentMethod,
    manualPrice: registrationManual,
    fallback: registration,
  })

  // Un 'offer' fija su importe; un 'access' hereda el del combo del evento.
  const offerPrice =
    offer?.fixedPrice != null
      ? previewCheckoutPrice({
          paymentMethod,
          manualPrice: offer.fixedPriceManual ?? null,
          fallback: Number(offer.fixedPrice) || 0,
        })
      : previewCheckoutPrice({
          paymentMethod,
          manualPrice: offer?.comboOffer?.manualPrice ?? null,
          fallback: Number(offer?.comboOffer?.price) || 0,
        })

  const listTotal = membershipPrice + registrationPrice

  return {
    membershipPrice,
    registrationPrice,
    listTotal,
    offerPrice,
    // Nunca negativo: una oferta mal cargada no debe anunciar un "ahorro"
    // invertido. El alta ya la rechaza (staff_upsert_discount_code compara
    // contra el precio del combo), esto es el cinturón de la UI.
    savings: Math.max(listTotal - offerPrice, 0),
    currency: offer?.comboOffer?.currency ?? offer?.event?.currency ?? 'ARS',
  }
}

/** Órdenes que todavía se pueden pagar. Espejo de OPEN_PAYMENT_STATUSES. */
const OPEN_PURCHASE_STATUSES = ['pendiente', 'validacion_manual', 'creado']

/**
 * Medios de pago que habilita el código de la oferta, en el orden en que se
 * leen: primero la pasarela, después los canales que se cobran a mano.
 *
 * Las dos celdas del código no son simétricas (ver la cabecera de
 * 20260908100000): `manualChannels` ABRE transferencia y/o efectivo aunque
 * Administración los tenga cerrados —el override viaja al gate de Express—, y
 * `mercadoPagoEnabled: false` CIERRA la pasarela para este código. Por eso los
 * canales manuales se ofrecen sólo cuando el código los declara: es lo único
 * que garantiza que la orden no se caiga con un 409.
 *
 * `conceptsOpen` es el interruptor de concepto: el combo acredita afiliación e
 * inscripción, así que con cualquiera de los dos cerrado no hay nada que cobrar
 * por ningún canal.
 */
export function resolveOfferChannels(offer, { conceptsOpen = true } = {}) {
  if (!offer || !conceptsOpen) return []
  const manual = Array.isArray(offer.manualChannels) ? offer.manualChannels : []
  const channels = []
  if (offer.mercadoPagoEnabled !== false) channels.push('mercado_pago')
  if (manual.includes('bank_transfer')) channels.push('bank_transfer')
  if (manual.includes('cash_pitbull')) channels.push('cash_pitbull')
  return channels
}

/**
 * Canal de la ficha -> medio de pago del checkout. La API llama `manual_link` a
 * la transferencia; el efectivo viaja con su propio nombre y el backend lo
 * guarda como `manual_link` + `manual_payment_channel`.
 */
export function checkoutMethodForChannel(channel) {
  if (channel === 'bank_transfer') return 'manual_link'
  if (channel === 'cash_pitbull') return 'cash_pitbull'
  return 'mercado_pago'
}

/**
 * Transferencia y efectivo no se cobran con el brick: la primera se liquida con
 * los datos bancarios y un comprobante, el segundo con la referencia que el
 * atleta muestra el día del evento. Esto devuelve la orden manual que hay que
 * liquidar —la que se acaba de crear o la que quedó abierta de un intento
 * anterior— y por qué canal.
 *
 * Devuelve null cuando no hay nada manual pendiente: sin orden, con una orden de
 * Mercado Pago (esa la cobra el brick) o con la compra ya cerrada.
 */
export function resolveManualSettlement(offer, createdOrder = null) {
  const candidate = createdOrder ?? getOfferPurchase(offer)
  if (!candidate) return null
  const method = candidate.method ?? candidate.paymentMethod ?? null
  if (method !== 'manual_link') return null
  const status = String(candidate.status ?? '')
  if (status && !OPEN_PURCHASE_STATUSES.includes(status)) return null
  return {
    // Una orden manual vieja puede no tener canal guardado: transferencia es el
    // default histórico de `manual_link`.
    channel: candidate.manualPaymentChannel ?? 'bank_transfer',
    orderId: candidate.orderId ?? candidate.paymentId ?? candidate.id ?? null,
    amount: Number(candidate.amount) || 0,
    currency: candidate.currency ?? 'ARS',
    reference: candidate.reference ?? null,
    financingAllowed: candidate.financingAllowed === true,
    manualPaymentDeclaredAt: candidate.manualPaymentDeclaredAt ?? null,
    financedEntitlementsAt: candidate.financedEntitlementsAt ?? null,
  }
}

/**
 * La compra que ocupó el canje, normalizada (`plu_private.offer_code_payload`).
 *
 * `redeemed` se escribe al CREAR la orden, no al cobrarla: sin mirar el estado
 * de esa orden la ficha declaraba "ya compraste" a quien todavía no había
 * pagado. `open` es lo que habilita retomar el pago; `paid` es lo que convierte
 * la ficha en recibo.
 */
export function getOfferPurchase(offer) {
  const purchase = offer?.purchase
  if (!purchase?.orderId) return null
  const status = String(purchase.status ?? '')
  return {
    ...purchase,
    status,
    open: OPEN_PURCHASE_STATUSES.includes(status),
    paid: status === 'aprobado',
    // Transferencia, efectivo y Wise comparten `manual_link` y no se cobran con
    // el brick: se resuelven con comprobante y validación de staff.
    embeddable: purchase.method === 'mercado_pago' && OPEN_PURCHASE_STATUSES.includes(status),
  }
}

/**
 * Orden mínima que `MercadoPagoEmbeddedCheckout` necesita para retomar un cobro
 * ya creado. La preferencia la resuelve el propio brick si la orden no la tiene.
 *
 * No inventa importes: el que se cobra es el que quedó en la orden cuando se
 * aplicó el código, que es también el único que el servidor va a aceptar.
 */
export function buildOfferResumeOrder(offer, { athlete = null, concept = '' } = {}) {
  const purchase = getOfferPurchase(offer)
  if (!purchase?.embeddable) return null
  return {
    type: 'competition',
    purchaseType: 'combo',
    paymentId: purchase.orderId,
    id: purchase.orderId,
    amount: purchase.amount,
    currency: purchase.currency ?? 'ARS',
    concept: concept || purchase.concept,
    method: purchase.method,
    status: purchase.status,
    paymentMode: 'payment',
    athleteId: athlete?.id ?? null,
    athleteName: athlete?.fullName ?? null,
    athleteDocument: athlete?.documentId ?? null,
    payerEmail: athlete?.email ?? null,
  }
}

/**
 * ¿La oferta se puede comprar ahora?
 *
 * `redeemed` cierra la compra de cero, pero no siempre significa "comprada":
 * si la orden que ocupó el canje sigue impaga, la ficha tiene que poder
 * terminar de pagarla (`resumable`). El resto son las mismas condiciones que
 * evalúa el checkout — se replican para no ofrecer un botón que termina en
 * error.
 */
export function getOfferState(offer, { now = new Date() } = {}) {
  if (!offer) return { available: false, reason: 'missing' }
  if (offer.redeemed) {
    const purchase = getOfferPurchase(offer)
    if (purchase?.open) {
      return { available: false, resumable: true, reason: 'pending_payment', purchase }
    }
    return { available: false, reason: 'redeemed', purchase }
  }

  const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null
  if (expiresAt && expiresAt < now) return { available: false, reason: 'expired' }
  const startsAt = offer.startsAt ? new Date(offer.startsAt) : null
  if (startsAt && startsAt > now) return { available: false, reason: 'not_started' }

  const combo = offer.comboOffer
  if (!combo || !combo.active) return { available: false, reason: 'offer_unavailable' }
  const comboStarts = combo.startsAt ? new Date(combo.startsAt) : null
  const comboEnds = combo.endsAt ? new Date(combo.endsAt) : null
  if (comboStarts && comboStarts > now) return { available: false, reason: 'offer_unavailable' }
  if (comboEnds && comboEnds < now) return { available: false, reason: 'offer_unavailable' }

  if (!offer.event?.slug) return { available: false, reason: 'offer_unavailable' }

  return { available: true, reason: null }
}

/**
 * La oferta que la ficha muestra primero: la comprable más reciente; si no
 * quedó ninguna, la que tiene un pago abierto —es la que reclama una acción—;
 * y en última instancia la última canjeada, para que la ficha nunca aparezca
 * vacía después de haber anunciado un canje.
 */
export function pickPrimaryOffer(offers = [], options = {}) {
  const list = Array.isArray(offers) ? offers.filter(Boolean) : []
  return (
    list.find((offer) => getOfferState(offer, options).available) ??
    list.find((offer) => getOfferState(offer, options).resumable) ??
    list[0] ??
    null
  )
}
