import { HttpError } from '../../lib/errors.js'

/**
 * brevoAdapter.js — PLU ARG
 *
 * Cliente de la API transaccional de Brevo (`POST /v3/smtp/email`).
 *
 * La versión anterior era un `fetch` pelado: sin timeout (una conexión colgada
 * bloqueaba el request de Express hasta que el cliente desistía), sin reintento
 * ante un 429 o un 502 pasajero, y con todos los fallos aplanados a un 502
 * genérico. Eso hacía imposible que el job de despacho distinguiera "reintentá
 * en un rato" de "esta dirección no existe, no insistas".
 *
 * Ahora:
 *
 * - Timeout por intento (`BREVO_TIMEOUT_MS`, 10s por defecto).
 * - Reintento con backoff exponencial y jitter para fallos transitorios,
 *   respetando `Retry-After` cuando Brevo lo manda.
 * - `BrevoError` con `retryable` y `providerCode`, para que el llamador decida.
 *
 * El reintento de acá es de segundos y cubre el hipo de red. El reintento de
 * horas (dirección temporalmente rechazada, cuota diaria agotada) lo maneja
 * `emailDispatchJob.js` sobre la cola persistida.
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 400
const MAX_BACKOFF_MS = 4_000

/**
 * Códigos de Brevo que no mejoran reintentando: el payload o la credencial
 * están mal, o el destinatario está bloqueado en la cuenta.
 * Ver https://developers.brevo.com/docs/error-codes
 */
const PERMANENT_PROVIDER_CODES = new Set([
  'invalid_parameter',
  'missing_parameter',
  'out_of_range',
  'unauthorized',
  'account_under_validation',
  'not_enough_credits',
  'document_not_found',
  'method_not_allowed',
])

export class BrevoError extends HttpError {
  constructor(
    message,
    { status = 502, retryable = false, providerCode = null, providerStatus = null } = {},
  ) {
    super(status, message)
    this.name = 'BrevoError'
    this.retryable = retryable
    this.providerCode = providerCode
    this.providerStatus = providerStatus
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Backoff exponencial con jitter, para no sincronizar reintentos del lote. */
function backoffDelay(attempt, retryAfterSeconds) {
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 30_000)
  }
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
  return exponential + Math.random() * 250
}

function parseRetryAfter(response) {
  const header = response.headers?.get?.('retry-after')
  if (!header) return null
  const seconds = Number(header)
  return Number.isFinite(seconds) ? seconds : null
}

function isRetryableStatus(status) {
  // 429 = cuota momentánea. 5xx = problema del lado de Brevo.
  // 408/425 = timeouts de borde. El resto son errores nuestros.
  return status === 429 || status === 408 || status === 425 || status >= 500
}

function normalizeRecipients(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((item) =>
      typeof item === 'string' ? { email: item.trim() } : { ...item, email: item?.email?.trim() },
    )
    .filter((item) => item.email)
}

export function createBrevoAdapter({
  env = process.env,
  fetchImpl = fetch,
  sleepImpl = sleep,
} = {}) {
  const apiKey = env.BREVO_API_KEY?.trim()
  const senderEmail = env.BREVO_SENDER_EMAIL?.trim()
  const senderName = env.BREVO_SENDER_NAME?.trim() || 'PLU ARG'
  const replyToEmail = env.BREVO_REPLY_TO_EMAIL?.trim() || senderEmail
  const timeoutMs = Number(env.BREVO_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
  const maxAttempts = Math.max(1, Number(env.BREVO_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS)

  function assertConfigured() {
    if (!apiKey || !senderEmail) {
      throw new BrevoError('Brevo no está configurado en el servidor.', {
        status: 503,
        retryable: false,
      })
    }
  }

  async function post(payload) {
    let lastError = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response
      try {
        response = await fetchImpl(BREVO_ENDPOINT, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify(payload),
          // AbortSignal.timeout evita que una conexión colgada bloquee el request.
          signal:
            typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
        })
      } catch (networkError) {
        // Red caída, DNS, timeout del abort: siempre vale la pena reintentar.
        lastError = new BrevoError(
          `No se pudo contactar a Brevo: ${networkError?.message ?? networkError}`,
          {
            status: 502,
            retryable: true,
          },
        )
        if (attempt < maxAttempts) {
          await sleepImpl(backoffDelay(attempt))
          continue
        }
        throw lastError
      }

      const body = await response.json().catch(() => ({}))
      if (response.ok) return body

      const providerCode = body?.code ?? null
      const retryable =
        isRetryableStatus(response.status) && !PERMANENT_PROVIDER_CODES.has(providerCode)

      lastError = new BrevoError(body?.message ?? `Brevo respondió ${response.status}.`, {
        status: response.status === 401 || response.status === 403 ? 503 : 502,
        retryable,
        providerCode,
        providerStatus: response.status,
      })

      if (!retryable || attempt === maxAttempts) throw lastError
      await sleepImpl(backoffDelay(attempt, parseRetryAfter(response)))
    }

    throw lastError ?? new BrevoError('Brevo no respondió.', { status: 502, retryable: true })
  }

  return {
    configured: Boolean(apiKey && senderEmail),

    /**
     * Envío unificado. Acepta `templateId` (template del dashboard) o
     * `subject` + `htmlContent` (fallback del repo). Si vienen ambos, gana el
     * template: es lo que el equipo editó por última vez.
     */
    async send({
      to,
      toName,
      cc,
      bcc,
      templateId,
      params = {},
      subject,
      htmlContent,
      textContent,
      replyTo,
      tags,
      headers,
      attachment,
    }) {
      assertConfigured()

      const recipients = normalizeRecipients(toName ? [{ email: to, name: toName }] : to)
      if (recipients.length === 0) {
        throw new BrevoError('Falta el destinatario del email.', { status: 400, retryable: false })
      }

      const payload = {
        sender: { email: senderEmail, name: senderName },
        to: recipients,
        replyTo: replyTo ? { email: replyTo } : replyToEmail ? { email: replyToEmail } : undefined,
      }

      if (cc) payload.cc = normalizeRecipients(cc)
      if (bcc) payload.bcc = normalizeRecipients(bcc)
      if (Array.isArray(tags) && tags.length > 0) payload.tags = tags.slice(0, 10)
      if (headers && Object.keys(headers).length > 0) payload.headers = headers
      if (Array.isArray(attachment) && attachment.length > 0) payload.attachment = attachment

      const numericTemplateId = Number(templateId)
      if (Number.isInteger(numericTemplateId) && numericTemplateId > 0) {
        payload.templateId = numericTemplateId
        payload.params = params
      } else if (subject && htmlContent) {
        payload.subject = subject
        payload.htmlContent = htmlContent
        if (textContent) payload.textContent = textContent
      } else {
        throw new BrevoError('El email necesita un templateId o subject + htmlContent.', {
          status: 400,
          retryable: false,
        })
      }

      return post(payload)
    },

    /** Compatibilidad con los llamadores previos al catálogo. */
    async sendTemplate({ to, templateId, params = {} }) {
      assertConfigured()
      const numericTemplateId = Number(templateId)
      if (!Number.isInteger(numericTemplateId) || numericTemplateId <= 0) {
        throw new BrevoError('La plantilla de Brevo no está configurada.', {
          status: 503,
          retryable: false,
        })
      }
      return this.send({ to, templateId: numericTemplateId, params })
    },

    /** Compatibilidad con los llamadores previos al catálogo. */
    async sendHtml({ to, subject, htmlContent, textContent }) {
      assertConfigured()
      if (!to || !subject || !htmlContent) {
        throw new BrevoError('Faltan datos para el email.', { status: 400, retryable: false })
      }
      return this.send({ to, subject, htmlContent, textContent })
    },
  }
}
