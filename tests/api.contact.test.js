import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

describe('POST /api/contact', () => {
  it('manda el mensaje por email a la bandeja de contacto con reply-to del remitente', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'abc' })
    const target = listen(createApp({ brevo: { send } }))
    try {
      const response = await fetch(`${target.url}/api/contact`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          name: 'Agustín',
          email: 'agus@example.com',
          message: 'Quiero afiliarme para el próximo meet.',
          motive: 'atleta',
        }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
      expect(send).toHaveBeenCalledTimes(1)
      const [payload] = send.mock.calls[0]
      expect(payload.replyTo).toBe('agus@example.com')
      expect(payload.subject).toContain('Agustín')
      expect(payload.htmlContent).toContain('Quiero afiliarme')
    } finally {
      await target.close()
    }
  })

  it('rechaza un email invalido sin llegar a mandar nada', async () => {
    const send = vi.fn()
    const target = listen(createApp({ brevo: { send } }))
    try {
      const response = await fetch(`${target.url}/api/contact`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          name: 'Agustín',
          email: 'no-es-mail',
          message: 'hola',
        }),
      })

      expect(response.status).toBe(400)
      expect(send).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('devuelve 503 si Brevo no está configurado', async () => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('Brevo no está configurado en el servidor.'), { status: 503 }),
    )
    const target = listen(createApp({ brevo: { send } }))
    try {
      const response = await fetch(`${target.url}/api/contact`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          name: 'Agustín',
          email: 'agus@example.com',
          message: 'hola',
        }),
      })

      expect(response.status).toBe(503)
    } finally {
      await target.close()
    }
  })
})
