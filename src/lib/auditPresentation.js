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
 * Motivos internos del ciclo de webhook (`metadata.reason`) explicados en el
 * lenguaje del negocio. El backend recién empezó a guardar `diagnosis` en los
 * descartes; las filas históricas solo traen el código crudo, y sin esto el
 * panel mostraba "Por qué falló: unsupported_type" — que ni siquiera es un
 * pago rechazado, es una notificación de merchant_order descartada a propósito.
 */
const AUDIT_REASON_INSIGHTS = {
  unsupported_type: {
    title: 'Notificación descartada: no es un pago rechazado',
    cause:
      'Mercado Pago manda un aviso por cada cambio de la orden comercial (merchant_order) además del aviso de pago. Este tipo no se procesa a propósito: no dice nada del cobro en sí, que llega por su propia notificación "payment".',
    fix: [
      'No hay nada que arreglar: el descarte es deliberado y no afecta ningún cobro.',
      'El estado real del pago está en el evento "payment" de la misma operación (mismo external_reference en la auditoría).',
      'Si el pago asociado nunca llegó, usar Panel > Pagos > Recuperar operaciones.',
    ],
    severity: 'expected',
    retryable: false,
  },
  signature_rejected: {
    title: 'Mercado Pago mandó un webhook con firma inválida',
    cause:
      'El HMAC no validó contra el secreto configurado. Suele ser el secreto de otro entorno, un reenvío con timestamp vencido o un intento de falsificación. El evento no se acreditó.',
    fix: [
      'Comparar MERCADO_PAGO_WEBHOOK_SECRET con el de la misma aplicación de MP que envía la notificación.',
      'Si el secreto era correcto, tratarlo como intento de falsificación: no hubo acción sobre ninguna orden.',
    ],
    severity: 'degraded',
    retryable: false,
  },
  missing_data_id: {
    title: 'Notificación sin identificador de pago',
    cause:
      'El webhook llegó sin data.id en la URL, así que no hay forma de saber a qué pago se refiere. Suele ser una prueba manual desde el panel de MP o una URL mal registrada.',
    fix: [
      'Verificar en MP > Webhooks que la URL registrada sea .../api/payments/webhook/mercadopago.',
      'Si es un pago real que se perdió, usar Panel > Pagos > Recuperar operaciones.',
    ],
    severity: 'degraded',
    retryable: false,
  },
  data_id_mismatch: {
    title: 'La notificación se contradice a sí misma',
    cause:
      'El id de pago de la URL no coincide con el del cuerpo del webhook. Se rechaza porque no se puede saber cuál de los dos es el verdadero.',
    fix: ['Buscar el pago por external_reference en el panel de MP y conciliarlo desde Panel > Pagos.'],
    severity: 'degraded',
    retryable: false,
  },
  missing_notification_id: {
    title: 'Notificación sin clave de idempotencia',
    cause:
      'El webhook no trae ningún identificador estable, así que no se puede garantizar que no se acredite dos veces. Se rechaza por seguridad.',
    fix: ['Si el pago es real, conciliarlo desde Panel > Pagos > Recuperar operaciones.'],
    severity: 'degraded',
    retryable: false,
  },
  order_already_approved: {
    title: 'La orden ya estaba acreditada',
    cause:
      'Llegó un intento de cobro sobre una orden que ya tiene un pago aprobado. El rechazo evita un doble cobro; no hay plata perdida.',
    fix: ['Nada que hacer: es la protección contra cobrar dos veces.'],
    severity: 'expected',
    retryable: false,
  },
  payment_not_found: {
    title: 'Mercado Pago todavía no expone ese pago',
    cause:
      'Al volver del checkout se consultó el pago y MP aún no lo devuelve. La acreditación llega igual por webhook cuando MP lo publique.',
    fix: ['Esperar la notificación de MP; si en unos minutos no llega, conciliar desde Panel > Pagos.'],
    severity: 'expected',
    retryable: true,
  },
}

/**
 * `status_detail` de Mercado Pago traducido a por qué y qué hacer. Es la
 * respuesta que Finanzas necesita dar cuando un atleta pregunta por qué no le
 * pasó la tarjeta — sin esto el panel mostraba `cc_rejected_*` crudo.
 * Espejo operativo de REJECTION_DETAILS del backend (paymentFailureCatalog.js).
 */
const STATUS_DETAIL_INSIGHTS = {
  cc_rejected_insufficient_amount: {
    title: 'La tarjeta no tenía fondos suficientes',
    cause: 'El emisor rechazó el monto por falta de saldo o de límite disponible.',
    fix: ['El atleta debe probar con otro medio de pago o pedir un límite mayor a su banco.'],
    retryable: true,
  },
  cc_rejected_bad_filled_card_number: {
    title: 'Número de tarjeta mal ingresado',
    cause: 'El número cargado no pasó la validación del emisor.',
    fix: ['El atleta debe reintentar cargando el número de nuevo.'],
    retryable: true,
  },
  cc_rejected_bad_filled_date: {
    title: 'Fecha de vencimiento incorrecta',
    cause: 'La fecha de vencimiento cargada no coincide con la de la tarjeta.',
    fix: ['El atleta debe reintentar revisando el vencimiento.'],
    retryable: true,
  },
  cc_rejected_bad_filled_security_code: {
    title: 'Código de seguridad incorrecto',
    cause: 'El CVV cargado no coincide con el de la tarjeta.',
    fix: ['El atleta debe reintentar revisando el código de seguridad.'],
    retryable: true,
  },
  cc_rejected_bad_filled_other: {
    title: 'Algún dato de la tarjeta quedó mal cargado',
    cause: 'El emisor rechazó el pago por un dato inválido del formulario.',
    fix: ['El atleta debe reintentar revisando todos los datos de la tarjeta.'],
    retryable: true,
  },
  cc_rejected_call_for_authorize: {
    title: 'El banco pide autorización expresa',
    cause: 'El emisor retiene el pago hasta que el titular autorice ese monto.',
    fix: ['El atleta tiene que llamar a su banco, autorizar el monto y reintentar.'],
    retryable: true,
  },
  cc_rejected_card_disabled: {
    title: 'Tarjeta inactiva',
    cause: 'La tarjeta todavía no fue activada o está dada de baja.',
    fix: ['El atleta debe activarla con su banco o usar otra tarjeta.'],
    retryable: true,
  },
  cc_rejected_duplicated_payment: {
    title: 'Pago duplicado',
    cause: 'Ya existe un pago igual muy reciente; MP frena el segundo por protección.',
    fix: [
      'Verificar si el primer pago ya se acreditó antes de reintentar: puede que la orden ya esté paga.',
    ],
    retryable: false,
  },
  cc_rejected_high_risk: {
    title: 'Rechazado por la prevención de fraude de Mercado Pago',
    cause:
      'El sistema antifraude de MP calificó el pago como riesgoso. No es un dato de la tarjeta: es el perfil de la operación.',
    fix: [
      'No acreditar ni reintentar desde el panel.',
      'El atleta debe usar otro medio de pago (idealmente con su propia cuenta de MP) o consultar con Mercado Pago.',
    ],
    retryable: false,
  },
  cc_rejected_blacklist: {
    title: 'Tarjeta en la lista de bloqueo de Mercado Pago',
    cause: 'La tarjeta figura bloqueada por robo, deuda o contracargos.',
    fix: ['No insistir con esa tarjeta: el atleta debe usar otro medio de pago.'],
    retryable: false,
  },
  cc_rejected_card_error: {
    title: 'La tarjeta no pudo procesar el pago',
    cause: 'Falla de comunicación entre Mercado Pago y el emisor de la tarjeta.',
    fix: ['Reintentar en unos minutos o probar con otra tarjeta.'],
    retryable: true,
  },
  cc_rejected_max_attempts: {
    title: 'Se agotaron los intentos permitidos',
    cause: 'MP corta la tarjeta después de varios intentos fallidos seguidos.',
    fix: ['Esperar un rato y reintentar, o usar otra tarjeta.'],
    retryable: true,
  },
  cc_rejected_other_reason: {
    title: 'El banco rechazó el pago sin dar detalle',
    cause: 'El emisor devolvió un rechazo genérico, sin código específico.',
    fix: ['El atleta debe consultar a su banco o probar con otro medio de pago.'],
    retryable: true,
  },
  cc_rejected_invalid_installments: {
    title: 'La tarjeta no admite esas cuotas',
    cause: 'El emisor no permite la cantidad de cuotas elegida.',
    fix: ['Reintentar eligiendo menos cuotas o pago en un solo pago.'],
    retryable: true,
  },
  cc_rejected_card_type_not_allowed: {
    title: 'Ese tipo de tarjeta no está habilitado',
    cause: 'El medio de pago (p. ej. esa marca o tipo de tarjeta) no está habilitado para este cobro.',
    fix: ['El atleta debe usar otra tarjeta u otro medio de pago.'],
    retryable: true,
  },
  cc_rejected_3ds_challenge: {
    title: 'Falló la verificación 3DS del banco',
    cause: 'El atleta no completó (o falló) el desafío de seguridad que mostró su banco.',
    fix: ['Reintentar y completar la verificación 3DS cuando aparezca.'],
    retryable: true,
  },
  cc_rejected_3ds_mandatory: {
    title: 'El emisor exige verificación 3DS',
    cause: 'El pago se envió sin la verificación 3DS que el banco exige para esa tarjeta.',
    fix: ['Reintentar desde el checkout para que dispare el desafío de seguridad.'],
    retryable: true,
  },
  cc_rejected_time_out: {
    title: 'La operación expiró antes de confirmarse',
    cause: 'Mercado Pago no llegó a confirmar el pago a tiempo.',
    fix: ['Reintentar; si se repite, revisar status.mercadopago.com.'],
    retryable: true,
  },
  cc_amount_rate_limit_exceeded: {
    title: 'El monto supera el límite permitido',
    cause: 'El pago excede el límite de monto (CAP) de la cuenta o del medio de pago en Mercado Pago.',
    fix: ['El atleta debe usar otro medio o pedir a Mercado Pago que amplíe su límite.'],
    retryable: false,
  },
  rejected_by_bank: {
    title: 'El banco emisor rechazó el pago',
    cause: 'El banco devolvió un rechazo sin código específico.',
    fix: ['El atleta debe consultar a su banco o usar otro medio de pago.'],
    retryable: true,
  },
  rejected_insufficient_data: {
    title: 'Faltan datos del pagador',
    cause: 'El pago se envió sin datos obligatorios que el emisor exige.',
    fix: ['Reintentar completando todos los datos que pide el formulario.'],
    retryable: true,
  },
  rejected_by_regulations: {
    title: 'Rechazado por regulaciones vigentes',
    cause: 'Una normativa del país o del emisor impide procesar este pago. No es una falla de la plataforma.',
    fix: ['El atleta debe usar otro medio de pago.'],
    retryable: false,
  },
  bank_error: {
    title: 'Falla del banco al procesar el pago',
    cause: 'El error ocurrió del lado del banco, no de la plataforma ni de Mercado Pago.',
    fix: ['Reintentar más tarde o usar otra tarjeta.'],
    retryable: true,
  },
  pending_contingency: {
    title: 'Mercado Pago está procesando el pago',
    cause: 'MP quedó procesando la operación. Se acredita sola por webhook.',
    fix: ['No reintentar ni acreditar a mano: el webhook resuelve el estado final.'],
    retryable: false,
  },
  pending_review_manual: {
    title: 'Mercado Pago lo dejó en revisión manual',
    cause: 'El equipo de MP revisa la operación. Se resuelve por webhook en minutos u horas.',
    fix: ['Esperar la resolución de MP; no reintentar ni acreditar a mano.'],
    retryable: false,
  },
  pending_challenge: {
    title: 'Pendiente de la verificación 3DS del banco',
    cause: 'El pago espera que el atleta complete el desafío de seguridad de su banco.',
    fix: ['Esperar: se confirma o cae solo. No reintentar todavía.'],
    retryable: false,
  },
  pending_waiting_transfer: {
    title: 'Esperando la transferencia del atleta',
    cause: 'El pago quedó a la espera de que se acredite la transferencia.',
    fix: ['Esperar la acreditación; llega por webhook.'],
    retryable: false,
  },
  pending_waiting_payment: {
    title: 'Cupón emitido, esperando el pago en efectivo',
    cause: 'El atleta generó el cupón pero todavía no lo pagó.',
    fix: ['Esperar el pago del cupón; si venció, emitir un cobro nuevo.'],
    retryable: false,
  },
  expired: {
    title: 'La operación venció sin completarse',
    cause: 'El cupón o la reserva de pago expiró antes de pagarse.',
    fix: ['Emitir un cobro nuevo si el atleta sigue interesado.'],
    retryable: true,
  },
}

/**
 * Diagnóstico sintetizado en el cliente cuando el asiento no guardó uno.
 * Cubre las filas históricas (el backend recién empezó a guardar `diagnosis`
 * en los descartes de webhook) y cualquier asiento que solo traiga el código
 * crudo del proveedor. Devuelve la misma forma que `metadata.diagnosis`.
 */
export function synthesizeAuditDiagnosis(metadata) {
  if (!metadata || typeof metadata !== 'object') return null

  const reason = typeof metadata.reason === 'string' ? metadata.reason.trim() : ''
  const reasonInsight = AUDIT_REASON_INSIGHTS[reason]
  if (reasonInsight) {
    return { code: reason, scope: null, ...reasonInsight, fix: [...reasonInsight.fix] }
  }

  const statusDetail = typeof metadata.statusDetail === 'string' ? metadata.statusDetail.trim() : ''
  const detailInsight = STATUS_DETAIL_INSIGHTS[statusDetail]
  if (detailInsight) {
    return {
      code: statusDetail,
      scope: null,
      severity: null,
      ...detailInsight,
      fix: [...detailInsight.fix],
    }
  }

  // El backend guarda la explicación del catálogo junto al código; para un
  // código que este módulo no conoce, esa explicación sigue siendo mejor que
  // el código pelado. Solo para detalles con pinta de falla: un `accredited`
  // no necesita diagnóstico.
  const meaning =
    typeof metadata.statusDetailMeaning === 'string' ? metadata.statusDetailMeaning.trim() : ''
  if (
    statusDetail &&
    meaning &&
    !meaning.startsWith('Detalle no catalogado') &&
    /rejected|error|expired|pending/i.test(statusDetail)
  ) {
    return {
      title: null,
      cause: meaning,
      fix: [],
      code: statusDetail,
      scope: null,
      severity: null,
      retryable: null,
    }
  }

  return null
}

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
  // Cuando el "mensaje" es directamente un código crudo (unsupported_type,
  // cc_rejected_*), el título del catálogo es la traducción exacta.
  for (const value of [message, code, statusDetail]) {
    const key = typeof value === 'string' ? value.trim() : ''
    const insight = AUDIT_REASON_INSIGHTS[key] ?? STATUS_DETAIL_INSIGHTS[key]
    if (insight) return insight.title
  }

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
