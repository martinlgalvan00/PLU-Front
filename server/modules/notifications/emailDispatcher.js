import { HttpError } from '../../lib/errors.js'
import { resolveDeploymentAppUrl } from '../../lib/deploymentEnvironment.js'
import { findMissingParams, getEmailDefinition, resolveTemplateId } from './emailCatalog.js'
import { hasHtmlFallback, renderEmail } from './emailTemplates.js'

/**
 * emailDispatcher.js — PLU ARG
 *
 * Camino único de salida de todo email transaccional. Antes convivían cinco:
 * `queueTransactionalEmail` (con log e idempotencia), `brevo.sendTemplate`
 * directo en el job de renovaciones, y `dispatchPasswordResetEmail` en
 * `routes/athletes.js`, que no dejaba ninguna traza. Si un atleta reclamaba que
 * no le llegó el mail de recuperación, no había forma de saber si se había
 * enviado.
 *
 * Responsabilidades, en orden:
 *
 *  1. Validar el tipo y reservar el intento por `idempotencyKey` en el outbox.
 *  2. Validar destinatario/params y aplicar supresiones dejando estado terminal.
 *  3. Evitar duplicados: un reintento de webhook de Mercado Pago no puede
 *     mandar dos veces el mismo comprobante.
 *  4. Elegir template de Brevo o fallback HTML del repo.
 *  5. Registrar el resultado y programar el reintento si el fallo es transitorio.
 *
 * Los llamadores lo invocan best-effort: un email caído nunca revierte una
 * operación de negocio ya confirmada.
 */

/**
 * Backoff de la cola persistida, en minutos por número de intento. Arranca
 * corto para el hipo pasajero y se abre hasta un día para cuota agotada o
 * buzón temporalmente lleno.
 */
const RETRY_SCHEDULE_MINUTES = [2, 10, 60, 360, 1440]
export const MAX_EMAIL_ATTEMPTS = RETRY_SCHEDULE_MINUTES.length + 1

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Motivos de supresión que frenan incluso a los emails críticos. */
const HARD_SUPPRESSION_REASONS = new Set(['hard_bounce', 'spam', 'blocked', 'invalid'])

export function nextRetryAt(attempt, now = new Date()) {
  const minutes = RETRY_SCHEDULE_MINUTES[attempt - 1]
  if (minutes === undefined) return null
  return new Date(now.getTime() + minutes * 60_000).toISOString()
}

export function buildIdempotencyKey(type, { entityType, entityId, to }) {
  return `email:${type}:${entityType ?? 'none'}:${entityId ?? to}`
}

export function redactSensitiveEmailParams(type, params = {}) {
  const sensitive = getEmailDefinition(type)?.sensitiveParams ?? []
  if (sensitive.length === 0) return params

  const stored = { ...params }
  for (const key of sensitive) {
    if (Object.hasOwn(stored, key) && stored[key] !== '') stored[key] = '[REDACTED]'
  }
  return stored
}

export function createEmailDispatcher({ repository, brevo, env = process.env, logger = console } = {}) {
  const appUrl = (resolveDeploymentAppUrl(env) || env.VITE_APP_URL || '').replace(/\/$/, '')

  /**
   * Decide con qué contenido sale el email.
   * El template de Brevo tiene prioridad: es lo que el equipo edita en el
   * dashboard. Sin template, cae al HTML del repo para que el mail salga igual.
   */
  function resolveContent(type, params, subjectOverride) {
    const templateId = resolveTemplateId(type, env)
    if (templateId) return { templateId, mode: 'brevo_template' }

    if (!hasHtmlFallback(type)) return { mode: 'none' }
    const definition = getEmailDefinition(type)
    const rendered = renderEmail(type, params, {
      // El catálogo define el asunto del fallback; el título visible del body
      // puede ser más corto. Un caller puede pisarlo con `input.subject`.
      subject: subjectOverride ?? definition?.subject,
      appUrl,
      logoUrl: env.EMAIL_LOGO_URL,
    })
    return { ...rendered, mode: 'html_fallback' }
  }

  async function isSuppressed(email, definition, suppressionCache) {
    // En un envío masivo el llamador precarga todas las supresiones de una
    // sola consulta (`repository.findSuppressions`) y las pasa acá, para no
    // ir a la base una vez por destinatario.
    let suppression
    if (suppressionCache) {
      suppression = suppressionCache.get(email) ?? null
    } else {
      if (typeof repository?.findSuppression !== 'function') return null
      suppression = await repository.findSuppression(email)
    }
    if (!suppression) return null

    // Un rebote duro o una denuncia de spam frenan todo: insistir daña la
    // reputación del dominio y el mail no llegaría igual.
    if (HARD_SUPPRESSION_REASONS.has(suppression.reason)) return suppression

    // Una desuscripción solo aplica a lo que se puede desuscribir. Nadie deja
    // de recibir su comprobante de pago por haber cortado los avisos de eventos.
    if (definition.optOutAllowed) return suppression

    return null
  }

  async function send(type, input = {}) {
    const definition = getEmailDefinition(type)
    if (!definition) {
      throw new HttpError(400, `Tipo de email desconocido: ${type}`)
    }

    const to = String(input.to ?? '').trim().toLowerCase()
    const params = { appUrl, ...(input.params ?? {}) }
    const missing = findMissingParams(type, params)
    const entityType = input.entityType ?? definition.entityType
    const entityId = input.entityId ?? null
    const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey(type, { entityType, entityId, to })

    // Sin repositorio (tests unitarios, scripts) se envía igual pero sin log
    // ni idempotencia. Es el modo degradado, no el esperado en producción.
    if (!repository) {
      if (!EMAIL_PATTERN.test(to)) {
        throw new HttpError(400, 'El destinatario del email no es válido.')
      }
      if (missing.length > 0) {
        throw new HttpError(422, `Faltan datos para el email ${type}: ${missing.join(', ')}.`)
      }
      const suppression = await isSuppressed(to, definition, input.suppressionCache)
      if (suppression) {
        logger.info?.('[email] destinatario suprimido', { type, reason: suppression.reason })
        return { status: 'suppressed', created: false, emailLog: null, reason: suppression.reason }
      }
      const content = resolveContent(type, params, input.subject)
      if (!brevo?.configured || content.mode === 'none') {
        logger.info?.('[Brevo mock]', { type, to })
        return { status: 'skipped', created: true, emailLog: null }
      }
      const response = await deliver({ type, to, input, definition, params, content })
      return { status: 'sent', created: true, emailLog: null, response }
    }

    // La reserva ocurre antes de las validaciones operativas y de la lista de
    // supresión. Así un flujo que intentó mandar un email incompleto o a una
    // dirección suprimida deja evidencia durable en Auditoría.
    const started = await repository.beginEmail({
      type,
      to,
      entityType,
      entityId,
      idempotencyKey,
      templateId: resolveTemplateId(type, env),
      category: definition.category,
      // Los links firmados, códigos y contraseñas sólo existen durante este
      // request. El outbox conserva el contexto auditable, nunca el bearer.
      params: redactSensitiveEmailParams(type, params),
    })

    // Ya existía: otro proceso (o un reintento de webhook) lo tomó primero.
    if (!started.created) {
      return { status: started.emailLog?.status ?? 'duplicate', created: false, emailLog: started.emailLog }
    }

    async function failPreflight(status, message, errorCode) {
      return repository.completeEmail(started.emailLog.id, {
        status,
        error: message,
        errorCode,
      })
    }

    if (!EMAIL_PATTERN.test(to)) {
      const message = 'El destinatario del email no es válido.'
      const error = new HttpError(400, message)
      error.emailLog = await failPreflight('failed', message, 'INVALID_RECIPIENT')
      throw error
    }

    if (missing.length > 0) {
      const message = `Faltan datos para el email ${type}: ${missing.join(', ')}.`
      const error = new HttpError(422, message)
      error.emailLog = await failPreflight('failed', message, 'MISSING_PARAMS')
      throw error
    }

    const suppression = await isSuppressed(to, definition, input.suppressionCache)
    if (suppression) {
      logger.info?.('[email] destinatario suprimido', { type, reason: suppression.reason })
      const emailLog = await failPreflight(
        'suppressed',
        `Envío suprimido: ${suppression.reason}.`,
        `SUPPRESSED_${String(suppression.reason).toUpperCase()}`,
      )
      return { status: 'suppressed', created: true, emailLog, reason: suppression.reason }
    }

    const content = resolveContent(type, params, input.subject)

    if (!brevo?.configured) {
      logger.info?.('[Brevo mock]', { type, to, idempotencyKey })
      const emailLog = await repository.completeEmail(started.emailLog.id, {
        status: 'skipped',
        error: 'Brevo no está configurado.',
      })
      return { status: 'skipped', created: true, emailLog }
    }

    if (content.mode === 'none') {
      const emailLog = await repository.completeEmail(started.emailLog.id, {
        status: 'skipped',
        error: `Sin template de Brevo (${definition.templateEnv}) ni fallback HTML.`,
      })
      return { status: 'skipped', created: true, emailLog }
    }

    try {
      const response = await deliver({ type, to, input, definition, params, content })
      const emailLog = await repository.completeEmail(started.emailLog.id, { status: 'sent', response })
      return { status: 'sent', created: true, emailLog, response }
    } catch (error) {
      const emailLog = await recordFailure(started.emailLog, error, 1, definition)
      // Se propaga para que el llamador decida. Todos los callers de negocio lo
      // atrapan: el email nunca revierte la operación que lo disparó.
      error.emailLog = emailLog
      throw error
    }
  }

  function deliver({ type, to, input = {}, definition, params, content }) {
    return brevo.send({
      to,
      toName: input.toName ?? params.name ?? undefined,
      templateId: content.templateId,
      params,
      subject: content.subject,
      htmlContent: content.htmlContent,
      textContent: content.textContent,
      replyTo: input.replyTo,
      attachment: input.attachment,
      // Las tags habilitan el filtrado por tipo y categoría en el panel de
      // Brevo, y llegan de vuelta en los eventos del webhook.
      tags: [`plu:${definition.category}`, `plu:type:${type}`],
    })
  }

  async function recordFailure(emailLog, error, attempt, definition) {
    // Un outbox persistente no puede reintentar una credencial sin guardarla en
    // claro. Esos emails se reemiten desde su flujo de negocio, generando un
    // token nuevo; los emails sin secretos conservan el backoff automático.
    const containsCredential = (definition?.sensitiveParams?.length ?? 0) > 0
    const retryable =
      !containsCredential && error?.retryable === true && attempt < MAX_EMAIL_ATTEMPTS
    return repository.completeEmail(emailLog.id, {
      status: retryable ? 'retrying' : 'failed',
      error: error?.message ?? String(error),
      errorCode: error?.providerCode ?? null,
      attempt,
      nextRetryAt: retryable ? nextRetryAt(attempt) : null,
    })
  }

  /**
   * Reintenta un email ya persistido. Lo usa `emailDispatchJob.js` sobre las
   * filas que `claimRetryableEmails` dejó reservadas.
   */
  async function retry(emailLog) {
    const type = emailLog.template_key ?? emailLog.templateKey
    const definition = getEmailDefinition(type)
    const attempt = Number(emailLog.attempts_count ?? emailLog.attemptsCount ?? 1) + 1

    if (!definition) {
      return repository.completeEmail(emailLog.id, {
        status: 'failed',
        error: `Tipo de email desconocido: ${type}`,
        attempt,
      })
    }

    if ((definition.sensitiveParams?.length ?? 0) > 0) {
      return repository.completeEmail(emailLog.id, {
        status: 'failed',
        error: 'La credencial fue redactada. Reemití el email desde su flujo de origen.',
        errorCode: 'SENSITIVE_PAYLOAD_REDACTED',
        attempt,
      })
    }

    if (!brevo?.configured) {
      return repository.completeEmail(emailLog.id, { status: 'skipped', error: 'Brevo no está configurado.', attempt })
    }

    const to = emailLog.recipient_email ?? emailLog.recipientEmail
    const params = emailLog.payload ?? {}
    const content = resolveContent(type, params)

    if (content.mode === 'none') {
      return repository.completeEmail(emailLog.id, {
        status: 'failed',
        error: `Sin template de Brevo (${definition.templateEnv}) ni fallback HTML.`,
        attempt,
      })
    }

    try {
      const response = await deliver({ type, to, definition, params, content })
      return repository.completeEmail(emailLog.id, { status: 'sent', response, attempt })
    } catch (error) {
      return recordFailure(emailLog, error, attempt, definition)
    }
  }

  return { send, retry, configured: Boolean(brevo?.configured) }
}
