import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SharedRateLimitStore } from '../server/lib/defense/sharedRateLimitStore.js'
import { createLoadShedder } from '../server/middleware/loadShedder.js'
import {
  assertIdentityNotLocked,
  clearIdentityFailures,
  hashIdentity,
  IDENTITY_SCOPES,
  registerIdentityFailure,
} from '../server/lib/defense/identityGuard.js'

/**
 * defenseLayer.test.js — PLU ARG
 *
 * Lo que se verifica acá no es "que el limite exista" (eso ya lo cubrían los
 * tests de cada endpoint) sino las tres propiedades por las que se escribió esta
 * capa: que el conteo se comparta entre instancias, que un ataque sostenido no
 * cueste consultas, y que una falla de Supabase no deje a nadie afuera.
 */

function fakeClient(handler) {
  return { rpc: vi.fn(handler) }
}

function allowResponse(hits, limit) {
  return {
    data: { allowed: hits <= limit, hits, limit, blocked: false, resetAt: null, retryAfterSeconds: 0 },
    error: null,
  }
}

describe('SharedRateLimitStore', () => {
  it('en modo strict sincroniza cada hit con costo 1', async () => {
    let hits = 0
    const client = fakeClient(async (_fn, args) => {
      hits += args.p_cost
      return allowResponse(hits, args.p_limit)
    })
    const store = new SharedRateLimitStore({ name: 'auth', mode: 'strict', getClient: () => client })
    store.init({ windowMs: 60_000, limit: 5 })

    await store.increment('ip')
    await store.increment('ip')

    expect(client.rpc).toHaveBeenCalledTimes(2)
    expect(client.rpc.mock.calls[0][1]).toMatchObject({ p_key: 'auth:ip', p_cost: 1, p_limit: 5 })
  })

  it('en modo sampled acumula y sincroniza por lote', async () => {
    const client = fakeClient(async (_fn, args) => allowResponse(args.p_cost, args.p_limit))
    const store = new SharedRateLimitStore({ name: 'staff', mode: 'sampled', getClient: () => client })
    // Umbral = ceil(60 / 6) = 10.
    store.init({ windowMs: 60_000, limit: 60 })

    for (let i = 0; i < 10; i += 1) await store.increment('ip')

    // Una sola ida a la base por diez requests, y con el costo agrupado: sin
    // esto el limite se pagaría con una consulta por request, que es lo que no
    // entra en el plan gratuito.
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc.mock.calls[0][1].p_cost).toBe(10)
  })

  it('hereda el conteo de otra instancia: el limite deja de ser por proceso', async () => {
    // Simula que otra instancia ya consumió 4 de 5. La instancia local está en
    // cero, que es exactamente el agujero del store en memoria.
    const client = fakeClient(async (_fn, args) => allowResponse(4 + args.p_cost, args.p_limit))
    const store = new SharedRateLimitStore({ name: 'auth', mode: 'strict', getClient: () => client })
    store.init({ windowMs: 60_000, limit: 5 })

    const result = await store.increment('ip')

    expect(result.totalHits).toBe(5)
  })

  it('cachea el bloqueo y deja de consultar la base mientras dura', async () => {
    const client = fakeClient(async () => ({
      data: { allowed: false, hits: 99, blocked: true, retryAfterSeconds: 120 },
      error: null,
    }))
    const store = new SharedRateLimitStore({ name: 'auth', mode: 'strict', getClient: () => client })
    store.init({ windowMs: 60_000, limit: 5 })

    const first = await store.increment('atacante')
    for (let i = 0; i < 50; i += 1) await store.increment('atacante')

    expect(first.totalHits).toBeGreaterThan(5)
    // Cincuenta requests más del mismo cliente bloqueado: una sola consulta en
    // total. Es la propiedad central -- el ataque se abarata para el defensor a
    // medida que insiste, en vez de encarecerse.
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('el bloqueo sobrevive al reinicio de la ventana local', async () => {
    const client = fakeClient(async () => ({
      data: { allowed: false, hits: 99, blocked: true, retryAfterSeconds: 3600 },
      error: null,
    }))
    const store = new SharedRateLimitStore({ name: 'auth', mode: 'strict', getClient: () => client })
    store.init({ windowMs: 1, limit: 5 })

    await store.increment('atacante')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const afterWindow = await store.increment('atacante')

    // Si el bloqueo se perdiera al rotar la ventana, alcanzaría con esperar un
    // minuto para recuperar el cupo entero y el castigo escalonado no serviría.
    expect(afterWindow.totalHits).toBeGreaterThan(5)
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('si la base falla se degrada al contador local en vez de romper el request', async () => {
    const client = fakeClient(async () => ({ data: null, error: { message: 'sin conexion' } }))
    const store = new SharedRateLimitStore({ name: 'auth', mode: 'strict', getClient: () => client })
    store.init({ windowMs: 60_000, limit: 5 })

    const first = await store.increment('ip')
    const second = await store.increment('ip')

    expect(first.totalHits).toBe(1)
    expect(second.totalHits).toBe(2)
  })

  it('abre el corte de circuito tras fallas seguidas y deja de intentar', async () => {
    const client = fakeClient(async () => ({ data: null, error: { message: 'sin conexion' } }))
    const store = new SharedRateLimitStore({ name: 'auth', mode: 'strict', getClient: () => client })
    store.init({ windowMs: 60_000, limit: 100 })

    for (let i = 0; i < 10; i += 1) await store.increment('ip')

    // Tres fallas abren el circuito: sin esto, una caída de Supabase le sumaría
    // el timeout de la RPC a cada request de la aplicación.
    expect(client.rpc).toHaveBeenCalledTimes(3)
  })

  it('no crece sin techo aunque el ataque rote de clave', async () => {
    const client = fakeClient(async (_fn, args) => allowResponse(args.p_cost, args.p_limit))
    const store = new SharedRateLimitStore({ name: 'analytics', mode: 'sampled', getClient: () => client })
    store.init({ windowMs: 1, limit: 120 })

    for (let i = 0; i < 25_000; i += 1) await store.increment(`ip-${i}`)

    // El propio rate limiter no puede ser el vector de agotamiento de memoria.
    expect(store.entries.size).toBeLessThanOrEqual(20_000)
  })
})

describe('identityGuard', () => {
  const env = { AUTH_SECRET: 'secreto-de-prueba' }

  it('nunca manda el email a la base', () => {
    const hash = hashIdentity('Persona@Ejemplo.COM', env)

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('ejemplo')
    // Normaliza mayúsculas y espacios: si no, `A@b.com` y `a@b.com` tendrían
    // contadores distintos y bastaría alternar el tipeo para duplicar el cupo.
    expect(hashIdentity('  persona@ejemplo.com ', env)).toBe(hash)
  })

  it('la sal cambia el hash: un volcado de la tabla no se cruza entre entornos', () => {
    expect(hashIdentity('a@b.com', { AUTH_SECRET: 'uno' }))
      .not.toBe(hashIdentity('a@b.com', { AUTH_SECRET: 'dos' }))
  })

  it('corta con 429 cuando la cuenta está bloqueada', async () => {
    const supabaseAdmin = fakeClient(async () => ({
      data: { locked: true, retryAfterSeconds: 300 },
      error: null,
    }))

    await expect(
      assertIdentityNotLocked({
        scope: IDENTITY_SCOPES.staffLogin,
        identity: 'a@b.com',
        deps: { supabaseAdmin },
        env,
      }),
    ).rejects.toMatchObject({ status: 429, details: { code: 'identity_locked' } })
  })

  it('deja pasar si la base no responde: un incidente no puede dejar sin login', async () => {
    const supabaseAdmin = fakeClient(async () => ({ data: null, error: { message: 'caida' } }))

    await expect(
      assertIdentityNotLocked({
        scope: IDENTITY_SCOPES.staffLogin,
        identity: 'a@b.com',
        deps: { supabaseAdmin },
        env,
      }),
    ).resolves.toBeUndefined()
  })

  it('registra el fallo con el umbral y la ventana explícitos', async () => {
    const supabaseAdmin = fakeClient(async () => ({ data: { locked: false, failures: 1 }, error: null }))

    await registerIdentityFailure({
      scope: IDENTITY_SCOPES.athleteLogin,
      identity: 'a@b.com',
      deps: { supabaseAdmin },
      env,
    })

    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('register_identity_failure', {
      p_scope: 'athlete_login',
      p_identity_hash: hashIdentity('a@b.com', env),
      p_threshold: 5,
      p_window_seconds: 900,
    })
  })

  it('no hace nada si no hay cliente Supabase configurado', async () => {
    await expect(
      clearIdentityFailures({ scope: 'x', identity: 'a@b.com', deps: {}, env }),
    ).resolves.toBeUndefined()
  })
})

describe('loadShedder', () => {
  function fakeRes() {
    const handlers = {}
    return {
      set: vi.fn(),
      on: (event, fn) => { handlers[event] = fn },
      emit: (event) => handlers[event]?.(),
    }
  }

  it('rechaza con 503 cuando se llena el cupo de trabajo simultáneo', () => {
    const shedder = createLoadShedder({ maxInFlight: 2 })
    const responses = [fakeRes(), fakeRes(), fakeRes()]
    const nexts = [vi.fn(), vi.fn(), vi.fn()]

    responses.forEach((res, i) => shedder({}, res, nexts[i]))

    expect(nexts[0]).toHaveBeenCalledWith()
    expect(nexts[1]).toHaveBeenCalledWith()
    expect(nexts[2]).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }))
    expect(responses[2].set).toHaveBeenCalledWith('Retry-After', '2')
  })

  it('libera el cupo cuando el cliente corta la conexión', () => {
    const shedder = createLoadShedder({ maxInFlight: 1 })
    const first = fakeRes()
    shedder({}, first, vi.fn())
    expect(shedder.stats().inFlight).toBe(1)

    // Un script de fuerza bruta corta antes de leer la respuesta: sin escuchar
    // `close`, el contador solo subiría y la instancia se auto-bloquearía.
    first.emit('close')

    expect(shedder.stats().inFlight).toBe(0)
    const second = vi.fn()
    shedder({}, fakeRes(), second)
    expect(second).toHaveBeenCalledWith()
  })

  it('no descuenta dos veces si llegan finish y close', () => {
    const shedder = createLoadShedder({ maxInFlight: 2 })
    const res = fakeRes()
    shedder({}, res, vi.fn())
    res.emit('finish')
    res.emit('close')

    expect(shedder.stats().inFlight).toBe(0)
  })
})

describe('migraciones de la capa de defensa', () => {
  const read = (file) => readFileSync(join(process.cwd(), 'supabase/migrations', file), 'utf8')

  it('quita la escritura de anon/authenticated y cierra la vista pública', () => {
    const sql = read('20260818120000_least_privilege_public_grants.sql')

    expect(sql).toContain('revoke insert, update, delete, truncate, references, trigger')
    expect(sql).toContain('alter default privileges in schema public')
    // La vista era `security definer` y auto-actualizable: escribir a través de
    // ella llegaba a `public.events` con RLS desactivada.
    expect(sql).toContain("alter view public.public_events_view set (security_invoker = true)")
    expect(sql).toContain('revoke all on public.public_events_view from anon, authenticated')
    // La migración se verifica a sí misma: si algo queda con escritura, falla.
    expect(sql).toContain('raise exception')
  })

  it('define los contadores compartidos con permisos cerrados', () => {
    const sql = read('20260818130000_adaptive_defense_layer.sql')

    expect(sql).toContain('create unlogged table if not exists public.rate_limit_buckets')
    expect(sql).toContain('create table if not exists public.identity_lockouts')
    expect(sql).toContain('create or replace function public.consume_rate_limit')
    expect(sql).toContain('create or replace function public.register_identity_failure')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public')
    expect(sql).toContain('from public, anon, authenticated')
    expect(sql).toContain('to service_role')
    // Sin purga, `rate_limit_buckets` acumula una fila por IP vista alguna vez.
    expect(sql).toContain('create or replace function public.purge_defense_counters')
  })

  it('pone cuota y presupuesto a la analítica pública', () => {
    const sql = read('20260818140000_free_tier_storage_budget.sql')

    expect(sql).toContain('drop index if exists public.analytics_events_heatmap_idx')
    expect(sql).toContain('drop index if exists public.analytics_events_type_idx')
    expect(sql).toContain('create or replace function public.analytics_daily_event_cap')
    expect(sql).toContain('create or replace function public.analytics_session_event_cap')
    // La garantía dura: un techo en bytes, no en filas estimadas.
    expect(sql).toContain('create or replace function public.enforce_analytics_storage_budget')
    expect(sql).toContain('create or replace function public.purge_cron_history')
    expect(sql).toContain('create or replace function public.get_database_usage')
    expect(sql).toContain("cron.schedule(\n      'plu-storage-nightly'")
  })
})
