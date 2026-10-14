import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  buildMercadoPagoAuthorizationUrl,
  createMercadoPagoOAuthState,
  createPkcePair,
  exchangeMercadoPagoAuthorizationCode,
  getMercadoPagoOAuthConfig,
  mercadoPagoConnectionStatus,
  readMercadoPagoOAuthState,
} from '../server/modules/payments/mercadoPagoOAuth.js'
import {
  isMercadoPagoOAuthRefreshDue,
  refreshMercadoPagoOAuthProfile,
} from '../server/modules/payments/mercadoPagoOAuthAccounts.js'
import { resolveMercadoPagoNotificationCredentials } from '../server/modules/payments/mercadoPagoProfileRuntime.js'
import {
  decryptPaymentProfileSecrets,
  encryptPaymentProfileSecrets,
} from '../server/modules/payments/paymentProfileSecrets.js'
import { createSupabasePaymentProfileRepository } from '../server/modules/payments/supabasePaymentProfileRepository.js'
import { processPaymentWebhook } from '../server/modules/payments/paymentWorkflow.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const ORG = '00000000-0000-4000-8000-000000000001'
const OAUTH_ENV = {
  MERCADO_PAGO_CLIENT_ID: '1234567890',
  MERCADO_PAGO_CLIENT_SECRET: 'client-secret-for-tests',
  PAYMENT_PROFILE_SECRETS_KEY: 'b'.repeat(64),
  APP_URL: 'https://plu.test',
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const TOKEN_PAYLOAD = {
  access_token: 'APP_USR-seller-access',
  token_type: 'bearer',
  expires_in: 15_552_000,
  scope: 'read write offline_access',
  user_id: 241983636,
  refresh_token: 'TG-seller-refresh-1',
  public_key: 'APP_USR-seller-public',
  live_mode: true,
}

/**
 * Tabla `payment_profiles` en memoria con lo que usa el repositorio:
 * eq (incluido `config->>x`), select/insert/update/delete y maybeSingle/single.
 */
function createProfilesDouble(initial = []) {
  const rows = initial.map((row) => ({ ...row }))
  let seq = rows.length

  const read = (row, column) => {
    const json = /^config->>(.+)$/.exec(column)
    return json ? (row.config?.[json[1]] ?? null) : row[column]
  }

  function builder(table) {
    const filters = []
    let op = 'select'
    let payload = null
    let single = null
    const matches = () =>
      (table === 'payment_profiles' ? rows : []).filter((row) =>
        filters.every(([column, value]) => String(read(row, column)) === String(value)),
      )
    const run = () => {
      if (table !== 'payment_profiles') return { data: [], error: null }
      if (op === 'insert') {
        seq += 1
        const row = {
          id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
          created_at: '2026-10-13T00:00:00.000Z',
          updated_at: '2026-10-13T00:00:00.000Z',
          ...payload,
        }
        rows.push(row)
        return { data: single ? row : [row], error: null }
      }
      const found = matches()
      if (op === 'update') {
        for (const row of found) Object.assign(row, payload)
      }
      if (op === 'delete') {
        for (const row of found) rows.splice(rows.indexOf(row), 1)
        return { data: null, error: null }
      }
      return { data: single ? (found[0] ?? null) : found, error: null }
    }
    const query = {
      select: () => query,
      order: () => query,
      limit: () => query,
      or: () => query,
      not: () => query,
      in: () => query,
      is: () => query,
      eq: (column, value) => {
        filters.push([column, value])
        return query
      },
      insert: (value) => {
        op = 'insert'
        payload = value
        return query
      },
      update: (value) => {
        op = 'update'
        payload = value
        return query
      },
      delete: () => {
        op = 'delete'
        return query
      },
      maybeSingle: () => {
        single = 'maybe'
        return query
      },
      single: () => {
        single = 'one'
        return query
      },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    }
    return query
  }

  return { rows, client: { from: (table) => builder(table) } }
}

function oauthProfileRow({ id, collectorId = '241983636', expiresAt, status = 'connected', refreshToken = 'TG-old' }) {
  return {
    id,
    organization_id: ORG,
    name: 'Mercado Pago · Club Anfitrión',
    kind: 'mercado_pago',
    active: true,
    config: {
      publicKey: 'APP_USR-old-public',
      collectorId,
      notes: '',
      connection: 'oauth',
      expiresAt,
      status,
    },
    secrets_ciphertext: encryptPaymentProfileSecrets(
      { accessToken: 'APP_USR-old-access', refreshToken, webhookSecret: '' },
      OAUTH_ENV,
    ),
  }
}

describe('configuración de la vinculación OAuth', () => {
  it('lista lo que falta y no se ofrece sin credenciales de la app', () => {
    const config = getMercadoPagoOAuthConfig({ APP_URL: 'https://plu.test' })
    expect(config.available).toBe(false)
    expect(config.missing).toEqual([
      'MERCADO_PAGO_CLIENT_ID',
      'MERCADO_PAGO_CLIENT_SECRET',
      'PAYMENT_PROFILE_SECRETS_KEY',
    ])
  })

  it('arma el redirect_uri desde el origen público de la API', () => {
    const config = getMercadoPagoOAuthConfig(OAUTH_ENV)
    expect(config.available).toBe(true)
    expect(config.redirectUri).toBe(
      'https://plu.test/api/payment-profiles/mercado-pago/oauth/callback',
    )
  })
})

describe('estado OAuth', () => {
  it('va y vuelve cifrado, con el verifier adentro', () => {
    const state = createMercadoPagoOAuthState({ actorId: 'u-1', verifier: 'v-secret' }, OAUTH_ENV)
    // El verifier de PKCE no puede viajar legible por el navegador.
    expect(state).not.toContain('v-secret')
    expect(readMercadoPagoOAuthState(state, OAUTH_ENV)).toMatchObject({
      actorId: 'u-1',
      verifier: 'v-secret',
    })
  })

  it('rechaza un estado adulterado o vencido', () => {
    const state = createMercadoPagoOAuthState({ actorId: 'u-1' }, OAUTH_ENV)
    expect(() => readMercadoPagoOAuthState(`${state}x`, OAUTH_ENV)).toThrow(
      expect.objectContaining({ details: { code: 'MP_OAUTH_STATE_INVALID' } }),
    )
    const old = createMercadoPagoOAuthState({}, OAUTH_ENV, new Date(Date.now() - 60 * 60 * 1000))
    expect(() => readMercadoPagoOAuthState(old, OAUTH_ENV)).toThrow(
      expect.objectContaining({ details: { code: 'MP_OAUTH_STATE_EXPIRED' } }),
    )
  })

  it('no acepta como estado otro secreto cifrado con la misma clave', () => {
    // Mismo cifrado que los tokens de los perfiles: sin el `purpose` un
    // ciphertext de credenciales pasaría por un estado válido.
    const credentials = encryptPaymentProfileSecrets({ accessToken: 'x', exp: Date.now() + 1e6 }, OAUTH_ENV)
    expect(() => readMercadoPagoOAuthState(credentials, OAUTH_ENV)).toThrow(
      expect.objectContaining({ details: { code: 'MP_OAUTH_STATE_INVALID' } }),
    )
  })
})

describe('URL de autorización y canje del código', () => {
  it('manda client_id, state y redirect_uri; PKCE solo si está prendido', () => {
    const config = getMercadoPagoOAuthConfig(OAUTH_ENV)
    const plain = new URL(buildMercadoPagoAuthorizationUrl(config, { state: 'S' }))
    expect(plain.origin).toBe('https://auth.mercadopago.com')
    expect(Object.fromEntries(plain.searchParams)).toEqual({
      client_id: '1234567890',
      response_type: 'code',
      platform_id: 'mp',
      state: 'S',
      redirect_uri: config.redirectUri,
    })

    const { challenge, verifier } = createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    const withPkce = new URL(buildMercadoPagoAuthorizationUrl(config, { state: 'S', codeChallenge: challenge }))
    expect(withPkce.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('canjea el código y normaliza la respuesta de MP', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, TOKEN_PAYLOAD))
    const now = new Date('2026-10-13T12:00:00.000Z')
    const tokens = await exchangeMercadoPagoAuthorizationCode(
      getMercadoPagoOAuthConfig(OAUTH_ENV),
      { code: 'TG-code' },
      { fetchImpl, now },
    )
    const [, request] = fetchImpl.mock.calls[0]
    expect(JSON.parse(request.body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'TG-code',
      client_secret: 'client-secret-for-tests',
    })
    expect(tokens).toMatchObject({
      accessToken: 'APP_USR-seller-access',
      refreshToken: 'TG-seller-refresh-1',
      userId: '241983636',
      publicKey: 'APP_USR-seller-public',
      expiresAt: '2027-04-11T12:00:00.000Z',
    })
  })

  it('invalid_grant se distingue: es "volvé a conectar", no una caída de MP', async () => {
    const fetchImpl = async () => jsonResponse(400, { error: 'invalid_grant', message: 'expired' })
    await expect(
      exchangeMercadoPagoAuthorizationCode(getMercadoPagoOAuthConfig(OAUTH_ENV), { code: 'x' }, { fetchImpl }),
    ).rejects.toMatchObject({ status: 409, details: { code: 'MP_OAUTH_INVALID_GRANT' } })
  })
})

describe('estado de conexión y ventana de renovación', () => {
  const now = new Date('2026-10-13T00:00:00.000Z')
  const inDays = (days) => new Date(now.getTime() + days * 86_400_000).toISOString()

  it('clasifica manual, conectada, por vencer y a reconectar', () => {
    expect(mercadoPagoConnectionStatus({}, now)).toBe('manual')
    expect(mercadoPagoConnectionStatus({ connection: 'oauth', expiresAt: inDays(90) }, now)).toBe('connected')
    expect(mercadoPagoConnectionStatus({ connection: 'oauth', expiresAt: inDays(5) }, now)).toBe('expiring')
    expect(mercadoPagoConnectionStatus({ connection: 'oauth', expiresAt: inDays(-1) }, now)).toBe('needs_reconnect')
    expect(
      mercadoPagoConnectionStatus({ connection: 'oauth', expiresAt: inDays(90), status: 'needs_reconnect' }, now),
    ).toBe('needs_reconnect')
  })

  it('renueva dentro de los 30 días previos, nunca una que ya pide reconectar', () => {
    const profile = (config) => ({ kind: 'mercado_pago', config: { connection: 'oauth', ...config } })
    expect(isMercadoPagoOAuthRefreshDue(profile({ expiresAt: inDays(90) }), now)).toBe(false)
    expect(isMercadoPagoOAuthRefreshDue(profile({ expiresAt: inDays(20) }), now)).toBe(true)
    expect(isMercadoPagoOAuthRefreshDue(profile({ expiresAt: inDays(20), status: 'needs_reconnect' }), now)).toBe(false)
    expect(isMercadoPagoOAuthRefreshDue({ kind: 'mercado_pago', config: {} }, now)).toBe(false)
  })
})

describe('vinculación: alta, reconexión y renovación', () => {
  const tokens = {
    accessToken: 'APP_USR-seller-access',
    refreshToken: 'TG-seller-refresh-1',
    publicKey: 'APP_USR-seller-public',
    userId: '241983636',
    liveMode: true,
    scope: 'read write offline_access',
    expiresAt: '2027-04-11T12:00:00.000Z',
  }

  it('la misma cuenta de MP reusa su perfil en vez de duplicarlo', async () => {
    const double = createProfilesDouble()
    const repo = createSupabasePaymentProfileRepository(double.client, { env: OAUTH_ENV })

    const first = await repo.saveMercadoPagoOAuthConnection({
      tokens,
      identity: { nickname: 'CLUBANFITRION' },
    })
    expect(first.created).toBe(true)
    expect(first.profile).toMatchObject({
      name: 'Mercado Pago · CLUBANFITRION',
      connectionStatus: 'connected',
      config: { connection: 'oauth', collectorId: '241983636', publicKey: 'APP_USR-seller-public' },
    })
    // Los tokens nunca salen en el perfil mapeado.
    expect(JSON.stringify(first.profile)).not.toContain('APP_USR-seller-access')

    const second = await repo.saveMercadoPagoOAuthConnection({ tokens: { ...tokens, refreshToken: 'TG-2' } })
    expect(second.created).toBe(false)
    expect(second.profile.id).toBe(first.profile.id)
    expect(double.rows).toHaveLength(1)
    expect(decryptPaymentProfileSecrets(double.rows[0].secrets_ciphertext, OAUTH_ENV)).toMatchObject({
      refreshToken: 'TG-2',
    })
  })

  it('reconectar una cuenta con OTRA cuenta de MP se rechaza', async () => {
    const id = '00000000-0000-4000-8000-0000000000aa'
    const double = createProfilesDouble([oauthProfileRow({ id, collectorId: '999' })])
    const repo = createSupabasePaymentProfileRepository(double.client, { env: OAUTH_ENV })

    await expect(repo.saveMercadoPagoOAuthConnection({ profileId: id, tokens })).rejects.toMatchObject({
      status: 409,
      details: { code: 'MP_OAUTH_ACCOUNT_MISMATCH' },
    })
  })

  it('desde el panel no se puede tocar la public key ni el collector de una cuenta OAuth', async () => {
    const id = '00000000-0000-4000-8000-0000000000ab'
    const double = createProfilesDouble([oauthProfileRow({ id, expiresAt: '2027-01-01T00:00:00.000Z' })])
    const repo = createSupabasePaymentProfileRepository(double.client, { env: OAUTH_ENV })

    const updated = await repo.update(id, {
      config: { publicKey: 'otra', collectorId: '1', connection: 'manual', notes: 'Club anfitrión' },
    })
    expect(updated.config).toMatchObject({
      publicKey: 'APP_USR-old-public',
      collectorId: '241983636',
      connection: 'oauth',
      notes: 'Club anfitrión',
    })
    await expect(
      repo.update(id, { secrets: { accessToken: 'APP_USR-x-token', webhookSecret: 'whsec-123' } }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('renueva guardando el refresh token NUEVO (rota en cada uso)', async () => {
    const id = '00000000-0000-4000-8000-0000000000ac'
    const double = createProfilesDouble([oauthProfileRow({ id, expiresAt: '2026-10-20T00:00:00.000Z' })])
    const fetchImpl = vi.fn(async () => jsonResponse(200, { ...TOKEN_PAYLOAD, refresh_token: 'TG-rotated' }))

    const outcome = await refreshMercadoPagoOAuthProfile({
      client: double.client,
      profileId: id,
      env: OAUTH_ENV,
      fetchImpl,
      now: new Date('2026-10-13T12:00:00.000Z'),
    })

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'TG-old',
    })
    expect(outcome.refreshed).toBe(true)
    expect(outcome.profile.config.expiresAt).toBe('2027-04-11T12:00:00.000Z')
    expect(decryptPaymentProfileSecrets(double.rows[0].secrets_ciphertext, OAUTH_ENV)).toMatchObject({
      accessToken: 'APP_USR-seller-access',
      refreshToken: 'TG-rotated',
    })
  })

  it('invalid_grant al renovar deja la cuenta en "volver a conectar" sin tocar los tokens', async () => {
    const id = '00000000-0000-4000-8000-0000000000ad'
    const double = createProfilesDouble([oauthProfileRow({ id, expiresAt: '2026-10-20T00:00:00.000Z' })])
    const before = double.rows[0].secrets_ciphertext

    const outcome = await refreshMercadoPagoOAuthProfile({
      client: double.client,
      profileId: id,
      env: OAUTH_ENV,
      fetchImpl: async () => jsonResponse(400, { error: 'invalid_grant', message: 'revoked' }),
    })

    expect(outcome).toMatchObject({ refreshed: false, needsReconnect: true })
    expect(outcome.profile.connectionStatus).toBe('needs_reconnect')
    expect(double.rows[0].secrets_ciphertext).toBe(before)
  })
})

describe('cuenta que cobró una notificación', () => {
  it('el user_id elige la cuenta vinculada aunque la firma sea de la app de PLU', async () => {
    const id = '00000000-0000-4000-8000-0000000000ae'
    const double = createProfilesDouble([oauthProfileRow({ id, expiresAt: '2027-01-01T00:00:00.000Z' })])
    const global = { secret: 'app-secret', profileId: null, accessToken: 'APP_USR-plu' }

    const owner = await resolveMercadoPagoNotificationCredentials(
      double.client,
      { matched: global, userId: 241983636 },
      OAUTH_ENV,
    )
    expect(owner).toMatchObject({ profileId: id, accessToken: 'APP_USR-old-access', collectorId: '241983636' })

    const unknown = await resolveMercadoPagoNotificationCredentials(
      double.client,
      { matched: global, userId: 1 },
      OAUTH_ENV,
    )
    expect(unknown).toBe(global)
  })

  it('processPaymentWebhook le pasa el user_id del body al resolver', async () => {
    const secret = 'secreto-app'
    const ts = Math.floor(Date.now() / 1000)
    const manifest = `id:175951629312;request-id:req-1;ts:${ts};`
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex')
    const sellerAdapter = { getPayment: vi.fn(async () => ({ id: 175951629312, external_reference: 'x' })) }
    const resolver = vi.fn(async () => sellerAdapter)
    const repository = {
      recordWebhook: vi.fn(async () => ({ created: false, event: { id: 'e', status: 'processed' } })),
    }

    await processPaymentWebhook(
      {
        body: { type: 'payment', user_id: 241983636, data: { id: '175951629312' } },
        query: { 'data.id': '175951629312', type: 'payment' },
        headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' },
      },
      {
        repository,
        mercadoPago: { getPayment: vi.fn() },
        webhookSecrets: [{ secret, profileId: null, accessToken: 'APP_USR-plu' }],
        resolveMercadoPagoForSecret: resolver,
      },
    ).catch(() => null)

    expect(resolver).toHaveBeenCalledWith(
      expect.objectContaining({ secret }),
      { userId: 241983636 },
    )
  })
})

describe('rutas de vinculación', () => {
  async function withApp(env, run, { supabaseAdmin = createProfilesDouble().client, fetchImpl } = {}) {
    const staff = await buildStaffUser({ email: `mp-oauth-${Math.random()}@plu.test` })
    const target = listen(
      createApp({
        prisma: createPrismaDouble([staff]),
        supabaseAdmin,
        mercadoPagoOAuthFetch: fetchImpl,
        env: { AUTH_SECRET: 'mp-oauth-routes-secret', ...env },
      }),
    )
    try {
      const { cookie } = await loginStaff(target.url, { email: staff.email })
      await run(target.url, cookie)
    } finally {
      await target.close()
    }
  }

  it('sin la app configurada, /start responde 503 con el código para el panel', async () => {
    await withApp({ APP_URL: 'http://localhost:5173' }, async (url, cookie) => {
      const response = await fetch(`${url}/api/payment-profiles/mercado-pago/oauth/start`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: '{}',
      })
      expect(response.status).toBe(503)
      expect((await response.json()).code).toBe('MP_OAUTH_NOT_CONFIGURED')
    })
  })

  it('/start devuelve la URL de MP y el callback completa el alta', async () => {
    const fetchImpl = vi.fn(async (url) =>
      String(url).endsWith('/users/me')
        ? jsonResponse(200, { nickname: 'CLUBANFITRION', email: 'club@test' })
        : jsonResponse(200, TOKEN_PAYLOAD),
    )
    const double = createProfilesDouble()
    await withApp(
      OAUTH_ENV,
      async (url, cookie) => {
        const start = await fetch(`${url}/api/payment-profiles/mercado-pago/oauth/start`, {
          method: 'POST',
          headers: authHeaders(cookie),
          body: JSON.stringify({ name: 'Club anfitrión' }),
        })
        expect(start.status).toBe(200)
        const authorizationUrl = new URL((await start.json()).authorizationUrl)
        const state = authorizationUrl.searchParams.get('state')

        const callback = await fetch(
          `${url}/api/payment-profiles/mercado-pago/oauth/callback?code=TG-code&state=${encodeURIComponent(state)}`,
          { redirect: 'manual' },
        )
        expect(callback.status).toBe(303)
        const landing = new URL(callback.headers.get('location'))
        expect(landing.pathname).toBe('/admin/mercado-pago/vinculacion')
        expect(landing.searchParams.get('status')).toBe('connected')
        expect(double.rows).toHaveLength(1)
        expect(double.rows[0]).toMatchObject({ name: 'Club anfitrión', kind: 'mercado_pago' })
      },
      { supabaseAdmin: double.client, fetchImpl },
    )
  })

  it('el callback con un estado inválido o cancelado vuelve al panel, sin canjear nada', async () => {
    const fetchImpl = vi.fn()
    await withApp(
      OAUTH_ENV,
      async (url) => {
        const forged = await fetch(
          `${url}/api/payment-profiles/mercado-pago/oauth/callback?code=x&state=inventado`,
          { redirect: 'manual' },
        )
        expect(new URL(forged.headers.get('location')).searchParams.get('status')).toBe('error')

        const state = createMercadoPagoOAuthState({}, OAUTH_ENV)
        const cancelled = await fetch(
          `${url}/api/payment-profiles/mercado-pago/oauth/callback?error=access_denied&state=${encodeURIComponent(state)}`,
          { redirect: 'manual' },
        )
        expect(new URL(cancelled.headers.get('location')).searchParams.get('status')).toBe('cancelled')
        expect(fetchImpl).not.toHaveBeenCalled()
      },
      { fetchImpl },
    )
  })
})
