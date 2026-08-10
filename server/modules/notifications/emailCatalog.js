/**
 * emailCatalog.js — PLU ARG
 *
 * Fuente de verdad única de los emails transaccionales. Antes esto vivía
 * repartido en tres lugares que se desincronizaron entre sí: el enum de zod en
 * `routes/emails.js` (5 tipos), el mapa `templateEnvByType` de ese mismo archivo
 * (5 entradas) y `.env.example` (10 template IDs). `security_access` se usaba en
 * producción sin estar en ninguno de los dos primeros.
 *
 * Toda alta de email nuevo se hace acá y en ningún otro lado. El dispatcher
 * (`emailDispatcher.js`) resuelve template, categoría, asunto y validación de
 * params desde este catálogo.
 *
 * Campos de cada entrada:
 *
 * - `category`      Agrupa para métricas y para la política de supresión.
 * - `templateEnv`   Variable de entorno con el ID numérico del template de Brevo.
 * - `subject`       Asunto del fallback HTML. Brevo ignora esto cuando hay
 *                   `templateId` (el asunto vive en el template del dashboard).
 * - `entityType`    Entidad de negocio a la que se ancla el log, para auditoría.
 * - `requiredParams` Params sin los cuales el email sale incompleto. Se validan
 *                   antes de gastar una llamada a Brevo.
 * - `optOutAllowed` `true` = comunicación que el destinatario puede cortar. Los
 *                   transaccionales críticos (contraseña, acceso, comprobante)
 *                   van en `false`: no se pueden desuscribir de ellos.
 * - `critical`      Se intenta enviar incluso si el destinatario está suprimido
 *                   por desuscripción. Una dirección rebotada o marcada como
 *                   spam frena igual, porque ahí el envío no llegaría de todos
 *                   modos y daña la reputación del dominio.
 */

export const EMAIL_CATEGORIES = Object.freeze({
  account: 'account',
  membership: 'membership',
  billing: 'billing',
  event: 'event',
  ops: 'ops',
})

export const EMAIL_CATALOG = Object.freeze({
  // ---------------------------------------------------------------- cuenta
  welcome: {
    category: EMAIL_CATEGORIES.account,
    templateEnv: 'BREVO_TEMPLATE_WELCOME',
    subject: 'Te damos la bienvenida a PLU Argentina',
    entityType: 'athlete',
    requiredParams: ['name'],
    optOutAllowed: false,
    critical: false,
  },
  email_verification: {
    category: EMAIL_CATEGORIES.account,
    templateEnv: 'BREVO_TEMPLATE_EMAIL_VERIFICATION',
    subject: 'Bienvenido a PLU ARG: confirma tu correo',
    entityType: 'athlete',
    requiredParams: ['verificationUrl'],
    optOutAllowed: false,
    // Crítico: sin este mail el atleta no puede afiliarse ni inscribirse. Una
    // desuscripción vieja no puede dejarlo trabado.
    critical: true,
  },
  password_reset: {
    category: EMAIL_CATEGORIES.account,
    templateEnv: 'BREVO_TEMPLATE_PASSWORD_RESET',
    subject: 'Restablecé tu contraseña · PLU ARG',
    entityType: 'athlete',
    requiredParams: ['resetUrl'],
    optOutAllowed: false,
    critical: true,
  },
  security_access: {
    category: EMAIL_CATEGORIES.account,
    templateEnv: 'BREVO_TEMPLATE_SECURITY_ACCESS',
    subject: 'Tu acceso de control en puerta · PLU ARG',
    entityType: 'security_user',
    requiredParams: ['email'],
    optOutAllowed: false,
    critical: true,
  },

  // ------------------------------------------------------------ afiliación
  affiliation_started: {
    category: EMAIL_CATEGORIES.membership,
    templateEnv: 'BREVO_TEMPLATE_AFFILIATION_STARTED',
    subject: 'Tu afiliación a PLU Argentina está en curso',
    entityType: 'athlete_payment_order',
    requiredParams: ['name'],
    optOutAllowed: false,
    critical: false,
  },
  affiliation_approved: {
    category: EMAIL_CATEGORIES.membership,
    templateEnv: 'BREVO_TEMPLATE_AFFILIATION_APPROVED',
    subject: 'Tu afiliación quedó activa · PLU ARG',
    entityType: 'membership',
    requiredParams: ['name'],
    optOutAllowed: false,
    critical: false,
  },
  membership_renewal: {
    category: EMAIL_CATEGORIES.membership,
    templateEnv: 'BREVO_TEMPLATE_MEMBERSHIP_RENEWAL',
    subject: 'Tu afiliación a PLU ARG está por vencer',
    entityType: 'membership',
    requiredParams: ['name', 'expirationDate'],
    optOutAllowed: true,
    critical: false,
  },

  // ------------------------------------------------------------------ pagos
  payment_approved: {
    category: EMAIL_CATEGORIES.billing,
    templateEnv: 'BREVO_TEMPLATE_PAYMENT_APPROVED',
    subject: 'Recibimos tu pago · PLU ARG',
    entityType: 'payment',
    requiredParams: ['name', 'amount'],
    optOutAllowed: false,
    critical: false,
  },
  payment_receipt: {
    category: EMAIL_CATEGORIES.billing,
    templateEnv: 'BREVO_TEMPLATE_PAYMENT_RECEIPT',
    subject: 'Comprobante de pago · PLU ARG',
    entityType: 'payment',
    requiredParams: ['name', 'amount', 'reference'],
    optOutAllowed: false,
    critical: true,
  },
  payment_pending: {
    category: EMAIL_CATEGORIES.billing,
    templateEnv: 'BREVO_TEMPLATE_PAYMENT_PENDING',
    subject: 'Tu pago quedó pendiente · PLU ARG',
    entityType: 'payment',
    requiredParams: ['name'],
    optOutAllowed: false,
    critical: false,
  },
  payment_rejected: {
    category: EMAIL_CATEGORIES.billing,
    templateEnv: 'BREVO_TEMPLATE_PAYMENT_REJECTED',
    subject: 'No pudimos procesar tu pago · PLU ARG',
    entityType: 'payment',
    requiredParams: ['name'],
    optOutAllowed: false,
    critical: false,
  },

  // ---------------------------------------------------------------- eventos
  registration_confirmed: {
    category: EMAIL_CATEGORIES.event,
    templateEnv: 'BREVO_TEMPLATE_REGISTRATION_CONFIRMED',
    subject: 'Tu inscripción quedó confirmada · PLU ARG',
    entityType: 'event_registration',
    requiredParams: ['name', 'eventTitle'],
    optOutAllowed: false,
    critical: false,
  },
  ticket_confirmation: {
    category: EMAIL_CATEGORIES.event,
    templateEnv: 'BREVO_TEMPLATE_TICKET_CONFIRMATION',
    subject: 'Tu entrada · PLU ARG',
    entityType: 'ticket_order',
    requiredParams: ['name', 'eventTitle'],
    optOutAllowed: false,
    critical: true,
  },
  event_announcement: {
    category: EMAIL_CATEGORIES.event,
    templateEnv: 'BREVO_TEMPLATE_EVENT_ANNOUNCEMENT',
    subject: 'Nueva fecha en el calendario · PLU ARG',
    entityType: 'event',
    requiredParams: ['eventTitle'],
    optOutAllowed: true,
    critical: false,
  },
  event_reminder: {
    category: EMAIL_CATEGORIES.event,
    templateEnv: 'BREVO_TEMPLATE_EVENT_REMINDER',
    subject: 'Se acerca tu competencia · PLU ARG',
    entityType: 'event',
    requiredParams: ['eventTitle'],
    optOutAllowed: true,
    critical: false,
  },

  // ---------------------------------------------------------- operaciones
  admin_notification: {
    category: EMAIL_CATEGORIES.ops,
    templateEnv: 'BREVO_TEMPLATE_ADMIN_NOTIFICATION',
    subject: 'Aviso operativo · PLU ARG',
    entityType: 'admin_alert',
    requiredParams: ['message'],
    optOutAllowed: false,
    critical: false,
  },
  export_ready: {
    category: EMAIL_CATEGORIES.ops,
    templateEnv: 'BREVO_TEMPLATE_EXPORT_READY',
    subject: 'Tu exportación está lista · PLU ARG',
    entityType: 'export_job',
    requiredParams: ['downloadUrl'],
    optOutAllowed: false,
    critical: false,
  },
})

export const EMAIL_TYPES = Object.freeze(Object.keys(EMAIL_CATALOG))

/** Tipos que el panel admin puede disparar a mano desde `POST /api/emails/send`. */
export const MANUALLY_SENDABLE_EMAIL_TYPES = Object.freeze(
  EMAIL_TYPES.filter((type) => EMAIL_CATALOG[type].category !== EMAIL_CATEGORIES.account),
)

export function getEmailDefinition(type) {
  return EMAIL_CATALOG[type] ?? null
}

export function isKnownEmailType(type) {
  return Object.hasOwn(EMAIL_CATALOG, type)
}

/**
 * Devuelve el template ID numérico de Brevo, o `null` si no está cargado.
 * `null` no es un error: el dispatcher cae al fallback HTML del repo.
 */
export function resolveTemplateId(type, env = process.env) {
  const definition = getEmailDefinition(type)
  if (!definition) return null
  const raw = env[definition.templateEnv]
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Params declarados en el catálogo que llegaron vacíos. */
export function findMissingParams(type, params = {}) {
  const definition = getEmailDefinition(type)
  if (!definition) return []
  return definition.requiredParams.filter((key) => {
    const value = params[key]
    return value === undefined || value === null || value === ''
  })
}

/**
 * Estado de configuración por tipo, para el panel admin y el healthcheck.
 * Permite ver de un vistazo qué templates faltan cargar en el dashboard.
 */
export function describeCatalog(env = process.env) {
  return EMAIL_TYPES.map((type) => {
    const definition = EMAIL_CATALOG[type]
    const templateId = resolveTemplateId(type, env)
    return {
      type,
      category: definition.category,
      templateEnv: definition.templateEnv,
      templateId,
      // Sin template de Brevo el email igual sale, con el HTML del repo.
      delivery: templateId ? 'brevo_template' : 'html_fallback',
      optOutAllowed: definition.optOutAllowed,
      critical: definition.critical,
    }
  })
}
