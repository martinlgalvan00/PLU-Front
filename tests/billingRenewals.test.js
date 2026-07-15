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
    const brevo = {
      configured: true,
      sendTemplate: vi.fn().mockResolvedValue({ messageId: 'brevo-1' }),
    }

    const result = await processMembershipRenewals({
      repository,
      brevo,
      templateId: '42',
      appUrl: 'https://plu.example',
    })

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, skipped: false })
    expect(brevo.sendTemplate).toHaveBeenCalledWith(expect.objectContaining({
      to: 'socia@example.com',
      templateId: '42',
      params: expect.objectContaining({ renewalUrl: 'https://plu.example/mi-cuenta?section=membership' }),
    }))
    expect(completeRenewal).toHaveBeenCalledWith('notice-1', { sent: true })
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
