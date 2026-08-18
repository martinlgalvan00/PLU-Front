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

/**
 * Separa lo que un operador necesita leer ya (error, intento, código) de los
 * ids técnicos que solo sirven para cruzar con Mercado Pago o la base.
 */
export function presentAuditEvent(row) {
  const summary = Array.isArray(row?.summary) ? row.summary : []
  const byField = Object.fromEntries(
    summary
      .filter(({ field, value }) => field && hasValue(value))
      .map(({ field, value }) => [field, normalizedValue(value)]),
  )

  const leadField = STORY_FIELDS.find((field) => hasValue(byField[field]))
  const lead = leadField ? String(byField[leadField]).trim() : ''
  const used = new Set(leadField ? [leadField] : [])

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
    lead,
    leadKind: leadField ?? null,
    facts: [...facts, ...extra],
    hasStory: Boolean(lead) || facts.length > 0 || extra.length > 0,
  }
}
