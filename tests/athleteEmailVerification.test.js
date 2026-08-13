import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111'
const ENV = {
  AUTH_SECRET: 'test-secret-email-verification-plu',
  APP_URL: 'https://www.powerliftingunited.ar',
}

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

const athleteHeaders = {
  ...mutationHeaders,
  Cookie: 'plu_athlete_session=test-session-token',
}

const unverifiedContact = {
  id: ATHLETE_ID,
  full_name: 'Agus Test',
  email: 'agus@plu.test',
  status: 'registrado',
  email_verified_at: null,
}

function supabaseForVerification() {
  return {
    from: vi.fn((table) => {
      if (table === 'athlete_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'session-1',
                  athlete_id: ATHLETE_ID,
                  expires_at: '2099-01-01T00:00:00Z',
                  revoked_at: null,
                },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: () => ({}) }),
          insert: async () => ({ data: { id: 'session-new' }, error: null }),
        }
      }
      if (table === 'transactional_email_logs') {
        const row = { id: 'log-1', status: 'processing' }
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { ...row, status: 'skipped' }, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'email_suppressions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Tabla inesperada: ${table}`)
    }),
  }
}

function registerPayload() {
  return {
    fullName: 'Agus Test',
    documentId: '30111222',
    email: 'agus@plu.test',
    birthDate: '1994-04-12',
    phone: '1144445555',
    country: 'Argentina',
    province: 'Buenos Aires',
    city: 'CABA',
    gym: 'Maximal',
    sex: 'Masculino',
    division: 'Open',
    category: 'Raw',
    password: 'clave-segura-12',
  }
}

describe('verificación de email del atleta', () => {
  it('el reenvío no responde ok cuando Brevo está sin configurar', async () => {
    const storeEmailOtp = vi.fn().mockResolvedValue(true)
    const target = listen(createApp({
      env: ENV,
      supabaseAdmin: supabaseForVerification(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue(unverifiedContact),
        storeEmailOtp,
      },
      brevo: { configured: false },
    }))

    try {
      const response = await fetch(`${target.url}/api/athletes/me/resend-verification`, {
        method: 'POST',
        headers: athleteHeaders,
        body: '{}',
      })
      const body = await response.json()

      expect(response.status).toBe(503)
      expect(body).toMatchObject({ code: 'EMAIL_NOT_SENT' })
      expect(body.ok).not.toBe(true)
      expect(storeEmailOtp).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })

  it('el reenvío confirma ok solo cuando Brevo acepta el envío', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'msg-1' })
    const target = listen(createApp({
      env: ENV,
      supabaseAdmin: supabaseForVerification(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue(unverifiedContact),
        storeEmailOtp: vi.fn().mockResolvedValue(true),
      },
      brevo: { configured: true, send },
    }))

    try {
      const response = await fetch(`${target.url}/api/athletes/me/resend-verification`, {
        method: 'POST',
        headers: athleteHeaders,
        body: '{}',
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true, alreadyVerified: false })
      expect(send).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })

  it('si el correo ya estaba confirmado no dispara un envío', async () => {
    const send = vi.fn()
    const target = listen(createApp({
      env: ENV,
      supabaseAdmin: supabaseForVerification(),
      athleteRepository: {
        findContact: vi.fn().mockResolvedValue({
          ...unverifiedContact,
          email_verified_at: '2026-08-01T00:00:00Z',
        }),
        storeEmailOtp: vi.fn(),
      },
      brevo: { configured: true, send },
    }))

    try {
      const response = await fetch(`${target.url}/api/athletes/me/resend-verification`, {
        method: 'POST',
        headers: athleteHeaders,
        body: '{}',
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true, alreadyVerified: true })
      expect(send).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })

  it('el alta responde 201 con emailVerification.sent false si Brevo no está configurado', async () => {
    const target = listen(createApp({
      env: ENV,
      supabaseAdmin: supabaseForVerification(),
      athleteRepository: {
        checkAvailability: vi.fn().mockResolvedValue({ emailTaken: false, documentTaken: false }),
        register: vi.fn().mockResolvedValue(unverifiedContact),
        storeEmailOtp: vi.fn().mockResolvedValue(true),
      },
      brevo: { configured: false },
    }))

    try {
      const response = await fetch(`${target.url}/api/athletes/register`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify(registerPayload()),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.athlete).toMatchObject({ id: ATHLETE_ID, email: 'agus@plu.test' })
      expect(body.emailVerification).toEqual({ sent: false })
    } finally {
      await target.close()
    }
  })

  it('el alta marca emailVerification.sent true cuando Brevo acepta el mail', async () => {
    const send = vi.fn().mockResolvedValue({ messageId: 'msg-alta' })
    const target = listen(createApp({
      env: ENV,
      supabaseAdmin: supabaseForVerification(),
      athleteRepository: {
        checkAvailability: vi.fn().mockResolvedValue({ emailTaken: false, documentTaken: false }),
        register: vi.fn().mockResolvedValue(unverifiedContact),
        storeEmailOtp: vi.fn().mockResolvedValue(true),
      },
      brevo: { configured: true, send },
    }))

    try {
      const response = await fetch(`${target.url}/api/athletes/register`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify(registerPayload()),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.emailVerification).toEqual({ sent: true })
      expect(send).toHaveBeenCalledOnce()
    } finally {
      await target.close()
    }
  })
})
