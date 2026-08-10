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
 */

// Paleta — espejo de src/styles/tokens/palette.css
const INK_900 = '#1a1c22'
const INK_700 = '#3d424d'
const INK_500 = '#6b6f7a'
const CELESTE_600 = '#1f5f9e'
const GOLD_500 = '#f2b705'
const RED_500 = '#e10600'
const WARM_50 = '#f7f6f3'
const WARM_100 = '#f0efec'
const WHITE = '#ffffff'

const FONT_STACK = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif"

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
  return `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:${size};line-height:1.6;color:${color};">${html}</p>`
}

/** CTA principal. Dorado = acción, según los roles semánticos de la paleta. */
function button(url, label) {
  const href = safeUrl(url)
  if (!href) return ''
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
      <tr>
        <td style="background-color:${GOLD_500};border-radius:8px;">
          <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;color:${INK_900};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`
}

/** Link de respaldo: varios clientes de correo no permiten tocar el botón. */
function fallbackLink(url) {
  const href = safeUrl(url)
  if (!href) return ''
  return `<p style="margin:0 0 20px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${INK_500};word-break:break-all;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br><span style="color:${CELESTE_600};">${href}</span></p>`
}

/**
 * Ficha de datos. Un solo acento por bloque, sin decoración extra.
 *
 * El acento va como borde completo de 1px y no como barra lateral gruesa: la
 * pestaña de color a la izquierda es uno de los tells más reconocibles de
 * interfaz generada por IA, y este repo ya tuvo esa observación de PLU USA
 * (`PLU_BRAND_ALIGNMENT.md` §7). Una caja delimitada lee más institucional y
 * se renderiza igual de bien en Outlook.
 */
function dataPanel(rows, { accent = CELESTE_600 } = {}) {
  const body = rows
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 0;font-family:${FONT_STACK};font-size:13px;color:${INK_500};">${escapeHtml(label)}</td>
          <td style="padding:6px 0;font-family:${FONT_STACK};font-size:14px;font-weight:600;color:${INK_900};text-align:right;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join('')
  if (!body) return ''
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:${WARM_50};border:1px solid ${accent};border-radius:6px;">
      <tr><td style="padding:16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
      </td></tr>
    </table>`
}

/** Aviso acotado (vencimiento del enlace, contraseña temporal). Misma forma
 *  de caja delimitada que `dataPanel`, por la misma razón. */
function noticePanel(html, { accent = RED_500 } = {}) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background-color:${WARM_50};border:1px solid ${accent};border-radius:6px;">
      <tr><td style="padding:14px 20px;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:${INK_700};">${html}</td></tr>
    </table>`
}

/**
 * Cascarón institucional. `preheader` es el texto de vista previa de la
 * bandeja: si no se define, el cliente muestra el primer texto que encuentra,
 * que suele ser el wordmark del encabezado.
 */
function layout({ title, preheader, body, footerNote = '' }) {
  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${WARM_100};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader ?? title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${WARM_100};padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${WHITE};border-radius:12px;overflow:hidden;">

      <tr><td style="background-color:${INK_900};padding:26px 32px;">
        <span style="font-family:${FONT_STACK};font-size:17px;font-weight:700;letter-spacing:0.12em;color:${WHITE};text-transform:uppercase;">PLU Argentina</span>
      </td></tr>

      <!-- Firma de marca: equivalente sólido de --gradient-brand -->
      <tr><td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" height="3" style="background-color:${CELESTE_600};font-size:0;line-height:0;">&nbsp;</td>
            <td width="50%" height="3" style="background-color:${GOLD_500};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:36px 32px 12px;">
        <h1 style="margin:0 0 20px;font-family:${FONT_STACK};font-size:23px;font-weight:700;line-height:1.3;color:${INK_900};">${escapeHtml(title)}</h1>
        ${body}
      </td></tr>

      <tr><td style="padding:20px 32px 32px;border-top:1px solid ${WARM_100};">
        <p style="margin:0 0 6px;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${INK_500};">Powerlifting United Argentina</p>
        ${footerNote ? `<p style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${INK_500};">${footerNote}</p>` : ''}
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
      paragraph(`${greeting(p.name)} tu cuenta en Powerlifting United Argentina ya está creada.`),
      paragraph(
        'Desde tu panel podés completar tu perfil, afiliarte, inscribirte a las fechas del calendario y seguir el estado de tus pagos.',
      ),
      button(p.accountUrl, 'Ir a mi cuenta'),
      fallbackLink(p.accountUrl),
      paragraph(
        'Todavía no estás afiliado: la afiliación es un trámite aparte y es lo que te habilita a competir en las fechas oficiales.',
        { muted: true },
      ),
    ].join(''),
  }),

  email_verification: (p) => ({
    title: 'Bienvenido a PLU ARG',
    preheader: 'Confirma tu correo para activar tu cuenta.',
    body: [
      paragraph(`${greeting(p.name)} tu cuenta en Powerlifting United Argentina ya esta creada.`),
      paragraph(
        'Para completar el registro y poder gestionar tu afiliacion, inscripciones y comprobantes, confirma tu correo con el boton de abajo.',
      ),
      button(p.verificationUrl, 'Confirmar mi correo'),
      fallbackLink(p.verificationUrl),
      paragraph(
        'Si no creaste esta cuenta, podes ignorar este correo.',
        { muted: true },
      ),
    ].join(''),
  }),

  password_reset: (p) => ({
    title: 'Restablecé tu contraseña',
    preheader: 'El enlace vence en 30 minutos.',
    body: [
      paragraph(`${greeting(p.name)} recibimos un pedido para restablecer la contraseña de tu cuenta.`),
      button(p.resetUrl, 'Crear nueva contraseña'),
      fallbackLink(p.resetUrl),
      noticePanel(
        `El enlace vence en ${escapeHtml(p.expiresInMinutes ?? 30)} minutos y se puede usar una sola vez. Si no pediste este cambio, ignorá este correo: tu contraseña actual sigue funcionando.`,
        { accent: CELESTE_600 },
      ),
    ].join(''),
  }),

  security_access: (p) => ({
    title: 'Tu acceso de control en puerta',
    preheader: `Acceso para ${p.eventTitle || 'el evento'}.`,
    body: [
      paragraph(`${greeting(p.name)} te habilitamos el acceso al control de puerta.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Usuario', p.email],
        ...(p.hasPassword && p.tempPassword ? [['Contraseña temporal', p.tempPassword]] : []),
      ]),
      button(p.gateUrl, 'Abrir control de puerta'),
      fallbackLink(p.gateUrl),
      p.hasPassword
        ? noticePanel('Cambiá la contraseña temporal la primera vez que entres.', { accent: GOLD_500 })
        : '',
    ].join(''),
  }),

  affiliation_started: (p) => ({
    title: 'Tu afiliación está en curso',
    preheader: 'Estamos procesando tu afiliación.',
    body: [
      paragraph(`${greeting(p.name)} registramos tu pago y estamos procesando tu afiliación anual.`),
      dataPanel([
        ['Referencia', p.reference],
        ['Estado', 'En procesamiento'],
      ]),
      paragraph('Cuando quede activa te avisamos por este mismo medio y vas a ver tu credencial en el panel.'),
      button(p.accountUrl, 'Ver mi cuenta'),
    ].join(''),
  }),

  affiliation_approved: (p) => ({
    title: 'Tu afiliación quedó activa',
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
      paragraph('Ya podés inscribirte a las fechas oficiales del calendario.'),
      button(p.accountUrl, 'Ver mi credencial'),
    ].join(''),
  }),

  membership_renewal: (p) => ({
    title: 'Tu afiliación está por vencer',
    preheader: `Vence el ${formatDate(p.expirationDate)}.`,
    body: [
      paragraph(`${greeting(p.name)} tu afiliación a PLU Argentina vence pronto.`),
      dataPanel(
        [
          ['Número de socio', p.memberCode],
          ['Vence el', formatDate(p.expirationDate)],
        ],
        { accent: GOLD_500 },
      ),
      paragraph('Renovándola mantenés la habilitación para competir y tus resultados en el ranking.'),
      button(p.renewalUrl, 'Renovar afiliación'),
      fallbackLink(p.renewalUrl),
    ].join(''),
    footerNote: 'Recibís este aviso porque tenés una afiliación activa en PLU Argentina.',
  }),

  payment_approved: (p) => ({
    title: 'Recibimos tu pago',
    preheader: `Pago de ${formatArs(p.amount)} acreditado.`,
    body: [
      paragraph(`${greeting(p.name)} confirmamos la acreditación de tu pago.`),
      dataPanel([
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Referencia', p.reference],
      ]),
      paragraph('Guardá este correo como constancia.', { muted: true }),
    ].join(''),
  }),

  payment_receipt: (p) => ({
    title: 'Comprobante de pago',
    preheader: `Comprobante ${p.reference}.`,
    body: [
      paragraph(`${greeting(p.name)} este es el comprobante de tu pago a Powerlifting United Argentina.`),
      dataPanel([
        ['Comprobante', p.reference],
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Fecha', formatDate(p.paidAt)],
        ['Medio de pago', p.paymentMethod],
      ]),
      p.receiptUrl ? button(p.receiptUrl, 'Descargar comprobante') : '',
      p.receiptUrl ? fallbackLink(p.receiptUrl) : '',
      paragraph('Este comprobante no es una factura electrónica AFIP.', { muted: true }),
    ].join(''),
  }),

  payment_pending: (p) => ({
    title: 'Tu pago quedó pendiente',
    preheader: 'Todavía no se acreditó.',
    body: [
      paragraph(`${greeting(p.name)} tu pago se registró pero todavía no se acreditó.`),
      dataPanel([
        ['Concepto', p.concept],
        ['Importe', formatArs(p.amount)],
        ['Referencia', p.reference],
      ]),
      paragraph(
        'Algunos medios de pago tardan hasta 48 horas hábiles. Te avisamos apenas se confirme, no hace falta que pagues de nuevo.',
      ),
      button(p.accountUrl, 'Ver estado del pago'),
    ].join(''),
  }),

  payment_rejected: (p) => ({
    title: 'No pudimos procesar tu pago',
    preheader: 'El pago fue rechazado.',
    body: [
      paragraph(`${greeting(p.name)} el pago que intentaste no pudo procesarse.`),
      dataPanel(
        [
          ['Concepto', p.concept],
          ['Importe', formatArs(p.amount)],
          ['Motivo', p.reason],
        ],
        { accent: RED_500 },
      ),
      paragraph('No se te cobró nada. Podés intentar de nuevo con otro medio de pago.'),
      button(p.retryUrl, 'Reintentar el pago'),
      fallbackLink(p.retryUrl),
    ].join(''),
  }),

  registration_confirmed: (p) => ({
    title: 'Tu inscripción quedó confirmada',
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
      paragraph('Cerca de la fecha te enviamos el cronograma y los horarios de pesaje.'),
      button(p.eventUrl, 'Ver el evento'),
    ].join(''),
  }),

  ticket_confirmation: (p) => ({
    title: 'Tu entrada',
    preheader: `Entrada para ${p.eventTitle}.`,
    body: [
      paragraph(`${greeting(p.name)} esta es tu entrada para ${escapeHtml(p.eventTitle)}.`),
      dataPanel(
        [
          ['Evento', p.eventTitle],
          ['Fecha', formatDate(p.eventDate)],
          ['Sede', p.venue],
          ['Tipo', p.ticketType],
          ['Cantidad', p.quantity],
          ['Código', p.reference],
        ],
        { accent: GOLD_500 },
      ),
      button(p.ticketUrl, 'Ver mi entrada'),
      fallbackLink(p.ticketUrl),
      paragraph('Presentá el QR desde tu celular en la puerta. No hace falta imprimirlo.', { muted: true }),
    ].join(''),
  }),

  event_announcement: (p) => ({
    title: p.eventTitle ? String(p.eventTitle) : 'Nueva fecha en el calendario',
    preheader: p.summary ? String(p.summary) : 'Nueva fecha confirmada en el calendario.',
    body: [
      paragraph(`${greeting(p.name)} confirmamos una nueva fecha en el calendario oficial.`),
      dataPanel([
        ['Evento', p.eventTitle],
        ['Fecha', formatDate(p.eventDate)],
        ['Sede', p.venue],
        ['Inscripciones', p.registrationOpensAt ? formatDate(p.registrationOpensAt) : ''],
      ]),
      p.summary ? paragraph(escapeHtml(p.summary)) : '',
      button(p.eventUrl, 'Ver el evento'),
      fallbackLink(p.eventUrl),
    ].join(''),
    footerNote: p.unsubscribeUrl
      ? `Si no querés recibir avisos de nuevas fechas, <a href="${safeUrl(p.unsubscribeUrl)}" style="color:${CELESTE_600};">cancelá la suscripción</a>.`
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
      p.notes ? paragraph(escapeHtml(p.notes)) : '',
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
      p.actionUrl ? button(p.actionUrl, 'Abrir en el panel') : '',
    ].join(''),
    footerNote: 'Aviso automático del sistema. No responder.',
  }),

  export_ready: (p) => ({
    title: 'Tu exportación está lista',
    preheader: 'El archivo ya se puede descargar.',
    body: [
      paragraph(`${greeting(p.name)} terminamos de generar la exportación que pediste.`),
      dataPanel([
        ['Reporte', p.reportName],
        ['Registros', p.rowCount],
        ['Generado', formatDate(p.generatedAt)],
      ]),
      button(p.downloadUrl, 'Descargar archivo'),
      fallbackLink(p.downloadUrl),
      paragraph('El enlace vence en 24 horas por seguridad.', { muted: true }),
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
 */
export function renderEmail(type, params = {}, { subject: subjectOverride } = {}) {
  const build = BODIES[type]
  if (!build) return null

  const { title, preheader, body, footerNote } = build(params)
  const html = layout({ title, preheader, body, footerNote })

  return {
    subject: subjectOverride || title,
    htmlContent: html,
    textContent: toPlainText(html),
  }
}
