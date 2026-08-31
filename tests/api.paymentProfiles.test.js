import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Doble mínimo del cliente Supabase: registra los filtros que pidió el
 * repositorio y resuelve la cadena como lo hace postgrest-js.
 */
function createSupabaseDouble(rows) {
  const calls = []
  const query = {
    select: () => query,
    order: () => query,
    eq: (column, value) => {
      calls.push([column, value])
      return query
    },
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  }

  return {
    calls,
    client: {
      from: (table) => {
        calls.push(['from', table])
        return query
      },
    },
  }
}

describe('GET /api/payment-profiles — modo cuenta única (sin PAYMENT_PROFILE_SECRETS_KEY)', () => {
  it('kind=mercado_pago con la tabla vacía responde 200 con secretsKeyConfigured=false', async () => {
    const staff = await buildStaffUser({ email: 'perfiles-cobro-mp-vacio@plu.test' })
    const double = createSupabaseDouble([])
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        supabaseAdmin: double.client,
        // Sin PAYMENT_PROFILE_SECRETS_KEY a propósito: así corre hoy en single-account.
        env: { AUTH_SECRET: 'payment-profiles-single-account-secret', APP_URL: 'http://localhost:5173' },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/payment-profiles?kind=mercado_pago`, {
        headers: authHeaders(cookie),
      })

      // El panel usa este flag para ocultar "Crear perfil MP" y mostrar la nota
      // informativa en vez de un error -- sin este contrato el editor de eventos
      // no puede degradar a cuenta global de forma silenciosa.
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toEqual({ profiles: [], secretsKeyConfigured: false })
    } finally {
      await target.close()
    }
  })

  it('crear un perfil mercado_pago sin la clave configurada responde 503, no 500', async () => {
    const staff = await buildStaffUser({ email: 'perfiles-cobro-mp-crear@plu.test' })
    const double = createSupabaseDouble([])
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        supabaseAdmin: double.client,
        env: { AUTH_SECRET: 'payment-profiles-create-503-secret', APP_URL: 'http://localhost:5173' },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/payment-profiles`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          name: 'Cuenta secundaria MP',
          kind: 'mercado_pago',
          config: { publicKey: 'TEST-public-key-1234' },
          secrets: { accessToken: 'TEST-access-token-1234', webhookSecret: 'webhook-secret-123' },
        }),
      })

      // Cuando alguien active multi-cuenta configurando la variable, este mismo
      // POST tiene que pasar a crear el perfil sin tocar el resto de la ruta.
      expect(response.status).toBe(503)
    } finally {
      await target.close()
    }
  })
})

describe('GET /api/payment-profiles', () => {
  it('lista los perfiles del tipo pedido', async () => {
    const staff = await buildStaffUser({ email: 'perfiles-cobro@plu.test' })
    const double = createSupabaseDouble([
      {
        id: 'pp-1',
        organization_id: 'org-1',
        name: 'Transferencia · Pitbull Classic',
        kind: 'bank_transfer',
        config: { alias: 'pitbull.classic', cbu: '', holder: 'PLU ARG', notes: '' },
        active: true,
        secrets_ciphertext: null,
        created_at: '2026-08-01T10:00:00.000Z',
        updated_at: '2026-08-01T10:00:00.000Z',
      },
    ])
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        supabaseAdmin: double.client,
        env: { AUTH_SECRET: 'payment-profiles-test-secret', APP_URL: 'http://localhost:5173' },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/payment-profiles?kind=bank_transfer`, {
        headers: authHeaders(cookie),
      })

      // Regresión: la ruta pasaba el getter `getSupabaseAdmin` sin invocarlo, y
      // `requireSupabaseClient` lo dejaba pasar por ser truthy. El repositorio
      // reventaba con `client.from is not a function` y el panel de canales de
      // cobro recibía un 500 en cada request.
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.profiles).toHaveLength(1)
      expect(body.profiles[0]).toMatchObject({
        id: 'pp-1',
        kind: 'bank_transfer',
        config: { alias: 'pitbull.classic', holder: 'PLU ARG' },
        hasSecrets: false,
      })
      expect(double.calls).toContainEqual(['from', 'payment_profiles'])
      expect(double.calls).toContainEqual(['kind', 'bank_transfer'])
      expect(double.calls).toContainEqual(['active', true])
    } finally {
      await target.close()
    }
  })

  it('responde 503 cuando no hay cliente de Supabase configurado', async () => {
    const staff = await buildStaffUser({ email: 'perfiles-cobro-sin-supabase@plu.test' })
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        supabaseAdmin: null,
        env: { AUTH_SECRET: 'payment-profiles-503-secret', APP_URL: 'http://localhost:5173' },
      }),
    )

    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      const response = await fetch(`${target.url}/api/payment-profiles?kind=mercado_pago`, {
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(503)
    } finally {
      await target.close()
    }
  })
})
