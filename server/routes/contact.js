import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../lib/validate.js'
import { publicWriteLimiter } from '../middleware/rateLimit.js'
import { createBrevoAdapter } from '../modules/notifications/brevoAdapter.js'

const MOTIVES = ['atleta', 'gimnasio', 'organizacion', 'pluusa']

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(4000),
  motive: z.enum(MOTIVES).optional().default('atleta'),
})

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Bandeja de Contacto: hoy es un solo email a `CONTACT_NOTIFY_EMAIL` (por
 * defecto la misma dirección `hola@pluarg.com.ar` que ya se muestra en la
 * página) con reply-to del remitente, para que Comunicación conteste
 * directo desde su cliente de mail. No hay tabla propia todavía — si el
 * volumen lo justifica más adelante, el archivo pasa a ser esa bandeja.
 */
export function createContactRoutes(deps = {}) {
  const router = Router()
  const brevo = deps.brevo ?? createBrevoAdapter({ env: deps.env ?? process.env })
  const env = deps.env ?? process.env
  const notifyEmail = env.CONTACT_NOTIFY_EMAIL?.trim() || 'hola@pluarg.com.ar'

  router.post('/', publicWriteLimiter, validateBody(contactSchema), async (req, res, next) => {
    try {
      const { name, email, message, motive } = req.validatedBody
      await brevo.send({
        to: notifyEmail,
        replyTo: email,
        subject: `Contacto PLU (${motive}) — ${name}`,
        htmlContent: [
          `<p><strong>Motivo:</strong> ${escapeHtml(motive)}</p>`,
          `<p><strong>Nombre:</strong> ${escapeHtml(name)}</p>`,
          `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
          '<p><strong>Mensaje:</strong></p>',
          `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
        ].join('\n'),
        textContent: `Motivo: ${motive}\nNombre: ${name}\nEmail: ${email}\n\n${message}`,
        tags: ['contact-form'],
      })
      res.status(200).json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  return router
}
