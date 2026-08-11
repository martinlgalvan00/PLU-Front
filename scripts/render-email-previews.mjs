#!/usr/bin/env node
/**
 * render-email-previews.mjs — PLU ARG
 *
 * Genera HTML estáticos en docs/email-previews/ a partir del mismo
 * `renderEmail` que usa el fallback de producción. Sirve para revisar el
 * diseño en el navegador sin mandar mails reales.
 *
 * Uso:
 *   npm run email:previews
 *
 * La URL del logo usa APP_URL / VITE_APP_URL, o https://pluarg.com por defecto
 * (asset público `/brand/plu-official-logo.png`).
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderEmail } from '../server/modules/notifications/emailTemplates.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'docs', 'email-previews')

const appUrl = (process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'https://pluarg.com').replace(/\/$/, '')
/** Ruta relativa para que el emblema Argentina cargue al abrir el HTML. */
const previewLogoUrl = '../../public/brand/plu-argentina-email.png'

const FIXTURES = {
  email_verification: {
    name: 'Ana Gómez',
    verificationUrl: `${appUrl}/?verificar=preview-token`,
    verificationCode: '482913',
  },
  password_reset: {
    name: 'Ana Gómez',
    resetUrl: `${appUrl}/?reset=preview-token`,
    expiresInMinutes: 30,
  },
  staff_invitation: {
    name: 'Ana Gómez',
    email: 'ana.gomez@pluarg.com.ar',
    roleName: 'Administrador',
    invitationUrl: `${appUrl}/?invitacion-staff=preview-token`,
    expiresInDays: 7,
  },
  staff_email_change: {
    name: 'Ana Gómez',
    newEmail: 'ana.nueva@pluarg.com.ar',
    verificationUrl: `${appUrl}/?cambio-email=preview-token`,
  },
  staff_email_changed: {
    name: 'Ana Gómez',
    newEmail: 'ana.nueva@pluarg.com.ar',
  },
  payment_receipt: {
    name: 'Ana Gómez',
    reference: 'PLU-PAY-2048',
    concept: 'Afiliación anual 2026',
    amount: 45000,
    paidAt: '2026-08-10T15:00:00.000Z',
    paymentMethod: 'Mercado Pago',
    receiptUrl: `${appUrl}/mi-cuenta/pagos/PLU-PAY-2048`,
  },
  affiliation_approved: {
    name: 'Ana Gómez',
    memberCode: 'PLU-ARG-1042',
    expirationDate: '2027-08-10T00:00:00.000Z',
    accountUrl: `${appUrl}/mi-cuenta`,
  },
  registration_confirmed: {
    name: 'Ana Gómez',
    eventTitle: 'Pitbull Classic 2026',
    eventDate: '2026-11-15T12:00:00.000Z',
    venue: 'Buenos Aires',
    division: 'Open',
    category: '83 kg',
    eventUrl: `${appUrl}/eventos/pitbull-classic-2026`,
  },
  event_announcement: {
    name: 'Ana Gómez',
    eventTitle: 'Pitbull Classic 2026',
    eventDate: '2026-11-15T12:00:00.000Z',
    venue: 'Buenos Aires',
    registrationOpensAt: '2026-09-01T12:00:00.000Z',
    summary: 'Inscripciones abiertas para la fecha oficial.',
    eventUrl: `${appUrl}/eventos/pitbull-classic-2026`,
    unsubscribeUrl: `${appUrl}/desuscribir?preview=1`,
  },
}

mkdirSync(OUT_DIR, { recursive: true })

let written = 0
for (const [type, params] of Object.entries(FIXTURES)) {
  const rendered = renderEmail(type, params, { appUrl, logoUrl: previewLogoUrl })
  if (!rendered) {
    console.error(`Sin fallback para ${type}`)
    process.exitCode = 1
    continue
  }
  const path = join(OUT_DIR, `${type}.html`)
  writeFileSync(path, rendered.htmlContent, 'utf8')
  console.log(`  wrote ${type}.html  (${rendered.subject})`)
  written += 1
}

console.log(`\n${written} previews en docs/email-previews/ (logo local: ${previewLogoUrl})\n`)
