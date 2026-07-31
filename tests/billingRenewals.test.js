import { describe, expect, it, vi } from 'vitest'
import { createBrevoAdapter } from '../server/modules/notifications/brevoAdapter.js'
import { processMembershipRenewals } from '../server/modules/memberships/renewalWorkflow.js'

describe('membership renewal delivery', () => {
  it('envía la plantilla server-side y completa el aviso durable', async () => {
    const completeRenewal = vi.fn()
    const repository = {
      claimRenewals: vi.fn().mockResolvedValue([
        {
          id: 'notice-1',
          recipientEmail: 'socia@example.com',
          athleteName: 'Socia PLU',
          memberCode: 'PLU-100',
          expirationDate: '2026-12-31',
          notificationKey: 'expires_in_30',
        },
      ]),
      completeRenewal,
    }
    const send = vi.fn().mockResolvedValue({ status: 'sent', created: true, emailLog: { id: 'log-1' } })

    const result = await processMembershipRenewals({
      repository,
      dispatcher: { configured: true, send },
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: false })
    expect(send).toHaveBeenCalledWith(
      'membership_renewal',
      expect.objectContaining({
        to: 'socia@example.com',
        params: expect.objectContaining({
          renewalUrl: 'https://plu.example/mi-cuenta?section=membership',
          memberCode: 'PLU-100',
          expirationDate: '2026-12-31',
        }),
      }),
    )
    expect(completeRenewal).toHaveBeenCalledWith('notice-1', { sent: true })
  })

  it('marca el aviso como fallido sin cortar el lote cuando el envío falla', async () => {
    const completeRenewal = vi.fn()
    const repository = {
      claimRenewals: vi.fn().mockResolvedValue([
        { id: 'notice-1', recipientEmail: 'a@example.com', athleteName: 'A', expirationDate: '2026-12-31' },
        { id: 'notice-2', recipientEmail: 'b@example.com', athleteName: 'B', expirationDate: '2026-12-31' },
      ]),
      completeRenewal,
    }
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('Brevo respondió 500.'))
      .mockResolvedValueOnce({ status: 'sent', created: true, emailLog: { id: 'log-2' } })

    const result = await processMembershipRenewals({
      repository,
      dispatcher: { configured: true, send },
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 2, sent: 1, failed: 1, skipped: false })
    expect(completeRenewal).toHaveBeenCalledWith('notice-1', { sent: false, error: 'Brevo respondió 500.' })
    expect(completeRenewal).toHaveBeenCalledWith('notice-2', { sent: true })
  })

  it('no envía nada si el dispatcher no está configurado', async () => {
    const repository = { claimRenewals: vi.fn(), completeRenewal: vi.fn() }

    const result = await processMembershipRenewals({
      repository,
      dispatcher: { configured: false, send: vi.fn() },
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: true })
    expect(repository.claimRenewals).not.toHaveBeenCalled()
  })

  it('mantiene la API key y el remitente exclusivamente en el servidor', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: 'message-1' }),
    })
    const adapter = createBrevoAdapter({
      env: {
        BREVO_API_KEY: 'server-secret',
        BREVO_SENDER_EMAIL: 'pagos@plu.example',
        BREVO_SENDER_NAME: 'PLU ARG',
      },
      fetchImpl,
    })

    await adapter.sendTemplate({ to: 'socia@example.com', templateId: 7, params: { name: 'Socia' } })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({ headers: expect.objectContaining({ 'api-key': 'server-secret' }) }),
    )
  })
})
