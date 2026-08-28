const STORY_FIELDS = ['error', 'reason', 'statusDetail']
const FACT_FIELDS = [
  'attempt',
  'amount',
  'reference',
  'memberCode',
  'recipientEmail',
  'payerEmail',
  'concept',
  'paymentStatus',
  'orderStatus',
  'errorCode',
  'templateKey',
  'nextRetryAt',
]

/** Patrones operativos (presentación): traducen mensajes crudos de proveedores. */
const AUDIT_OPERATOR_PATTERNS = [
  {
    match: /cc_rejected_high_risk/i,
    message: 'Mercado Pago rechazó el pago por prevención de fraude. No se acreditó.',
  },
  {
    match: /cc_rejected_insufficient_amount|insufficient amount/i,
    message: 'Mercado Pago rechazó el pago por fondos insuficientes.',
  },
  {
    match: /cc_rejected_bad_filled|bad filled|card number/i,
    message: 'Mercado Pago rechazó el pago: datos de tarjeta inválidos.',
  },
  {
    match: /cc_rejected_call_for_authorize|call for authorize/i,
    message: 'Mercado Pago pide autorización del banco para completar el pago.',
  },
  {
    match: /cc_rejected_other_reason|rejected_other/i,
    message: 'Mercado Pago rechazó el pago. El atleta debe revisar con su banco.',
  },
  {
    match: /MP_ACCOUNT_MISMATCH|otra cuenta de Mercado Pago|cuenta cobradora configurada/i,
    message: 'La conciliación se detuvo: el pago pertenece a otra cuenta de Mercado Pago.',
  },
  {
    match: /PROVIDER_PAYMENT_NOT_FOUND|payment not found|resource not found|Pago mock no encontrado/i,
    message: 'Mercado Pago no encontró el pago en la cuenta o entorno configurados.',
  },
  {
    match: /Firma de webhook invalida|MP_WEBHOOK_SIGNATURE|signature_rejected/i,
    message: 'Mercado Pago envió un webhook con firma inválida. No se acreditó.',
  },
  {
    match: /MERCADO_PAGO_WEBHOOK_SECRET|Falta .*webhook/i,
    message: 'Falta el secreto del webhook de Mercado Pago. Los pagos no se acreditan solos.',
  },
  {
    match: /Mercado Pago no esta configurado|MERCADO_PAGO_ACCESS_TOKEN|Access Token de Mercado Pago/i,
    message: 'Mercado Pago no está configurado: falta o es inválido el Access Token.',
  },
  {
    match: /Token rechazado|invalid[_ ]?token|HTTP 40[13]/i,
    message: 'Mercado Pago rechazó las credenciales configuradas.',
  },
  {
    match: /aborted|AbortError|timeout|ETIMEDOUT|ECONNRESET|fetch failed|socket hang up/i,
    message: 'Mercado Pago no respondió a tiempo. El cobro puede haber quedado pendiente.',
  },
  {
    match: /Monto de pago invalido|Moneda de pago invalida|ORDER_AMOUNT_MISMATCH/i,
    message: 'El monto o la moneda del pago no coincide con la orden.',
  },
  {
    match: /sender you used .* is not valid|validate your sender|authenticate your domain/i,
    message: 'Brevo rechazó el remitente. Hay que validar la casilla o autenticar el dominio.',
  },
  {
    match: /Unable to find MX|MX record|domain pluarg|domain .* not found/i,
    message: 'Brevo no pudo enviar: falta configurar el DNS del dominio remitente.',
  },
  {
    match: /\b550\b|mailbox unavailable|user unknown|recipient rejected/i,
    message: 'Brevo no pudo entregar: la casilla del destinatario no existe o la rechazó.',
  },
  {
    match: /hard bounce|soft bounce|bounced/i,
    message: 'El correo rebotó: la casilla del destinatario no recibió el mensaje.',
  },
  {
    match: /blocked|blacklist|spam/i,
    message: 'Brevo bloqueó el envío: el destinatario está en lista de supresión o spam.',
  },
  {
    match: /rate limit|too many requests|429/i,
    message: 'Brevo limitó el envío por exceso de solicitudes. Se reintentará.',
  },
]

/**
 * Un `value` de metadata casi siempre es texto o número. La excepción es
 * `error`, que `paymentAuditTrail.recordFailure` guarda como objeto
 * ({message, code, stack, ...}) — el stack completo vive en
 * `PaymentTraceDialog`, acá alcanza con el mensaje. Sin este paso,
 * `String(value)` lo convierte en "[object Object]".
 */
/** Objeto → su mensaje (o null si no tiene); cualquier otro valor, sin tocar. */
function normalizedValue(value) {
  if (value !== null && typeof value === 'object') {
    return typeof value.message === 'string' && value.message.trim() !== ''
      ? value.message.trim()
      : null
  }
  return value
}

function hasValue(value) {
  const normalized = normalizedValue(value)
  return normalized != null && String(normalized).trim() !== ''
}

function summaryByField(row) {
  const summary = Array.isArray(row?.summary) ? row.summary : []
  return Object.fromEntries(
    summary
      .filter(({ field, value }) => field && hasValue(value))
      .map(({ field, value }) => [field, normalizedValue(value)]),
  )
}

/** Traducciones de incidentes conocidos que llegaron desde un proveedor. */
export function operatorFailureMessage(message, code = null, statusDetail = null) {
  const source = [message, code, statusDetail].filter(Boolean).join(' ')
  for (const { match, message: copy } of AUDIT_OPERATOR_PATTERNS) {
    if (match.test(source)) return copy
  }
  return null
}

/**
 * Titular operativo para tabla, mobile y previews.
 * Prioriza diagnosis del backend, luego patrones conocidos, luego texto crudo
 * (colapsado como técnico cuando hay traducción).
 */
export function resolveAuditHeadline(row) {
  const byField = summaryByField(row)
  const errorDetail = row?.errorDetail
  const diagnosis = errorDetail?.diagnosis

  const leadField = STORY_FIELDS.find((field) => hasValue(byField[field]))
  const rawFromSummary = leadField ? String(byField[leadField]).trim() : ''
  const rawMessage = (
    errorDetail?.message ??
    rawFromSummary ??
    byField.reason ??
    byField.statusDetail ??
    ''
  ).trim()

  const operatorMsg =
    errorDetail?.operatorMessage ??
    operatorFailureMessage(
      rawMessage,
      errorDetail?.code ?? byField.errorCode,
      errorDetail?.statusDetail ?? byField.statusDetail,
    )

  const headline =
    diagnosis?.title ||
    operatorMsg ||
    (diagnosis?.cause ? String(diagnosis.cause).trim() : null) ||
    rawMessage ||
    ''

  let technicalMessage = null
  if (rawMessage && headline && rawMessage !== headline) {
    technicalMessage = rawMessage
  }

  const suggestedAction = diagnosis?.fix?.[0] ?? null

  return {
    headline,
    technicalMessage,
    suggestedAction,
    leadKind: leadField ?? (headline ? 'error' : null),
    hasHeadline: Boolean(headline),
  }
}

/**
 * Separa lo que un operador necesita leer ya (error, intento, código) de los
 * ids técnicos que solo sirven para cruzar con Mercado Pago o la base.
 */
export function presentAuditEvent(row) {
  const summary = Array.isArray(row?.summary) ? row.summary : []
  const byField = summaryByField(row)
  const headlineData = resolveAuditHeadline(row)

  const used = new Set(
    STORY_FIELDS.filter((field) => hasValue(byField[field])),
  )

  const facts = FACT_FIELDS.filter((field) => !used.has(field) && hasValue(byField[field])).map(
    (field) => {
      used.add(field)
      return { field, value: byField[field] }
    },
  )

  const extra = summary
    .filter(({ field, value }) => field && !used.has(field) && hasValue(value))
    .map(({ field, value }) => ({ field, value: normalizedValue(value) }))

  return {
    lead: headlineData.headline,
    technicalMessage: headlineData.technicalMessage,
    suggestedAction: headlineData.suggestedAction,
    leadKind: headlineData.leadKind,
    facts: [...facts, ...extra],
    hasStory:
      headlineData.hasHeadline || facts.length > 0 || extra.length > 0 || Boolean(headlineData.suggestedAction),
  }
}
