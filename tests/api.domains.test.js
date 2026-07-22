import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { HttpError } from '../server/lib/errors.js'
import { hashPassword } from '../server/services/passwordService.js'
import { createSupabaseTicketRepository } from '../server/modules/ticketing/supabaseTicketRepository.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

describe('APIs de dominio unificadas', () => {
  it('crea la compra publica por el repositorio Supabase y devuelve el token de orden', async () => {
    const createOrder = vi.fn().mockResolvedValue({
      order: { id: 'ord-1', amount: 20000 }, tickets: [], orderAccessToken: 'opaque-token',
    })
    const target = listen(createApp({ ticketRepository: { createOrder } }))
    const response = await fetch(`${target.url}/api/tickets/orders`, {
      method: 'POST', headers: mutationHeaders,
      body: JSON.stringify({
        eventSlug: 'pitbull-2026', provider: 'mercado_pago', idempotencyKey: crypto.randomUUID(),
        attendees: [
          { fullName: 'Ana Perez', dni: '30111222', ticketTypeId: crypto.randomUUID(), addonIds: [] },
        ],
      }),
    })
    expect(response.status).toBe(201)
    expect((await response.json()).orderAccessToken).toBe('opaque-token')
    expect(createOrder).toHaveBeenCalledOnce()
    await target.close()
  })

  it('no acepta un comprobante sin capacidad opaca de la orden', async () => {
    const createProofUpload = vi.fn()
    const target = listen(createApp({ ticketRepository: { createProofUpload } }))
    const response = await fetch(`${target.url}/api/tickets/orders/ord-1/proof-upload`, {
      method: 'POST', headers: mutationHeaders,
      body: JSON.stringify({ fileName: 'pago.pdf', contentType: 'application/pdf', size: 1000 }),
    })
    expect(response.status).toBe(400)
    expect(createProofUpload).not.toHaveBeenCalled()
    await target.close()
  })

  it('readiness exige Prisma y Supabase disponibles', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) }
    const query = { limit: vi.fn().mockResolvedValue({ data: [], error: null }) }
    const supabaseAdmin = { from: vi.fn(() => ({ select: vi.fn(() => query) })) }
    const target = listen(createApp({ prisma, supabaseAdmin }))
    const response = await fetch(`${target.url}/ready`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ready', checks: { prisma: true, supabase: true } })
    await target.close()
  })

  it('no permite consultar ni procesar una orden de pago solo por conocer su UUID', async () => {
    const paymentRepository = {
      getOrder: vi.fn().mockResolvedValue({ id: '8cb43d94-b330-4e69-a2d0-76a56916ebf5', kind: 'ticket' }),
      assertTicketOrderAccess: vi.fn().mockRejectedValue(new HttpError(401, 'Falta el token de acceso de la orden.')),
    }
    const target = listen(createApp({ paymentRepository }))
    const response = await fetch(`${target.url}/api/payments/orders/8cb43d94-b330-4e69-a2d0-76a56916ebf5/status`)
    expect(response.status).toBe(401)
    expect(paymentRepository.assertTicketOrderAccess).toHaveBeenCalledOnce()
    await target.close()
  })

  it('permite que un atleta vuelva a entrar con contraseña hasheada y cookie HttpOnly', async () => {
    const passwordHash = await hashPassword('clave-atleta-segura-2026')
    const athleteRepository = {
      findLogin: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111', full_name: 'Ana Perez',
        email: 'ana@example.com', status: 'registrado', password_hash: passwordHash,
      }),
    }
    const supabaseAdmin = {
      from: vi.fn((table) => {
        if (table !== 'athlete_sessions') throw new Error(`Tabla inesperada: ${table}`)
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    }
    const target = listen(createApp({ athleteRepository, supabaseAdmin }))
    const response = await fetch(`${target.url}/api/athletes/login`, {
      method: 'POST', headers: mutationHeaders,
      body: JSON.stringify({ email: 'ana@example.com', password: 'clave-atleta-segura-2026' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('plu_athlete_session=')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect((await response.json()).user.role).toBe('athlete_plu')
    await target.close()
  })
})

describe('routing de dominio Supabase', () => {
  it('resuelve el evento de una inscripcion desde Supabase y no desde Prisma', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { event_id: '22222222-2222-4222-8222-222222222222' },
      error: null,
    })
    const eqId = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq: eqId }))
    const client = { from: vi.fn(() => ({ select })) }

    const repository = createSupabaseTicketRepository(client)
    await expect(repository.getRegistrationEventId(
      '11111111-1111-4111-8111-111111111111',
    )).resolves.toBe('22222222-2222-4222-8222-222222222222')
    expect(client.from).toHaveBeenCalledWith('event_registrations')
    expect(select).toHaveBeenCalledWith('event_id')
  })
})
