import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createBrevoAdapter, BrevoError } from '../server/modules/notifications/brevoAdapter.js'
import {
  EMAIL_TYPES,
  MANUALLY_SENDABLE_EMAIL_TYPES,
  describeCatalog,
  findMissingParams,
  resolveTemplateId,
} from '../server/modules/notifications/emailCatalog.js'
import { mapWithConcurrency } from '../server/lib/concurrency.js'
import { createEmailDispatcher, nextRetryAt } from '../server/modules/notifications/emailDispatcher.js'
import { createEventNotificationService } from '../server/modules/notifications/eventNotificationService.js'
import {
  buildPaymentConfirmationParams,
  createPaymentNotificationService,
} from '../server/modules/notifications/paymentNotificationService.js'
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
} from '../server/services/emailVerificationToken.js'
import { createPasswordResetToken } from '../server/services/passwordResetToken.js'
import {
  buildEmailVerificationUrl,
  readEmailVerificationToken,
} from '../src/lib/emailVerificationRoute.js'
import { hasHtmlFallback, renderEmail, safeUrl, buildEmailLogoUrl, EMAIL_LOGO_PATH } from '../server/modules/notifications/emailTemplates.js'

const okResponse = (body = { messageId: 'msg-1' }) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => body,
})

const errorResponse = (status, body = {}) => ({
  ok: false,
  status,
  headers: new Headers(),
  json: async () => body,
})

function memoryRepository() {
  const rows = new Map()
  const suppressions = new Map()
  return {
    rows,
    suppressions,
    async beginEmail(input) {
      if (rows.has(input.idempotencyKey)) {
        return { emailLog: rows.get(input.idempotencyKey), created: false }
      }
      const row = {
        id: `log-${rows.size + 1}`,
        idempotency_key: input.idempotencyKey,
        template_key: input.type,
        recipient_email: input.to,
        payload: input.params,
        status: 'processing',
        attempts_count: 1,
      }
      rows.set(input.idempotencyKey, row)
      return { emailLog: row, created: true }
    },
    // Espeja el mapeo a snake_case de supabaseNotificationRepository, para que
    // las aserciones sobre las columnas sean representativas.
    async completeEmail(id, patch) {
      const row = [...rows.values()].find((candidate) => candidate.id === id)
      row.status = patch.status
      row.error = patch.error ?? null
      row.error_code = patch.errorCode ?? null
      row.next_retry_at = patch.status === 'retrying' ? patch.nextRetryAt : null
      if (Number.isInteger(patch.attempt)) row.attempts_count = patch.attempt
      return row
    },
    async findSuppression(email) {
      return suppressions.get(email) ?? null
    },
  }
}

describe('migración de infraestructura de emails', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260730120000_email_infrastructure_hardening.sql'),
    'utf8',
  )
  const redactionMigration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260811153000_email_secret_redaction.sql'),
    'utf8',
  )

  it('agrega los estados de cola y las columnas de reintento', () => {
    for (const status of ['retrying', 'delivered', 'bounced', 'suppressed']) {
      expect(migration).toContain(`'${status}'`)
    }
    expect(migration).toContain('add column if not exists next_retry_at timestamptz')
    expect(migration).toContain('add column if not exists last_attempt_at timestamptz')
  })

  it('reserva el lote de forma atómica para no duplicar envíos entre instancias', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('create or replace function public.claim_retryable_emails')
  })

  it('rescata las filas colgadas en processing', () => {
    // Sin esto, una instancia que muere después de reservar el lote deja el
    // email muerto: el filtro del claim solo levanta 'retrying' y 'pending'.
    expect(migration).toContain("where status = 'processing'")
    expect(migration).toContain("last_attempt_at < now() - interval '15 minutes'")
  })

  it('nunca reintenta contra una dirección suprimida', () => {
    expect(migration).toContain('from public.email_suppressions s')
    expect(migration).toContain("s.reason in ('hard_bounce', 'spam', 'blocked', 'invalid')")
  })

  it('expone las RPC solo al service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.claim_retryable_emails(int) from public, anon, authenticated;',
    )
    expect(migration).toContain('grant execute on function public.claim_retryable_emails(int) to service_role;')
  })

  it('protege las tablas con RLS y lectura solo para staff', () => {
    expect(migration).toContain('alter table public.email_suppressions enable row level security;')
    expect(migration).toContain('public.can_view_admin_data()')
  })

  it('no suprime por rebote blando', () => {
    // Un buzón lleno pasajero no puede dejar a un socio sin comprobantes.
    const suppressionBlock = migration.slice(migration.indexOf('if p_event in ('))
    expect(suppressionBlock).toContain("'hard_bounce', 'blocked', 'spam', 'invalid_email', 'unsubscribed'")
    expect(suppressionBlock.slice(0, suppressionBlock.indexOf('then'))).not.toContain('soft_bounce')
  })

  it('redacta secretos históricos y corta sus reintentos', () => {
    for (const key of ['tempPassword', 'invitationUrl', 'gateUrl', 'resetUrl']) {
      expect(redactionMigration).toContain(`'${key}'`)
    }
    expect(redactionMigration).toContain("idempotency_key = 'email:redacted:' || id::text")
    expect(redactionMigration).toContain("status in ('pending', 'processing', 'retrying')")
    expect(redactionMigration).toContain("'SENSITIVE_PAYLOAD_REDACTED'")
  })
})

describe('catálogo de emails', () => {
  it('declara la variable de template y los params obligatorios de cada tipo', () => {
    for (const type of EMAIL_TYPES) {
      const [entry] = describeCatalog({}).filter((item) => item.type === type)
      expect(entry.templateEnv).toMatch(/^BREVO_TEMPLATE_[A-Z_]+$/)
      expect(entry.category).toBeTruthy()
    }
  })

  it('resuelve el template solo si el env trae un entero positivo', () => {
    expect(resolveTemplateId('welcome', { BREVO_TEMPLATE_WELCOME: '7' })).toBe(7)
    expect(resolveTemplateId('welcome', { BREVO_TEMPLATE_WELCOME: '' })).toBeNull()
    expect(resolveTemplateId('welcome', { BREVO_TEMPLATE_WELCOME: 'abc' })).toBeNull()
    expect(resolveTemplateId('welcome', { BREVO_TEMPLATE_WELCOME: '0' })).toBeNull()
  })

  it('marca los params faltantes antes de gastar una llamada a Brevo', () => {
    expect(findMissingParams('payment_receipt', { name: 'Ana', amount: 1000 })).toEqual(['reference'])
    expect(findMissingParams('payment_receipt', { name: 'Ana', amount: 1000, reference: 'X' })).toEqual([])
  })

  it('limita el disparo manual a comunicaciones editoriales y operativas', () => {
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('password_reset')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('security_access')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('welcome')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('payment_confirmation')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('payment_receipt')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('affiliation_approved')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).not.toContain('registration_confirmed')
    expect(MANUALLY_SENDABLE_EMAIL_TYPES).toEqual([
      'event_announcement',
      'event_reminder',
      'admin_notification',
      'export_ready',
    ])
  })
})

describe('plantillas HTML de fallback', () => {
  it('cubre todos los tipos del catálogo', () => {
    const sinFallback = EMAIL_TYPES.filter((type) => !hasHtmlFallback(type))
    expect(sinFallback).toEqual([])
  })

  it('escapa los datos del destinatario en el cuerpo', () => {
    const { htmlContent } = renderEmail('welcome', {
      name: '<script>alert(1)</script>',
      accountUrl: 'https://plu.example/mi-cuenta',
    })
    expect(htmlContent).not.toContain('<script>')
    expect(htmlContent).toContain('&lt;script&gt;')
  })

  it('descarta enlaces con protocolos peligrosos', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('data:text/html,<h1>x</h1>')).toBe('')
    expect(safeUrl('https://plu.example/reset?token=abc')).toContain('https://plu.example/reset')
  })

  it('genera versión texto además del HTML', () => {
    const rendered = renderEmail('password_reset', {
      name: 'Ana',
      resetUrl: 'https://plu.example/reset?token=abc',
    })
    expect(rendered.textContent).toContain('Restablecé tu contraseña')
    expect(rendered.textContent).not.toContain('<')
  })

  it('incluye el logo oficial cuando hay appUrl', () => {
    const { htmlContent } = renderEmail(
      'password_reset',
      { name: 'Ana', resetUrl: 'https://plu.example/reset?token=abc' },
      { appUrl: 'https://plu.example' },
    )
    expect(htmlContent).toContain(`src="https://plu.example${EMAIL_LOGO_PATH}"`)
    expect(htmlContent).toContain('alt="PLU Argentina"')
    expect(htmlContent).toContain('background-color:#1a1c22')
    expect(htmlContent).toMatch(/color:#1a1c22[^>]*>Restablecé tu contraseña</)
    expect(htmlContent).toMatch(/letter-spacing:0\.18em[^>]*>PLU Argentina</)
  })

  it('embebe el logo cuando no hay appUrl pública (evita ícono roto en el cliente)', () => {
    const { htmlContent } = renderEmail('welcome', {
      name: 'Ana',
      accountUrl: 'https://plu.example/mi-cuenta',
    })
    expect(htmlContent).toContain('src="data:image/png;base64,')
    expect(htmlContent).toContain('alt="PLU Argentina"')
    expect(htmlContent).toMatch(/letter-spacing:0\.18em[^>]*>PLU Argentina</)
    expect(htmlContent).toMatch(/color:#1a1c22[^>]*>Te damos la bienvenida</)
    expect(htmlContent).toContain("font-family:'Poppins'")
  })

  it('usa filas editoriales sin caja rellena en paneles de datos', () => {
    const { htmlContent } = renderEmail('payment_approved', {
      name: 'Ana',
      concept: 'Afiliación',
      amount: 1000,
      reference: 'REF-1',
    })
    expect(htmlContent).toContain('border-bottom:1px solid #e4e3df')
    expect(htmlContent).not.toContain('background-color:#f7f6f3;border:1px solid')
  })

  it('arma la URL del logo desde appUrl y rutas relativas', () => {
    expect(buildEmailLogoUrl('https://plu.example/', null)).toBe(`https://plu.example${EMAIL_LOGO_PATH}`)
    expect(buildEmailLogoUrl('', '../../public/brand/plu-argentina-email.png')).toBe(
      '../../public/brand/plu-argentina-email.png',
    )
  })

  it('embebe el logo cuando APP_URL es localhost (clientes de mail no fetchean local)', () => {
    const logo = buildEmailLogoUrl('http://localhost:5173', null)
    expect(logo.startsWith('data:image/png;base64,')).toBe(true)
    expect(logo.length).toBeGreaterThan(1000)

    const { htmlContent } = renderEmail(
      'email_verification',
      {
        name: 'Agus',
        verificationUrl: 'http://localhost:5173/?verificar=abc',
        verificationCode: '123456',
      },
      { appUrl: 'http://localhost:5173' },
    )
    expect(htmlContent).toContain('src="data:image/png;base64,')
    expect(htmlContent).not.toContain('src="http://localhost:5173/brand/')
  })

  it('sin APP_URL también embebe el logo si el archivo existe', () => {
    expect(buildEmailLogoUrl('', null).startsWith('data:image/png;base64,')).toBe(true)
  })

  it('unifica bienvenida + confirmación + OTP en el mail de verificación', () => {
    const { subject, htmlContent } = renderEmail(
      'email_verification',
      {
        name: 'Agus',
        verificationUrl: 'https://plu.example/?verificar=token',
        verificationCode: '482913',
      },
      { subject: 'Bienvenido a PLU ARG: confirma tu correo' },
    )
    expect(subject).toBe('Bienvenido a PLU ARG: confirma tu correo')
    expect(htmlContent).toContain('Te damos la bienvenida a PLU Argentina')
    expect(htmlContent).toContain('Confirmar correo')
    expect(htmlContent).toContain('482913')
    expect(htmlContent).toContain('Si el botón no abre, ingresá este código en Mi cuenta.')
  })

  it('menciona el QR de perfil en afiliación e inscripción', () => {
    const affiliation = renderEmail('affiliation_approved', {
      name: 'Ana',
      memberCode: 'PLU-1',
      expirationDate: '2027-01-01',
      accountUrl: 'https://plu.example/mi-cuenta',
    })
    const registration = renderEmail('registration_confirmed', {
      name: 'Ana',
      eventTitle: 'Pitbull',
      eventDate: '2026-11-15',
      venue: 'CABA',
      division: 'Open',
      category: '83',
      eventUrl: 'https://plu.example/eventos/1',
    })
    expect(affiliation.htmlContent).toContain('código QR asociado a tu afiliación')
    expect(registration.htmlContent).toContain('código QR asociado a tu cuenta')
  })

  it('agrupa comprobante, afiliación e inscripción en la confirmación del pago', () => {
    const confirmation = renderEmail('payment_confirmation', {
      name: 'Ana',
      amount: 78000,
      concept: 'Afiliación + inscripción',
      reference: 'PLU-2026-14',
      paidAt: '2026-08-11T15:00:00.000Z',
      paymentMethod: 'Mercado Pago',
      includesMembership: true,
      memberCode: 'PLU-ARG-2026-014',
      expirationDate: '2027-08-11',
      accountUrl: 'https://plu.example/mi-cuenta',
      includesRegistration: true,
      eventTitle: 'Pitbull Classic',
      eventDate: '2026-11-15',
      venue: 'CABA',
      division: 'Open',
      category: '-83',
      eventUrl: 'https://plu.example/eventos/pitbull-classic',
    })

    expect(confirmation.subject).toBe('Pago confirmado')
    expect(confirmation.htmlContent).toContain('Comprobante')
    expect(confirmation.htmlContent).toContain('PLU-ARG-2026-014')
    expect(confirmation.htmlContent).toContain('Tu inscripción quedó confirmada')
    expect(confirmation.htmlContent).toContain('Pitbull Classic')
  })
})

describe('adaptador de Brevo', () => {
  const env = { BREVO_API_KEY: 'k', BREVO_SENDER_EMAIL: 'no-reply@plu.example' }

  it('reintenta ante un 429 y termina enviando', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429, { message: 'rate limited' }))
      .mockResolvedValueOnce(okResponse())
    const adapter = createBrevoAdapter({ env, fetchImpl, sleepImpl: async () => {} })

    const result = await adapter.send({ to: 'a@example.com', subject: 'S', htmlContent: '<p>x</p>' })

    expect(result.messageId).toBe('msg-1')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('no reintenta un 400 y lo marca como permanente', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorResponse(400, { code: 'invalid_parameter', message: 'mal' }))
    const adapter = createBrevoAdapter({ env, fetchImpl, sleepImpl: async () => {} })

    await expect(
      adapter.send({ to: 'a@example.com', subject: 'S', htmlContent: '<p>x</p>' }),
    ).rejects.toMatchObject({ retryable: false, providerCode: 'invalid_parameter' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('marca los fallos de red como reintentables', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const adapter = createBrevoAdapter({ env, fetchImpl, sleepImpl: async () => {} })

    await expect(adapter.send({ to: 'a@example.com', subject: 'S', htmlContent: '<p>x</p>' })).rejects.toMatchObject({
      retryable: true,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('mantiene la API key fuera del payload y solo en el header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const adapter = createBrevoAdapter({ env, fetchImpl })

    await adapter.send({ to: 'a@example.com', templateId: 3, params: {} })

    const [, options] = fetchImpl.mock.calls[0]
    expect(options.headers['api-key']).toBe('k')
    expect(options.body).not.toContain('k"')
    expect(JSON.parse(options.body).sender.email).toBe('no-reply@plu.example')
  })
})

describe('dispatcher de emails', () => {
  const brevoOk = { configured: true, send: vi.fn().mockResolvedValue({ messageId: 'm-1' }) }

  it('usa el template de Brevo cuando está cargado', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    const dispatcher = createEmailDispatcher({
      repository: memoryRepository(),
      brevo: { configured: true, send },
      env: { BREVO_TEMPLATE_WELCOME: '11' },
    })

    await dispatcher.send('welcome', { to: 'a@example.com', params: { name: 'Ana' } })

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ templateId: 11 }))
    expect(send.mock.calls[0][0].htmlContent).toBeUndefined()
  })

  it('cae al HTML del repo cuando falta el template', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    const dispatcher = createEmailDispatcher({
      repository: memoryRepository(),
      brevo: { configured: true, send },
      env: {},
    })

    await dispatcher.send('welcome', { to: 'a@example.com', params: { name: 'Ana' } })

    const payload = send.mock.calls[0][0]
    expect(payload.templateId).toBeUndefined()
    expect(payload.htmlContent).toContain('PLU Argentina')
    expect(payload.subject).toBe('Te damos la bienvenida a PLU Argentina')
  })

  it('usa la credencial en memoria pero la redacta del outbox persistido', async () => {
    const repository = memoryRepository()
    const send = vi.fn().mockResolvedValue({ messageId: 'm-secret' })
    const dispatcher = createEmailDispatcher({
      repository,
      brevo: { configured: true, send },
      env: { APP_URL: 'https://plu.example' },
    })
    const invitationUrl = 'https://plu.example/?invitacion-staff=token-super-secreto'

    await dispatcher.send('staff_invitation', {
      to: 'admin@example.com',
      entityId: 'usr-1',
      params: { email: 'admin@example.com', invitationUrl },
    })

    expect(send.mock.calls[0][0].params.invitationUrl).toBe(invitationUrl)
    expect([...repository.rows.values()][0].payload.invitationUrl).toBe('[REDACTED]')
    expect(JSON.stringify([...repository.rows.values()][0])).not.toContain('token-super-secreto')
  })

  it('usa el subject del catálogo en el fallback HTML', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    const dispatcher = createEmailDispatcher({
      repository: memoryRepository(),
      brevo: { configured: true, send },
      env: { APP_URL: 'https://plu.example' },
    })

    await dispatcher.send('password_reset', {
      to: 'a@example.com',
      params: { resetUrl: 'https://plu.example/reset?token=x' },
    })

    const payload = send.mock.calls[0][0]
    expect(payload.subject).toBe('Restablecé tu contraseña · PLU ARG')
    expect(payload.htmlContent).toContain(`src="https://plu.example/brand/plu-argentina-email.png"`)
    expect(payload.htmlContent).toContain('Restablecé tu contraseña')
  })

  it('no manda dos veces el mismo email ante un reintento de webhook', async () => {
    const repository = memoryRepository()
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    const dispatcher = createEmailDispatcher({ repository, brevo: { configured: true, send }, env: {} })
    const input = { to: 'a@example.com', entityId: 'pay-1', params: { name: 'Ana', amount: 1000 } }

    const first = await dispatcher.send('payment_approved', input)
    const second = await dispatcher.send('payment_approved', input)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rechaza el envío si faltan params obligatorios', async () => {
    const repository = memoryRepository()
    const dispatcher = createEmailDispatcher({ repository, brevo: brevoOk, env: {} })

    await expect(dispatcher.send('payment_receipt', { to: 'a@example.com', params: { name: 'Ana' } })).rejects.toThrow(
      /Faltan datos/,
    )
    expect([...repository.rows.values()][0]).toMatchObject({
      status: 'failed',
      error_code: 'MISSING_PARAMS',
    })
  })

  it('rechaza un destinatario con formato inválido', async () => {
    const repository = memoryRepository()
    const dispatcher = createEmailDispatcher({ repository, brevo: brevoOk, env: {} })

    await expect(dispatcher.send('welcome', { to: 'no-es-un-mail', params: { name: 'Ana' } })).rejects.toThrow(
      /no es válido/,
    )
    expect([...repository.rows.values()][0]).toMatchObject({
      status: 'failed',
      error_code: 'INVALID_RECIPIENT',
    })
  })

  it('frena un destinatario con rebote duro incluso en emails críticos', async () => {
    const repository = memoryRepository()
    repository.suppressions.set('a@example.com', { reason: 'hard_bounce' })
    const send = vi.fn()
    const dispatcher = createEmailDispatcher({ repository, brevo: { configured: true, send }, env: {} })

    const result = await dispatcher.send('password_reset', {
      to: 'a@example.com',
      params: { resetUrl: 'https://plu.example/reset?token=x' },
    })

    expect(result.status).toBe('suppressed')
    expect(result.created).toBe(true)
    expect(result.emailLog).toMatchObject({ status: 'suppressed' })
    expect(send).not.toHaveBeenCalled()
  })

  it('la desuscripción corta los avisos de evento pero no el comprobante de pago', async () => {
    const repository = memoryRepository()
    repository.suppressions.set('a@example.com', { reason: 'unsubscribed' })
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    const dispatcher = createEmailDispatcher({ repository, brevo: { configured: true, send }, env: {} })

    const anuncio = await dispatcher.send('event_announcement', {
      to: 'a@example.com',
      entityId: 'ev-1',
      params: { eventTitle: 'Pitbull Classic' },
    })
    const comprobante = await dispatcher.send('payment_receipt', {
      to: 'a@example.com',
      entityId: 'pay-9',
      params: { name: 'Ana', amount: 1000, reference: 'R-1' },
    })

    expect(anuncio.status).toBe('suppressed')
    expect(comprobante.status).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('programa reintento ante un fallo transitorio y no ante uno permanente', async () => {
    const repository = memoryRepository()
    const transitorio = new BrevoError('502', { retryable: true })
    const permanente = new BrevoError('400', { retryable: false })

    const d1 = createEmailDispatcher({
      repository,
      brevo: { configured: true, send: vi.fn().mockRejectedValue(transitorio) },
      env: {},
    })
    await expect(d1.send('welcome', { to: 'a@example.com', entityId: '1', params: { name: 'Ana' } })).rejects.toThrow()

    const d2 = createEmailDispatcher({
      repository,
      brevo: { configured: true, send: vi.fn().mockRejectedValue(permanente) },
      env: {},
    })
    await expect(d2.send('welcome', { to: 'b@example.com', entityId: '2', params: { name: 'Bea' } })).rejects.toThrow()

    const [primero, segundo] = [...repository.rows.values()]
    expect(primero.status).toBe('retrying')
    expect(primero.next_retry_at).toBeTruthy()
    expect(segundo.status).toBe('failed')
    expect(segundo.next_retry_at).toBeNull()
  })

  it('no reintenta automáticamente emails con bearer redactado', async () => {
    const repository = memoryRepository()
    const transitorio = new BrevoError('502', { retryable: true })
    const dispatcher = createEmailDispatcher({
      repository,
      brevo: { configured: true, send: vi.fn().mockRejectedValue(transitorio) },
      env: {},
    })

    await expect(
      dispatcher.send('password_reset', {
        to: 'a@example.com',
        entityId: 'ath-1',
        params: { resetUrl: 'https://plu.example/?reset=secreto' },
      }),
    ).rejects.toThrow()

    const emailLog = [...repository.rows.values()][0]
    expect(emailLog.status).toBe('failed')
    expect(emailLog.next_retry_at).toBeNull()
    expect(emailLog.payload.resetUrl).toBe('[REDACTED]')
  })

  it('marca como omitido cuando Brevo no está configurado, sin romper el flujo', async () => {
    const repository = memoryRepository()
    const dispatcher = createEmailDispatcher({
      repository,
      brevo: { configured: false },
      env: {},
      logger: { info: () => {} },
    })

    const result = await dispatcher.send('welcome', { to: 'a@example.com', params: { name: 'Ana' } })

    expect(result.status).toBe('skipped')
  })

  it('agota los reintentos y deja de reprogramar', () => {
    expect(nextRetryAt(1)).toBeTruthy()
    expect(nextRetryAt(5)).toBeTruthy()
    expect(nextRetryAt(6)).toBeNull()
  })

  it('usa el caché de supresiones sin consultar la base por destinatario', async () => {
    const repository = memoryRepository()
    const findSuppression = vi.fn()
    repository.findSuppression = findSuppression
    const send = vi.fn().mockResolvedValue({ messageId: 'm-1' })
    const dispatcher = createEmailDispatcher({ repository, brevo: { configured: true, send }, env: {} })

    const result = await dispatcher.send('event_announcement', {
      to: 'a@example.com',
      entityId: 'ev-1',
      suppressionCache: new Map([['a@example.com', { reason: 'unsubscribed' }]]),
      params: { eventTitle: 'Pitbull Classic' },
    })

    expect(result.status).toBe('suppressed')
    expect(findSuppression).not.toHaveBeenCalled()
  })
})

describe('token de verificación de email', () => {
  const secret = 'un-secreto-de-pruebas-suficientemente-largo'

  it('ida y vuelta con el mismo secreto', () => {
    const token = createEmailVerificationToken({ athleteId: 'atleta-1', secret })
    expect(verifyEmailVerificationToken(token, { secret })).toMatchObject({ aid: 'atleta-1' })
  })

  it('rechaza firma adulterada, secreto distinto y token vencido', () => {
    const token = createEmailVerificationToken({ athleteId: 'atleta-1', secret })
    expect(verifyEmailVerificationToken(`${token}x`, { secret })).toBeNull()
    expect(verifyEmailVerificationToken(token, { secret: 'otro-secreto-distinto-largo' })).toBeNull()

    const vencido = createEmailVerificationToken({
      athleteId: 'atleta-1',
      expiresAt: new Date(Date.now() - 1000),
      secret,
    })
    expect(verifyEmailVerificationToken(vencido, { secret })).toBeNull()
  })

  it('no acepta un token de reset de contraseña', () => {
    // Comparten AUTH_SECRET, así que el discriminante `typ` es lo único que
    // impide usar un enlace de reset para verificar una cuenta ajena.
    const reset = createPasswordResetToken({ athleteId: 'atleta-1', secret })
    expect(verifyEmailVerificationToken(reset, { secret })).toBeNull()
  })

  it('construye el deep link y lo vuelve a leer', () => {
    const token = createEmailVerificationToken({ athleteId: 'atleta-1', secret })
    const url = buildEmailVerificationUrl('https://plu.example/', token)
    expect(url).toContain('/?verificar=')
    expect(readEmailVerificationToken(new URL(url).search)).toBe(token)
  })
})

describe('OTP de verificación de email', () => {
  it('genera 6 dígitos, hashea estable y normaliza entrada', async () => {
    const {
      createEmailVerificationOtp,
      hashEmailVerificationOtp,
      normalizeEmailVerificationOtp,
      EMAIL_OTP_LENGTH,
    } = await import('../server/services/emailVerificationOtp.js')

    const code = createEmailVerificationOtp()
    expect(code).toMatch(new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`))
    expect(normalizeEmailVerificationOtp(' 12-34 56 ')).toBe('123456')
    expect(normalizeEmailVerificationOtp('12345')).toBe('')
    expect(hashEmailVerificationOtp('482913')).toBe(hashEmailVerificationOtp('482913'))
    expect(hashEmailVerificationOtp('482913')).not.toBe(hashEmailVerificationOtp('482914'))
  })
})

describe('emails de pago (vía Mercado Pago)', () => {
  const aprobado = { status: 'aprobado', externalPaymentId: 'mp-1', amount: 78000, raw: {} }

  async function llamadas(order, payment = aprobado, result) {
    const send = vi.fn().mockResolvedValue({ status: 'sent' })
    const notify = createPaymentNotificationService({ dispatcher: { configured: true, send }, env: {} })
    await notify({ order, payment, result })
    return send.mock.calls
  }

  async function tiposEnviados(order, payment = aprobado, result) {
    return (await llamadas(order, payment, result)).map(([type]) => type)
  }

  it('arma el mismo contenido consolidado para una aprobación manual', () => {
    const params = buildPaymentConfirmationParams({
      order: {
        kind: 'athlete',
        id: 'o-manual',
        concept: 'combo',
        reference: 'MAN-1',
        amount: 78000,
        method: 'manual_link',
      },
      result: {
        membership: { id: 'mem-manual', member_code: 'PLU-99', expiration_date: '2027-08-11' },
        registration: { id: 'reg-manual', division: 'Open', category: '-83' },
      },
      registrationEvent: { title: 'Pitbull', slug: 'pitbull', starts_at: '2026-11-15' },
      recipientName: 'Ana',
      appUrl: 'https://plu.example',
    })

    expect(params).toMatchObject({
      paymentMethod: 'Transferencia / aprobación manual',
      membershipId: 'mem-manual',
      registrationId: 'reg-manual',
      eventTitle: 'Pitbull',
      includesMembership: true,
      includesRegistration: true,
    })
  })

  it('manda una sola confirmación en todo pago aprobado', async () => {
    const tipos = await tiposEnviados({
      kind: 'athlete', id: 'o1', concept: 'membership', reference: 'R1',
      payerEmail: 'ana@example.com', athlete: { full_name: 'Ana' },
    })
    expect(tipos).toEqual(['payment_confirmation'])
  })

  it('incluye la afiliación aprobada y el código de socio en la confirmación', async () => {
    // Regresión: la RPC deja la afiliación activa en la misma transacción,
    // pero por Mercado Pago salía `affiliation_started` ("en curso"). Quien
    // pagaba con tarjeta —el camino principal— nunca recibía su código.
    const calls = await llamadas(
      {
        kind: 'athlete', id: 'o1', concept: 'membership', reference: 'R1',
        payerEmail: 'ana@example.com', athlete: { full_name: 'Ana' },
      },
      aprobado,
      { membership: { id: 'mem-1', member_code: 'PLU-ARG-2026-014', expiration_date: '2027-08-02' } },
    )
    const confirmacion = calls.find(([type]) => type === 'payment_confirmation')

    expect(calls).toHaveLength(1)
    expect(confirmacion).toBeDefined()
    expect(confirmacion[1].params.memberCode).toBe('PLU-ARG-2026-014')
    expect(confirmacion[1].params.membershipId).toBe('mem-1')
    expect(confirmacion[1].params.expirationDate).toBe('2027-08-02')
    expect(confirmacion[1].entityId).toBe('o1')
    expect(confirmacion[1].idempotencyKey).toBe('email:payment-confirmation:mp-1')
  })

  it('indica afiliación en proceso si el pago aprobado todavía no dejó afiliación', async () => {
    const calls = await llamadas({
      kind: 'athlete', id: 'o1', concept: 'membership', reference: 'R1',
      payerEmail: 'ana@example.com', athlete: { full_name: 'Ana' },
    })
    expect(calls.map(([type]) => type)).toEqual(['payment_confirmation'])
    expect(calls[0][1].params.membershipPending).toBe(true)
  })

  it('incluye la inscripción en la misma confirmación', async () => {
    // Regresión: por Mercado Pago llegaba el comprobante pero nunca la
    // confirmación de inscripción, que sí salía por la aprobación manual.
    const calls = await llamadas({
      kind: 'athlete', id: 'o2', concept: 'registration', reference: 'R2',
      payerEmail: 'ana@example.com', athlete: { full_name: 'Ana' },
      registration: { id: 'reg-1', division: 'Open', category: '-83', event: { title: 'Pitbull', slug: 'pitbull', starts_at: '2026-09-12' } },
    })
    expect(calls.map(([type]) => type)).toEqual(['payment_confirmation'])
    expect(calls[0][1].params).toMatchObject({
      registrationId: 'reg-1',
      eventTitle: 'Pitbull',
      division: 'Open',
      category: '-83',
    })
  })

  it('incluye la entrada al comprar tickets', async () => {
    const calls = await llamadas({
      kind: 'ticket', id: 'o3', concept: 'tickets', reference: 'T1',
      payerEmail: 'ana@example.com', event: { title: 'Pitbull', slug: 'pitbull' },
    })
    expect(calls.map(([type]) => type)).toEqual(['payment_confirmation'])
    expect(calls[0][1].params).toMatchObject({ includesTicket: true, eventTitle: 'Pitbull' })
  })

  it('avisa el rechazo y el pendiente sin mandar comprobante', async () => {
    const rechazado = await tiposEnviados(
      { kind: 'athlete', id: 'o4', concept: 'membership', payerEmail: 'a@example.com', athlete: { full_name: 'Ana' } },
      { status: 'rechazado', externalPaymentId: 'mp-2', amount: 1000, statusDetail: 'sin fondos' },
    )
    expect(rechazado).toEqual(['payment_rejected'])

    const pendiente = await tiposEnviados(
      { kind: 'athlete', id: 'o5', concept: 'membership', payerEmail: 'a@example.com', athlete: { full_name: 'Ana' } },
      { status: 'pendiente', externalPaymentId: 'mp-3', amount: 1000 },
    )
    expect(pendiente).toEqual(['payment_pending'])
  })

  it('agrupa el reintegro y la baja de la afiliación', async () => {
    const calls = await llamadas(
      {
        kind: 'athlete', id: 'o6', concept: 'membership', reference: 'R6',
        payerEmail: 'ana@example.com', athlete: { full_name: 'Ana' }, displayConcept: 'Afiliación anual',
      },
      { status: 'reembolsado', externalPaymentId: 'mp-6', amount: 38000 },
      { membership: { id: 'mem-6', member_code: 'PLU-ARG-2026-006', status: 'reembolsada' } },
    )

    expect(calls.map(([type]) => type)).toEqual(['payment_refunded'])
    expect(calls[0][1].params).toMatchObject({
      membershipId: 'mem-6',
      memberCode: 'PLU-ARG-2026-006',
      membershipStatus: 'reembolsada',
    })
  })

  it('no manda nada si la orden no tiene email del pagador', async () => {
    expect(await tiposEnviados({ kind: 'athlete', id: 'o6', concept: 'membership' })).toEqual([])
  })
})

describe('paralelismo acotado', () => {
  it('nunca supera el límite de tareas simultáneas', async () => {
    let running = 0
    let peak = 0
    const items = Array.from({ length: 40 }, (_, i) => i)

    await mapWithConcurrency(items, 5, async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 1))
      running -= 1
    })

    expect(peak).toBeLessThanOrEqual(5)
  })

  it('aísla los fallos y conserva el orden de entrada', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('falló ' + n)
      return n * 10
    })

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(results[0].value).toBe(10)
    expect(results[2].value).toBe(30)
  })
})

describe('aviso de evento a una audiencia', () => {
  const event = { id: 'ev-1', slug: 'pitbull-2026', title: 'Pitbull Classic', starts_at: '2026-09-12', venue: 'CABA' }

  function audienceRepo(recipients) {
    return { findEvent: async () => event, listRecipients: async () => recipients }
  }

  it('no manda a bloqueados ni a direcciones vacías', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'sent' })
    const notify = createEventNotificationService({
      audienceRepository: audienceRepo([
        { id: '1', full_name: 'Ana', email: 'ana@example.com', status: 'activo' },
        { id: '2', full_name: 'Bea', email: 'bea@example.com', status: 'bloqueado' },
        { id: '3', full_name: 'Ce', email: null, status: 'activo' },
      ]),
      dispatcher: { configured: true, send },
      env: { APP_URL: 'https://plu.example' },
    })

    const result = await notify({ eventId: 'ev-1' })

    expect(send).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ total: 3, sent: 1, skipped: 2, failed: 0 })
  })

  it('precarga las supresiones en una sola consulta para toda la audiencia', async () => {
    const findSuppressions = vi.fn().mockResolvedValue(new Map())
    const recipients = Array.from({ length: 25 }, (_, i) => ({
      id: String(i), full_name: `A${i}`, email: `a${i}@example.com`, status: 'activo',
    }))
    const notify = createEventNotificationService({
      audienceRepository: audienceRepo(recipients),
      notificationRepository: { findSuppressions },
      dispatcher: { configured: true, send: vi.fn().mockResolvedValue({ status: 'sent' }) },
      env: {},
    })

    await notify({ eventId: 'ev-1' })

    expect(findSuppressions).toHaveBeenCalledTimes(1)
    expect(findSuppressions.mock.calls[0][0]).toHaveLength(25)
  })

  it('un destinatario que falla no corta el lote', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: 'sent' })
      .mockRejectedValueOnce(new Error('Brevo 500'))
      .mockResolvedValueOnce({ status: 'sent' })
    const notify = createEventNotificationService({
      audienceRepository: audienceRepo(
        ['a', 'b', 'c'].map((n, i) => ({ id: String(i), full_name: n, email: `${n}@example.com`, status: 'activo' })),
      ),
      dispatcher: { configured: true, send },
      env: {},
    })

    const result = await notify({ eventId: 'ev-1' })

    expect(result).toMatchObject({ total: 3, sent: 2, failed: 1 })
  })

  it('rechaza una audiencia o un tipo desconocido', async () => {
    const notify = createEventNotificationService({
      audienceRepository: audienceRepo([]),
      dispatcher: { configured: true, send: vi.fn() },
      env: {},
    })

    await expect(notify({ eventId: 'ev-1', audience: 'todos' })).rejects.toThrow(/Audiencia desconocida/)
    await expect(notify({ eventId: 'ev-1', type: 'welcome' })).rejects.toThrow(/inválido/)
  })
})
