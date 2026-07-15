import { HttpError } from '../../lib/errors.js'

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export function createBrevoAdapter({ env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = env.BREVO_API_KEY?.trim()
  const senderEmail = env.BREVO_SENDER_EMAIL?.trim()
  const senderName = env.BREVO_SENDER_NAME?.trim() || 'PLU ARG'

  return {
    configured: Boolean(apiKey && senderEmail),

    async sendTemplate({ to, templateId, params = {} }) {
      if (!apiKey || !senderEmail) throw new HttpError(503, 'Brevo no está configurado en el servidor.')
      const numericTemplateId = Number(templateId)
      if (!Number.isInteger(numericTemplateId) || numericTemplateId <= 0) {
        throw new HttpError(503, 'La plantilla de Brevo no está configurada.')
      }

      const response = await fetchImpl(BREVO_ENDPOINT, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email: to }],
          templateId: numericTemplateId,
          params,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new HttpError(502, body?.message ?? `Brevo respondió ${response.status}.`)
      }
      return body
    },
  }
}
