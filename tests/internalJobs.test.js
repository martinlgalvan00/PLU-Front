import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

describe('internal scheduled jobs', () => {
  it('no queda expuesto si falta CRON_SECRET', async () => {
    const target = listen(createApp({ env: {} }))
    const response = await fetch(`${target.url}/api/internal/jobs/payment-recovery`)

    expect(response.status).toBe(503)
    await target.close()
  })

  it('rechaza credenciales incorrectas', async () => {
    const target = listen(createApp({ env: { CRON_SECRET: 'secret-for-tests' } }))
    const response = await fetch(`${target.url}/api/internal/jobs/payment-recovery`, {
      headers: { Authorization: 'Bearer invalid' },
    })

    expect(response.status).toBe(401)
    await target.close()
  })

  it('ejecuta solamente el job solicitado con autorización válida', async () => {
    const paymentRecovery = vi.fn().mockResolvedValue({ recovered: 2 })
    const env = {
      CRON_SECRET: 'secret-for-tests',
    }
    const target = listen(
      createApp({
        env,
        supabaseAdmin: { kind: 'supabase-double' },
        jobRunners: { paymentRecovery },
      }),
    )

    const response = await fetch(`${target.url}/api/internal/jobs/payment-recovery`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      status: 'completed',
      job: 'payment-recovery',
      result: { recovered: 2 },
    })
    expect(paymentRecovery).toHaveBeenCalledOnce()
    await target.close()
  })

  it('ejecuta la revalidacion de pagos con autorizacion valida', async () => {
    const paymentRevalidation = vi.fn().mockResolvedValue({ summary: { corrected: 1 } })
    const env = {
      CRON_SECRET: 'secret-for-tests',
    }
    const target = listen(
      createApp({
        env,
        supabaseAdmin: { kind: 'supabase-double' },
        jobRunners: { paymentRevalidation },
      }),
    )

    const response = await fetch(`${target.url}/api/internal/jobs/payment-revalidation`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      status: 'completed',
      job: 'payment-revalidation',
      result: { summary: { corrected: 1 } },
    })
    expect(paymentRevalidation).toHaveBeenCalledOnce()
    await target.close()
  })

  it('ejecuta los avisos de vencimiento de pago con autorizacion valida', async () => {
    const paymentOrderExpiry = vi.fn().mockResolvedValue({ processed: 3, sent: 3, failed: 0 })
    const env = {
      CRON_SECRET: 'secret-for-tests',
    }
    const target = listen(
      createApp({
        env,
        supabaseAdmin: { kind: 'supabase-double' },
        jobRunners: { paymentOrderExpiry },
      }),
    )

    const response = await fetch(`${target.url}/api/internal/jobs/payment-order-expiry`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      status: 'completed',
      job: 'payment-order-expiry',
      result: { processed: 3, sent: 3, failed: 0 },
    })
    expect(paymentOrderExpiry).toHaveBeenCalledOnce()
    await target.close()
  })

  it('no corre los avisos de vencimiento de pago si el flag los deshabilita', async () => {
    const paymentOrderExpiry = vi.fn()
    const env = {
      CRON_SECRET: 'secret-for-tests',
      PAYMENT_ORDER_EXPIRY_JOB_ENABLED: 'false',
    }
    const target = listen(
      createApp({
        env,
        supabaseAdmin: { kind: 'supabase-double' },
        jobRunners: { paymentOrderExpiry },
      }),
    )

    const response = await fetch(`${target.url}/api/internal/jobs/payment-order-expiry`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'disabled', job: 'payment-order-expiry' })
    expect(paymentOrderExpiry).not.toHaveBeenCalled()
    await target.close()
  })
})
