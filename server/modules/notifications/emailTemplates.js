/**
 * emailTemplates.js — PLU ARG
 *
 * Fallback HTML propio para cuando un tipo del catálogo todavía no tiene
 * cargado su template en el dashboard de Brevo. Antes, sin template ID el
 * email quedaba en `skipped` y no salía nunca: el atleta no recibía el link de
 * recuperación de contraseña ni el comprobante. Ahora sale igual, con la
 * identidad institucional, y el día que se carga el template en Brevo ese pasa
 * a tener prioridad automáticamente (ver `emailDispatcher.js`).
 *
 * Restricciones de email, distintas a las del sitio:
 *
 * - Layout con tablas y estilos inline. Gmail elimina `<style>` en varios
 *   clientes y Outlook/Word no soporta flex ni grid.
 * - Hex literales, no `var(--token)`: los clientes de correo no resuelven
 *   custom properties. Los valores salen de `src/styles/tokens/palette.css` y
 *   deben mantenerse sincronizados a mano si la paleta cambia.
 * - Fondo claro aunque el tema nativo del sitio sea oscuro. Un email de fondo
 *   oscuro se rompe al reenviarse o citarse, y varios clientes invierten
 *   colores por su cuenta.
 * - Sin gradientes: Outlook los ignora. La firma de marca (`--gradient-brand`)
 *   se reproduce como dos celdas sólidas celeste + dorado.
 * - Logo: emblema circular croppeado (`/brand/plu-argentina-email.png`).
 *   Si `APP_URL` es localhost/privada, se embebe como data URI porque los
 *   clientes de correo no pueden fetchear `http://localhost/...`.
 *   Header negro = solo marca. Título del mail en el cuerpo (ink sobre blanco).
 *
 * Previews abribles: `npm run email:previews` → `docs/email-previews/`.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Paleta — espejo de src/styles/tokens/palette.css
const INK_900 = '#1a1c22'
const INK_700 = '#3d424d'
const INK_500 = '#6b6f7a'
const CELESTE_600 = '#1f5f9e'
const GOLD_500 = '#f2b705'
const RED_500 = '#e10600'
const WARM_100 = '#f0efec'
const WHITE = '#ffffff'
/** Borde neutro de paneles — sin acento de color salvo estados fuertes. */
const BORDER_NEUTRAL = '#e4e3df'

const FONT_STACK = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/**
 * Monoespaciada para credenciales. No es decorativo: en Poppins la `l`
 * minúscula, la `I` mayúscula y el `1` son casi idénticas, y una contraseña
 * temporal se transcribe a mano. `SFMono`/`Consolas` cubren macOS y Windows,
 * que es de donde se leen estos mails.
 */
const MONO_STACK = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace"

/** Ruta pública del emblema circular PLU Argentina (header negro). */
export const EMAIL_LOGO_PATH = '/brand/plu-argentina-email.png'

const EMAIL_LOGO_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
  'public',
  'brand',
  'plu-argentina-email.png',
)

/** Cache del data URI: el PNG es chico (~47 KB) y se reusa en cada render. */
let embeddedLogoDataUri = null

/** Escapa texto para interpolar en el cuerpo del HTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Sanea una URL antes de meterla en un `href`. Los links salen de datos de
 * negocio, pero un `javascript:` o `data:` filtrado desde un param sería un
 * vector de phishing con nuestro dominio de remitente.
 */
export function safeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return escapeHtml(parsed.toString())
  } catch {
    return ''
  }
}

function isUnreachableEmailHost(appUrl) {
  const base = String(appUrl ?? '').trim()
  if (!base) return true
  try {
    const { hostname, protocol } = new URL(base)
    if (protocol !== 'http:' && protocol !== 'https:') return true
    const host = hostname.toLowerCase()
    return (
      host === 'localhost'
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || host === '::1'
      || host.endsWith('.local')
    )
  } catch {
    return true
  }
}

/**
 * Embebe el PNG del logo como data URI. Los clientes de correo no pueden
 * pedir imágenes a localhost; sin esto el header muestra el ícono roto.
 */
export function loadEmbeddedEmailLogo() {
  if (embeddedLogoDataUri !== null) return embeddedLogoDataUri
  try {
    const bytes = readFileSync(EMAIL_LOGO_FILE)
    embeddedLogoDataUri = `data:image/png;base64,${bytes.toString('base64')}`
  } catch {
    embeddedLogoDataUri = ''
  }
  return embeddedLogoDataUri
}

/** Solo tests: limpia la cache del data URI. */
export function resetEmbeddedEmailLogoCache() {
  embeddedLogoDataUri = null
}

/**
 * Arma la URL del logo para el `<img>`.
 * Acepta http(s), rutas relativas (previews locales) o data:image.
 * Si `appUrl` es local/privada, embebe el PNG para que el mail muestre marca.
 * Sin base válida y sin archivo cae a cadena vacía → wordmark tipográfico.
 */
export function buildEmailLogoUrl(appUrl, logoUrl) {
  const override = String(logoUrl ?? '').trim()
  if (override) {
    if (override.startsWith('data:image/')) return override
    if (override.startsWith('/') || override.startsWith('./') || override.startsWith('../')) {
      return escapeHtml(override)
    }
    return safeUrl(override)
  }

  if (isUnreachableEmailHost(appUrl)) {
    return loadEmbeddedEmailLogo()
  }

  const base = String(appUrl ?? '').trim().replace(/\/$/, '')
  try {
    return safeUrl(new URL(EMAIL_LOGO_PATH, `${base}/`).toString())
  } catch {
    return loadEmbeddedEmailLogo()
  }
}

export function formatArs(amount) {
  const numeric = Number(amount)
  if (!Number.isFinite(numeric)) return String(amount ?? '')
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(numeric)
}

export function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
}

// ---------------------------------------------------------------- fragmentos

function paragraph(html, { muted = false } = {}) {
  const color = muted ? INK_500 : INK_700
  const size = muted ? '13px' : '15px'
  return `<p style="margin:0 0 20px;font-family:${FONT_STACK};font-size:${size};line-height:1.6;color:${color};">${html}</p>`
}

/** CTA principal. Dorado = acción, según los roles semánticos de la paleta. */
function button(url, label) {
  const href = safeUrl(url)
  if (!href) return ''
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px;">
      <tr>
        <td style="background-color:${GOLD_500};border-radius:4px;">
          <a href="${href}" style="display:inline-block;padding:12px 20px;font-family:${FONT_STACK};font-size:14px;font-weight:600;line-height:1;color:${INK_900};text-decoration:none;border-radius:4px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`
}

/** Link de respaldo: URL muted, sin etiqueta. */
function fallbackLink(url) {
  const href = safeUrl(url)
  if (!href) return ''
  return `<p style="margin:0 0 24px;font-family:${FONT_STACK};font-size:11px;line-height:1.5;color:${INK_500};word-break:break-all;">${href}</p>`
}

/**
 * Ficha de datos editorial: labels uppercase + hairline.
 * Acento (oro/rojo) solo como regla superior de 2px en estados fuertes.
 */
function dataPanel(rows, { accent = null } = {}) {
  const filtered = rows.filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (!filtered.length) return ''
  const body = filtered
    .map(([label, value], index) => {
      const border = index < filtered.length - 1 ? `border-bottom:1px solid ${BORDER_NEUTRAL};` : ''
      return `
        <tr>
          <td style="padding:12px 0;${border}font-family:${FONT_STACK};font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:${INK_500};vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:12px 0;${border}font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${INK_900};text-align:right;vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`
    })
    .join('')
  const accentRule = accent
    ? `<tr><td colspan="2" style="padding:0 0 10px;font-size:0;line-height:0;"><div style="height:2px;background-color:${accent};line-height:2px;font-size:0;">&nbsp;</div></td></tr>`
    : ''
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${accentRule}
      ${body}
    </table>`
}

/**
 * Panel de credencial: el dato que el destinatario tiene que copiar.
 *
 * Se separa de `dataPanel` porque ahí la contraseña quedaba como una fila más
 * entre "Usuario" y "Rol", con el mismo peso que datos que sólo se leen. Acá
 * la jerarquía la dan el tamaño, la monoespaciada y el aire -- no un color de
 * acento: el oro queda reservado al CTA, que es la única acción del mail.
 */
function credentialPanel({ label, value, meta = null, caption = '' }) {
  if (!value) return ''
  // El usuario va adentro del mismo panel y no en una ficha aparte: son el par
  // que se copia junto, y separarlos dejaba una fila de datos suelta.
  const metaRow = meta?.value
    ? `
          <p style="margin:0 0 14px;font-family:${FONT_STACK};font-size:13px;line-height:1.4;color:${INK_700};">
            <span style="color:${INK_500};">${escapeHtml(meta.label)}:</span> <strong style="color:${INK_900};">${escapeHtml(meta.value)}</strong>
          </p>`
    : ''

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      <tr>
        <td style="background-color:${WARM_100};border:1px solid ${BORDER_NEUTRAL};border-radius:6px;padding:18px 20px;">
          ${metaRow}
          <p style="margin:0 0 8px;font-family:${FONT_STACK};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${INK_500};">${escapeHtml(label)}</p>
          <p style="margin:0;font-family:${MONO_STACK};font-size:24px;font-weight:700;letter-spacing:0.06em;line-height:1.3;color:${INK_900};word-break:break-all;">${escapeHtml(value)}</p>
          ${caption ? `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;color:${INK_500};">${caption}</p>` : ''}
        </td>
      </tr>
    </table>`
}

/** Aviso acotado: tipografía muted, sin caja. */
function noticePanel(html) {
  return `<p style="margin:0 0 20px;font-family:${FONT_STACK};font-size:13px;line-height:1.55;color:${INK_500};">${html}</p>`
}

/**
 * Header negro = solo marca (emblema + wordmark).
 * El título del mail vive en el cuerpo blanco.
 */
function brandHeader(logoHref) {
  const logoCell = logoHref
    ? `<img src="${logoHref}" alt="PLU Argentina" width="52" height="52" style="display:block;width:52px;height:52px;border:0;outline:none;text-decoration:none;">`
    : `<span style="display:inline-block;width:52px;height:52px;line-height:52px;text-align:center;font-family:${FONT_STACK};font-size:12px;font-weight:700;letter-spacing:0.08em;color:${WHITE};">PLU</span>`

  return `
      <tr><td style="background-color:${INK_900};padding:22px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle" style="vertical-align:middle;padding:0 14px 0 0;">
              ${logoCell}
            </td>
            <td valign="middle" style="vertical-align:middle;">
              <span style="font-family:${FONT_STACK};font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:${WHITE};">PLU Argentina</span>
            </td>
          </tr>
        </table>
      </td></tr>`
}

/**
 * Cascarón institucional. `preheader` es el texto de vista previa de la
 * bandeja: si no se define, el cliente muestra el primer texto que encuentra.
 */
function layout({ title, preheader, body, footerNote = '', logoUrl = '' }) {
  const logoHref = logoUrl || ''
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style type="text/css">
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:${WARM_100};color:${INK_900};font-family:${FONT_STACK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader ?? title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${WARM_100};padding:40px 16px;font-family:${FONT_STACK};">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;background-color:${WHITE};border-radius:4px;overflow:hidden;font-family:${FONT_STACK};">

      ${brandHeader(logoHref)}

      <tr><td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" height="2" style="background-color:${CELESTE_600};font-size:0;line-height:0;">&nbsp;</td>
            <td width="50%" height="2" style="background-color:${GOLD_500};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:28px 28px 8px;background-color:${WHITE};font-family:${FONT_STACK};">
        <h1 style="margin:0 0 16px;font-family:${FONT_STACK};font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;color:${INK_900};">${escapeHtml(title)}</h1>
        ${body}
      </td></tr>

      <tr><td style="padding:8px 28px 28px;background-color:${WHITE};">
        <p style="margin:0;font-family:${FONT_STACK};font-size:11px;line-height:1.55;letter-spacing:0.06em;text-transform:uppercase;color:${INK_500};">Powerlifting United Argentina</p>
        ${footerNote ? `<p style="margin:8px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.5;letter-spacing:0;text-transform:none;color:${INK_500};">${footerNote}</p>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

/** Versión texto plano. Mejora entregabilidad y cubre clientes sin HTML. */
function toPlainText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|h1|h2|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

const greeting = (name) => (name ? `Hola ${escapeHtml(name)},` : 'Hola,')

// ------------------------------------------------------------- cuerpos

const BODIES = {
  welcome: (p) => ({
    title: 'Te damos la bienvenida',
    preheader: 'Tu cuenta en PLU Argentina ya está creada.',
    body: [
      paragraph(`${greeting(p.name)} tu cuenta ya está lista.`),
      button(p.accountUrl, 'Ir a mi cuenta'),
      fallbackLink(p.accountUrl),
      paragraph('La afiliación es un trámite aparte.', { muted: true }),
    ].join(''),
  }),

  email_verification: (p) => ({
    title: 'Te damos la bienvenida a PLU Argentina',
    preheader: 'Confirmá tu correo para activar tu cuenta.',
    body: [
      paragraph(
        `${greeting(p.name)} tu cuenta ya está creada. Confirmá tu correo para afiliarte e inscribirte a torneos.`,
      ),
      button(p.verificationUrl, 'Confirmar correo'),
      fallbackLink(p.verificationUrl),
      credentialPanel({
        label: 'Código de verificación',
        value: p.verificationCode,
        caption: 'Si el botón no abre, ingresá este código en Mi cuenta.',
      }),
      paragraph('Si no creaste esta cuenta, ignorá este correo.', { muted: true }),
    ].join(''),
  }),

  password_reset: (p) => ({
    title: 'Restablecé tu contraseña',
    preheader: 'El enlace vence en 30 minutos.',
    body: [
      paragraph(`${greeting(p.name)} pediste restablecer tu contraseña.`),
      button(p.resetUrl, 'Nueva contraseña'),
      fallbackLink(p.resetUrl),
      noticePanel(
        `El enlace vence en ${escapeHtml(p.expiresInMinutes ?? 30)} minutos. Si no pediste este cambio, ignorá el correo.`,
      ),
    ].join(''),
  }),

  security_access: (p) => ({
    title: 'Acceso de control en puerta',
    preheader: `Acceso para ${p.eventTitle || 'el evento'}.`,
    body: [
      paragraph(`${greeting(p.name)} te habilitamos el acceso al control de puerta.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Usuario', p.email],
        ...(p.hasPassword && p.tempPassword ? [['Contraseña temporal', p.tempPassword]] : []),
      ]),
      button(p.gateUrl, 'Abrir control'),
      fallbackLink(p.gateUrl),
      p.hasPassword ? noticePanel('Cambiá la contraseña temporal la primera vez que entres.') : '',
    ].join(''),
  }),

  staff_invitation: (p) => ({
    title: 'Tu acceso al panel',
    preheader: `Activá tu acceso al panel${
      p.expiresInDays ? ` · vence en ${p.expiresInDays} días` : ''
    }.`,
    body: [
      paragraph(
        `${greeting(p.name)} te dimos de alta en el panel de PLU Argentina${
          p.roleName ? ` con el rol <strong>${escapeHtml(p.roleName)}</strong>` : ''
        }. Usá el siguiente enlace personal para elegir tu contraseña:`,
      ),
      dataPanel([['Usuario', p.email], ...(p.roleName ? [['Rol', p.roleName]] : [])]),
      button(p.invitationUrl, 'Crear mi contraseña'),
      fallbackLink(p.invitationUrl),
      noticePanel(
        `El enlace es personal, se puede usar una sola vez${
          p.expiresInDays ? ` y vence en ${escapeHtml(p.expiresInDays)} días` : ''
        }. Si no esperabas esta invitación, ignorá el correo.`,
      ),
    ].join(''),
  }),

  staff_email_change: (p) => ({
    title: 'Confirmá tu nuevo email',
    preheader: 'Confirmá el cambio para empezar a usar esta dirección.',
    body: [
      paragraph(
        `${greeting(p.name)} pediste usar <strong>${escapeHtml(p.newEmail)}</strong> como email de tu cuenta del panel.`,
      ),
      button(p.verificationUrl, 'Confirmar el cambio'),
      fallbackLink(p.verificationUrl),
      noticePanel(
        'El enlace vence en 24 horas. Hasta que lo confirmes seguís entrando con tu email anterior. Si no pediste este cambio, ignorá el correo.',
      ),
    ].join(''),
  }),

  staff_email_changed: (p) => ({
    title: 'Se cambió el email de tu cuenta',
    preheader: 'Aviso de seguridad de tu cuenta del panel.',
    body: [
      paragraph(
        `${greeting(p.name)} el email de tu cuenta del panel pasó a ser <strong>${escapeHtml(p.newEmail)}</strong>. A partir de ahora tenés que entrar con esa dirección.`,
      ),
      noticePanel(
        'Si no pediste este cambio, escribinos ahora mismo respondiendo este correo: tu cuenta puede estar comprometida.',
      ),
    ].join(''),
  }),

  affiliation_started: (p) => ({
    title: 'Afiliación en curso',
    preheader: 'Estamos procesando tu afiliación.',
    body: [
      paragraph(`${greeting(p.name)} registramos tu pago y estamos procesando tu afiliación.`),
      dataPanel([
        ['Referencia', p.reference],
        ['Estado', 'En procesamiento'],
      ]),
      button(p.accountUrl, 'Ver mi cuenta'),
    ].join(''),
  }),

  affiliation_approved: (p) => ({
    title: 'Afiliación activa',
    preheader: 'Ya podés competir en las fechas oficiales.',
    body: [
      paragraph(`${greeting(p.name)} tu afiliación a PLU Argentina está activa.`),
      dataPanel(
        [
          ['Número de socio', p.memberCode],
          ['Vigencia hasta', formatDate(p.expirationDate)],
        ],
        { accent: GOLD_500 },
      ),
      paragraph('En tu perfil te espera el código QR asociado a tu afiliación.'),
      button(p.accountUrl, 'Ver credencial'),
    ].join(''),
  }),

  affiliation_cancelled: (p) => ({
    title: p.status === 'reembolsada' ? 'Afiliación reintegrada' : 'Afiliación cancelada',
    preheader: 'Registramos un cambio en el estado de tu afiliación.',
    body: [
      paragraph(`${greeting(p.name)} tu afiliación cambió de estado.`),
      dataPanel([
        ['Número de socio', p.memberCode],
        ['Estado', p.status === 'reembolsada' ? 'Reintegrada' : 'Cancelada'],
      ]),
      p.accountUrl ? button(p.accountUrl, 'Ver mi cuenta') : '',
      paragraph('Si no reconocés este cambio, respondé este correo para que podamos revisarlo.', { muted: true }),
    ].join(''),
  }),

  membership_renewal: (p) => ({
    title: 'Afiliación por vencer',
    preheader: `Vence el ${formatDate(p.expirationDate)}.`,
    body: [
      paragraph(`${greeting(p.name)} tu afiliación vence pronto.`),
      dataPanel(
        [
          ['Número de socio', p.memberCode],
          ['Vence el', formatDate(p.expirationDate)],
        ],
        { accent: GOLD_500 },
      ),
      button(p.renewalUrl, 'Renovar'),
      fallbackLink(p.renewalUrl),
    ].join(''),
    footerNote: 'Recibís este aviso porque tenés una afiliación activa.',
  }),

  payment_approved: (p) => ({
    title: 'Pago recibido',
    preheader: `Pago de ${formatArs(p.amount)} acreditado.`,
    body: [
      paragraph(`${greeting(p.name)} confirmamos la acreditación de tu pago.`),
      dataPanel([
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Referencia', p.reference],
      ]),
    ].join(''),
  }),

  payment_receipt: (p) => ({
    title: 'Comprobante de pago',
    preheader: `Comprobante ${p.reference}.`,
    body: [
      paragraph(`${greeting(p.name)} este es el comprobante de tu pago.`),
      dataPanel([
        ['Comprobante', p.reference],
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Fecha', formatDate(p.paidAt)],
        ['Medio', p.paymentMethod],
      ]),
      p.receiptUrl ? button(p.receiptUrl, 'Descargar') : '',
      p.receiptUrl ? fallbackLink(p.receiptUrl) : '',
      paragraph('No es una factura electrónica AFIP.', { muted: true }),
    ].join(''),
  }),

  payment_refunded: (p) => ({
    title: 'Pago reintegrado',
    preheader: `Reintegro de ${formatArs(p.amount)} registrado.`,
    body: [
      paragraph(`${greeting(p.name)} registramos el reintegro de tu pago.`),
      dataPanel([
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Referencia', p.reference],
      ]),
      paragraph('La acreditación final puede demorar según el medio de pago.', { muted: true }),
    ].join(''),
  }),

  payment_pending: (p) => ({
    title: 'Pago pendiente',
    preheader: 'Todavía no se acreditó.',
    body: [
      paragraph(`${greeting(p.name)} tu pago se registró pero todavía no se acreditó.`),
      dataPanel([
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Referencia', p.reference],
      ]),
      paragraph('Algunos medios tardan hasta 48 h hábiles.', { muted: true }),
      button(p.accountUrl, 'Ver estado'),
    ].join(''),
  }),

  payment_rejected: (p) => ({
    title: 'Pago rechazado',
    preheader: 'El pago fue rechazado.',
    body: [
      paragraph(`${greeting(p.name)} el pago no pudo procesarse. No se te cobró nada.`),
      dataPanel(
        [
          ['Concepto', p.concept],
          ['Importe', formatArs(p.amount)],
          ['Motivo', p.reason],
        ],
        { accent: RED_500 },
      ),
      button(p.retryUrl, 'Reintentar'),
      fallbackLink(p.retryUrl),
    ].join(''),
  }),

  registration_confirmed: (p) => ({
    title: 'Inscripción confirmada',
    preheader: `Estás inscripto en ${p.eventTitle}.`,
    body: [
      paragraph(`${greeting(p.name)} tu inscripción quedó confirmada.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Fecha', formatDate(p.eventDate)],
        ['Sede', p.venue],
        ['División', p.division],
        ['Categoría', p.category],
      ]),
      paragraph('En tu perfil te espera el código QR asociado a tu cuenta.'),
      button(p.eventUrl, 'Ver evento'),
    ].join(''),
  }),

  ticket_confirmation: (p) => ({
    title: 'Tu entrada',
    preheader: `Entrada para ${p.eventTitle}.`,
    body: [
      paragraph(`${greeting(p.name)} esta es tu entrada para ${escapeHtml(p.eventTitle)}.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Fecha', formatDate(p.eventDate)],
        ['Sede', p.venue],
        ['Tipo', p.ticketType],
        ['Cantidad', p.quantity],
        ['Código', p.reference],
      ]),
      button(p.ticketUrl, 'Ver entrada'),
      fallbackLink(p.ticketUrl),
      paragraph('Presentá el QR desde el celular.', { muted: true }),
    ].join(''),
  }),

  event_announcement: (p) => ({
    title: p.eventTitle ? String(p.eventTitle) : 'Nueva fecha',
    preheader: p.summary ? String(p.summary) : 'Nueva fecha confirmada en el calendario.',
    body: [
      paragraph(`${greeting(p.name)} hay una nueva fecha en el calendario oficial.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Fecha', formatDate(p.eventDate)],
        ['Sede', p.venue],
        ['Inscripciones', p.registrationOpensAt ? formatDate(p.registrationOpensAt) : ''],
      ]),
      p.summary ? paragraph(escapeHtml(p.summary), { muted: true }) : '',
      button(p.eventUrl, 'Ver evento'),
      fallbackLink(p.eventUrl),
    ].join(''),
    footerNote: p.unsubscribeUrl
      ? `Si no querés recibir avisos, <a href="${safeUrl(p.unsubscribeUrl)}" style="color:${CELESTE_600};">cancelá la suscripción</a>.`
      : '',
  }),

  event_reminder: (p) => ({
    title: 'Se acerca tu competencia',
    preheader: `${p.eventTitle} el ${formatDate(p.eventDate)}.`,
    body: [
      paragraph(`${greeting(p.name)} falta poco para ${escapeHtml(p.eventTitle)}.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Fecha', formatDate(p.eventDate)],
        ['Sede', p.venue],
        ['Pesaje', p.weighInTime],
      ]),
      p.notes ? paragraph(escapeHtml(p.notes), { muted: true }) : '',
      button(p.eventUrl, 'Ver cronograma'),
    ].join(''),
    footerNote: p.unsubscribeUrl
      ? `Si no querés recibir recordatorios, <a href="${safeUrl(p.unsubscribeUrl)}" style="color:${CELESTE_600};">cancelá la suscripción</a>.`
      : '',
  }),

  admin_notification: (p) => ({
    title: p.subject ? String(p.subject) : 'Aviso operativo',
    preheader: 'Aviso operativo interno.',
    body: [
      paragraph(escapeHtml(p.message)),
      dataPanel([
        ['Origen', p.source],
        ['Entidad', p.entityLabel],
        ['Severidad', p.severity],
      ]),
      p.actionUrl ? button(p.actionUrl, 'Abrir panel') : '',
    ].join(''),
    footerNote: 'Aviso automático. No responder.',
  }),

  export_ready: (p) => ({
    title: 'Exportación lista',
    preheader: 'El archivo ya se puede descargar.',
    body: [
      paragraph(`${greeting(p.name)} la exportación que pediste ya está lista.`),
      dataPanel([
        ['Reporte', p.reportName],
        ['Registros', p.rowCount],
        ['Generado', formatDate(p.generatedAt)],
      ]),
      button(p.downloadUrl, 'Descargar'),
      fallbackLink(p.downloadUrl),
      paragraph('El enlace vence en 24 horas.', { muted: true }),
    ].join(''),
  }),
}

export function hasHtmlFallback(type) {
  return Object.hasOwn(BODIES, type)
}

/**
 * Devuelve `{ subject, htmlContent, textContent }` listos para Brevo.
 * `subjectOverride` permite que un caller fije el asunto (por ejemplo el
 * anuncio de evento, cuyo título lo escribe un operador desde el panel).
 * `appUrl` / `logoUrl` alimentan el logo absoluto del encabezado.
 */
export function renderEmail(type, params = {}, { subject: subjectOverride, appUrl, logoUrl } = {}) {
  const build = BODIES[type]
  if (!build) return null

  const { title, preheader, body, footerNote } = build(params)
  const resolvedLogo = buildEmailLogoUrl(appUrl ?? params.appUrl, logoUrl ?? params.logoUrl)
  const html = layout({ title, preheader, body, footerNote, logoUrl: resolvedLogo })

  return {
    subject: subjectOverride || title,
    htmlContent: html,
    textContent: toPlainText(html),
  }
}
