import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../../server/app.js'
import { manualChannelsOpen } from './helpers/platformToggles.js'
import { createSupabaseTestClient, listen } from './helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

function sessionCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

function authHeaders(cookie) {
  return { ...mutationHeaders, ...(cookie ? { Cookie: cookie } : {}) }
}

function buildAthletePayload(suffix) {
  return {
    fullName: `Test Athlete ${suffix}`,
    documentId: String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000)),
    email: `test+athlete-${suffix}-${randomUUID()}@pluarg.test`,
    birthDate: '1995-01-01',
    phone: '1122334455',
    country: 'Argentina',
    province: 'Buenos Aires',
    city: 'CABA',
    gym: 'Test Gym',
    sex: 'Masculino',
    division: 'Open',
    category: 'Raw',
    estimatedWeight: 90,
    password: 'integration-test-password-athlete',
  }
}

async function registerAthlete(baseUrl, suffix, { verifyEmail = false, admin } = {}) {
  const response = await fetch(`${baseUrl}/api/athletes/register`, {
    method: 'POST',
    headers: mutationHeaders,
    body: JSON.stringify(buildAthletePayload(suffix)),
  })
  const body = await response.json()
  if (response.status !== 201) {
    throw new Error(
      `No se pudo registrar el atleta de prueba: ${response.status} ${JSON.stringify(body)}`,
    )
  }

  // membership-orders exige email_verified_at (assertEmailVerified → 403).
  if (verifyEmail) {
    if (!admin) throw new Error('registerAthlete(verifyEmail) requiere el client admin.')
    const { error } = await admin
      .from('athletes')
      .update({ email_verified_at: new Date().toISOString() })
      .eq('id', body.athlete.id)
    if (error) throw new Error(`No se pudo verificar el email de prueba: ${error.message}`)
  }

  return { athlete: body.athlete, cookie: sessionCookie(response) }
}

describe('flujo de atleta: idempotencia de orden y aislamiento entre atletas', () => {
  const supabaseAdmin = createSupabaseTestClient()
  const createdAthleteIds = []

  afterAll(async () => {
    if (createdAthleteIds.length === 0) return
    await supabaseAdmin
      .from('membership_order_targets')
      .delete()
      .in(
        'payment_order_id',
        (
          await supabaseAdmin
            .from('athlete_payment_orders')
            .select('id')
            .in('athlete_id', createdAthleteIds)
        ).data?.map((row) => row.id) ?? [],
      )
    await supabaseAdmin.from('memberships').delete().in('athlete_id', createdAthleteIds)
    await supabaseAdmin.from('athlete_payment_orders').delete().in('athlete_id', createdAthleteIds)
    await supabaseAdmin.from('athlete_sessions').delete().in('athlete_id', createdAthleteIds)
    await supabaseAdmin.from('athletes').delete().in('id', createdAthleteIds)
  })

  it('create_membership_order_v2 es idempotente: la misma clave no duplica la orden', async () => {
    // La idempotencia se prueba sobre una orden manual, así que el caso declara
    // el canal abierto en vez de heredarlo de la fila compartida.
    const target = listen(
      createApp({ supabaseAdmin, platformSettingsRepository: manualChannelsOpen() }),
    )
    try {
      const { athlete, cookie } = await registerAthlete(target.url, 1, {
        verifyEmail: true,
        admin: supabaseAdmin,
      })
      createdAthleteIds.push(athlete.id)

      const idempotencyKey = randomUUID()
      const payload = { paymentMethod: 'manual_link', planCode: 'plu-annual', idempotencyKey }

      const first = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(payload),
      })
      const firstBody = await first.json()
      expect(first.status, JSON.stringify(firstBody)).toBe(201)

      const second = await fetch(`${target.url}/api/athletes/me/membership-orders`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(payload),
      })
      const secondBody = await second.json()
      expect(second.status, JSON.stringify(secondBody)).toBe(201)

      expect(secondBody.order.id).toBe(firstBody.order.id)

      const { count } = await supabaseAdmin
        .from('athlete_payment_orders')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athlete.id)
      expect(count).toBe(1)
    } finally {
      await target.close()
    }
  })

  it('un atleta no puede registrar una foto con la ruta de otro atleta', async () => {
    const target = listen(createApp({ supabaseAdmin }))
    try {
      const [athleteA, athleteB] = await Promise.all([
        registerAthlete(target.url, 2),
        registerAthlete(target.url, 3),
      ])
      createdAthleteIds.push(athleteA.athlete.id, athleteB.athlete.id)

      const response = await fetch(`${target.url}/api/athletes/me/photo`, {
        method: 'POST',
        headers: authHeaders(athleteA.cookie),
        body: JSON.stringify({ photoPath: `${athleteB.athlete.id}/foto-ajena.jpg` }),
      })
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toMatch(/Ruta de foto invalida/i)
    } finally {
      await target.close()
    }
  })
})
