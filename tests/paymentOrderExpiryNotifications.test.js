import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { processPaymentOrderExpiryNotifications } from '../server/modules/payments/paymentOrderExpiryNotificationWorkflow.js'
import { renderEmail } from '../server/modules/notifications/emailTemplates.js'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261105100000_manual_payment_order_expiry_reminders.sql',
  ),
  'utf8',
)

describe('plazo de 5 días para pago manual — migración', () => {
  it('centraliza el plazo en un helper en vez de repetir el literal viejo', () => {
    expect(migration).toContain(
      "language sql\nstable\nsecurity definer\nset search_path = public, plu_private\nas $$\n  select interval '5 days';",
    )
    expect(migration).not.toContain("p_payment_method = 'manual_link' then interval '1 day'")
  })

  it('reemplaza el literal en las 5 funciones que escriben expires_at para una orden manual', () => {
    const touchedFunctions = [
      'create_membership_order_v2',
      'create_competition_registration_v2',
      'create_membership_registration_combo_order_core',
      'resume_pending_event_registration_checkout',
      'settle_manual_checkout_pricing',
    ]
    for (const name of touchedFunctions) {
      expect(migration).toContain(name)
    }
    // Las 4 primeras llaman al helper directo; la 5ta (settle_manual_checkout_pricing)
    // lo usa dos veces en el mismo `least(coalesce(...), ...)`.
    const helperCalls = migration.match(/plu_private\.manual_link_checkout_window\(\)/g) ?? []
    expect(helperCalls.length).toBeGreaterThanOrEqual(6)
  })

  it('no toca la rama cash_pitbull, que sigue anclada al evento', () => {
    expect(migration).toContain(
      "when p_manual_payment_channel = 'cash_pitbull' then\n          greatest(coalesce(expires_at, now()), plu_private.cash_checkout_deadline(v_order.id))",
    )
  })

  it('define la cola de avisos con sus dos RPC y sin policy de lectura pública', () => {
    expect(migration).toContain('create table if not exists public.payment_order_expiry_notifications')
    expect(migration).toContain("check (notification_key in ('reminder', 'expired'))")
    expect(migration).toContain('function public.claim_payment_order_expiry_notifications(')
    expect(migration).toContain('function public.complete_payment_order_expiry_notification(')
    expect(migration).not.toContain('payment_order_expiry_notifications_staff_read')
  })

  it('excluye del recordatorio las órdenes con expires_at nulo (declaradas para financiar)', () => {
    expect(migration).toContain('and o.expires_at is not null\n    and now() >= o.expires_at')
  })
})

describe('emails de vencimiento de pago — fallback HTML', () => {
  it('el recordatorio nombra el concepto y la fecha de vencimiento', () => {
    const rendered = renderEmail('payment_order_reminder', {
      name: 'Juan',
      concept: 'Afiliación PLU',
      reference: 'MORD-abc123',
      expiresAt: '2026-09-10',
      accountUrl: 'https://plu.example/mi-cuenta?section=payments',
    })

    expect(rendered.subject).toBe('Tu pago vence pronto')
    expect(rendered.htmlContent).toContain('Afiliación PLU')
    expect(rendered.htmlContent).toContain('MORD-abc123')
  })

  it('el aviso de vencimiento explica que la orden ya se canceló', () => {
    const rendered = renderEmail('payment_order_expired', {
      name: 'Juan',
      concept: 'Inscripción a competencia',
      reference: 'RORD-xyz789',
      accountUrl: 'https://plu.example/mi-cuenta?section=payments',
    })

    expect(rendered.subject).toBe('Tu orden de pago venció')
    expect(rendered.htmlContent).toContain('la cancelamos')
    expect(rendered.htmlContent).toContain('RORD-xyz789')
  })
})

describe('processPaymentOrderExpiryNotifications', () => {
  it('envía el recordatorio o el aviso final según el hito reclamado', async () => {
    const completeOrderExpiryNotification = vi.fn()
    const repository = {
      claimOrderExpiryNotifications: vi.fn().mockResolvedValue([
        {
          id: 'notice-1',
          notificationKey: 'reminder',
          recipientEmail: 'atleta@example.com',
          athleteName: 'Atleta PLU',
          orderId: 'order-1',
          concept: 'membership',
          reference: 'MORD-1',
          expiresAt: '2026-09-10',
        },
        {
          id: 'notice-2',
          notificationKey: 'expired',
          recipientEmail: 'otro@example.com',
          athleteName: 'Otro Atleta',
          orderId: 'order-2',
          concept: 'registration',
          reference: 'RORD-2',
        },
      ]),
      completeOrderExpiryNotification,
    }
    const send = vi.fn().mockResolvedValue({ status: 'sent', created: true, emailLog: { id: 'log-1' } })

    const result = await processPaymentOrderExpiryNotifications({
      repository,
      dispatcher: { configured: true, send },
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 2, sent: 2, failed: 0, skipped: false })
    expect(send).toHaveBeenNthCalledWith(
      1,
      'payment_order_reminder',
      expect.objectContaining({
        to: 'atleta@example.com',
        idempotencyKey: 'email:payment-order-reminder:notice-1',
        params: expect.objectContaining({
          concept: 'Afiliación PLU',
          accountUrl: 'https://plu.example/mi-cuenta?section=payments',
        }),
      }),
    )
    expect(send).toHaveBeenNthCalledWith(
      2,
      'payment_order_expired',
      expect.objectContaining({
        to: 'otro@example.com',
        idempotencyKey: 'email:payment-order-expired:notice-2',
        params: expect.objectContaining({ concept: 'Inscripción a competencia' }),
      }),
    )
    expect(completeOrderExpiryNotification).toHaveBeenCalledWith('notice-1', { sent: true })
    expect(completeOrderExpiryNotification).toHaveBeenCalledWith('notice-2', { sent: true })
  })

  it('marca el aviso como fallido sin cortar el lote cuando el envío falla', async () => {
    const completeOrderExpiryNotification = vi.fn()
    const repository = {
      claimOrderExpiryNotifications: vi.fn().mockResolvedValue([
        { id: 'notice-1', notificationKey: 'reminder', recipientEmail: 'a@example.com', concept: 'membership' },
        { id: 'notice-2', notificationKey: 'expired', recipientEmail: 'b@example.com', concept: 'registration' },
      ]),
      completeOrderExpiryNotification,
    }
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('Brevo respondió 500.'))
      .mockResolvedValueOnce({ status: 'sent', created: true, emailLog: { id: 'log-2' } })

    const result = await processPaymentOrderExpiryNotifications({
      repository,
      dispatcher: { configured: true, send },
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 2, sent: 1, failed: 1, skipped: false })
    expect(completeOrderExpiryNotification).toHaveBeenCalledWith('notice-1', {
      sent: false,
      error: 'Brevo respondió 500.',
    })
    expect(completeOrderExpiryNotification).toHaveBeenCalledWith('notice-2', { sent: true })
  })

  it('no envía nada si el dispatcher no está configurado', async () => {
    const repository = {
      claimOrderExpiryNotifications: vi.fn(),
      completeOrderExpiryNotification: vi.fn(),
    }

    const result = await processPaymentOrderExpiryNotifications({
      repository,
      dispatcher: { configured: false, send: vi.fn() },
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: true })
    expect(repository.claimOrderExpiryNotifications).not.toHaveBeenCalled()
  })
})
