import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizePath, normalizeReferrerHost } from '../server/modules/analytics/normalizePath.js'
import { describeUserAgent, resolveVisitorId } from '../server/modules/analytics/visitorIdentity.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814130000_web_analytics.sql'),
  'utf8',
)

function fakeRequest({ ip = '186.13.1.1', userAgent = 'Mozilla/5.0', language = 'es-AR' } = {}) {
  const headers = { 'user-agent': userAgent, 'accept-language': language }
  return { ip, get: (name) => headers[String(name).toLowerCase()] }
}

describe('normalizacion de rutas', () => {
  it('agrupa identificadores para que el informe no se atomice', () => {
    // Sin esto, cada orden genera su propia fila en el top de paginas y la
    // pantalla deja de ser medible como pantalla.
    expect(normalizePath('/mi-cuenta/orden/6f3b1e7c-1111-4222-8333-444455556666')).toBe(
      '/mi-cuenta/orden/:id',
    )
    expect(normalizePath('/inscripciones/12345')).toBe('/inscripciones/:n')
    expect(normalizePath('/credencial/PLU-ARG-2026-001')).toBe('/credencial/:membercode')
  })

  it('conserva el slug de contenido, que si interesa medir por separado', () => {
    expect(normalizePath('/eventos/pitbull-classic')).toBe('/eventos/pitbull-classic')
  })

  it('redacta el codigo promocional de los QR viejos de canje', () => {
    // La ruta /canjear/:codigo ya no existe, pero los QR impresos siguen
    // apuntando ahi: el codigo es un secreto de negocio y no debe persistirse.
    expect(normalizePath('/canjear/PITBULL-COMBO')).toBe('/canjear/:code')
    expect(normalizePath('/canjear/onl2026?utm_source=qr')).toBe('/canjear/:code')
  })

  it('descarta la querystring entera', () => {
    // Un link de recuperacion lleva el email en la query: persistirlo seria
    // guardar un dato personal que la analitica no necesita.
    expect(normalizePath('/registro?email=alguien%40example.com&utm_source=ig')).toBe('/registro')
    expect(normalizePath('/?verificar=abc123')).toBe('/')
  })

  it('resuelve la raiz y las entradas vacias', () => {
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('/')).toBe('/')
    expect(normalizePath(undefined)).toBe('/')
  })

  it('reconoce la fuente de trafico y descarta la navegacion interna', () => {
    expect(normalizeReferrerHost('https://www.instagram.com/algo', 'https://plu.ar')).toBe(
      'instagram.com',
    )
    expect(normalizeReferrerHost('https://plu.ar/eventos', 'https://plu.ar')).toBeNull()
    expect(normalizeReferrerHost('', 'https://plu.ar')).toBeNull()
  })
})

describe('identidad del visitante', () => {
  it('no conserva la IP: el mismo visitante da un hash opaco y estable en el dia', () => {
    const request = fakeRequest()
    const env = { AUTH_SECRET: 'secreto-de-prueba' }
    const now = new Date('2026-08-12T10:00:00Z')

    const first = resolveVisitorId(request, { env, now })
    const later = resolveVisitorId(request, { env, now: new Date('2026-08-12T23:00:00Z') })

    expect(first).toBe(later)
    expect(first).not.toContain('186.13.1.1')
    expect(first).toMatch(/^[0-9a-f]{32}$/)
  })

  it('rota al dia siguiente para que el historico no se recorrelacione', () => {
    const request = fakeRequest()
    const env = { AUTH_SECRET: 'secreto-de-prueba' }

    expect(resolveVisitorId(request, { env, now: new Date('2026-08-12T10:00:00Z') })).not.toBe(
      resolveVisitorId(request, { env, now: new Date('2026-08-14T10:00:00Z') }),
    )
  })

  it('distingue visitantes por dispositivo', () => {
    const env = { AUTH_SECRET: 'secreto-de-prueba' }
    const now = new Date('2026-08-12T10:00:00Z')

    expect(resolveVisitorId(fakeRequest({ userAgent: 'A' }), { env, now })).not.toBe(
      resolveVisitorId(fakeRequest({ userAgent: 'B' }), { env, now }),
    )
  })

  it('clasifica agentes y marca los bots', () => {
    expect(describeUserAgent('Googlebot/2.1').isBot).toBe(true)
    expect(describeUserAgent('curl/8.4.0').isBot).toBe(true)

    const iphone = describeUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(iphone).toMatchObject({ deviceType: 'mobile', os: 'iOS', browser: 'Safari' })

    // Edge se anuncia tambien como Chrome y Safari: el orden de deteccion es
    // lo unico que evita contarlo mal.
    const edge = describeUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120',
    )
    expect(edge).toMatchObject({ deviceType: 'desktop', os: 'Windows', browser: 'Edge' })
  })
})

describe('contrato de la migracion de analitica', () => {
  it('borra la analitica junto con el atleta (derecho de supresion)', () => {
    // Con identidad vinculada, esto no es una optimizacion: es la unica forma
    // de que `delete_athlete` cumpla lo que promete.
    const sessionFk = /athlete_id uuid references public\.athletes\(id\) on delete cascade/
    expect(migration.match(sessionFk)?.length).toBeTruthy()
    expect(migration).toContain(
      'session_id uuid not null references public.analytics_sessions(id) on delete cascade',
    )
  })

  it('mantiene las tablas fuera del alcance del navegador', () => {
    // Si `anon` pudiera insertar, cualquiera falsearia las metricas a mano.
    for (const table of ['analytics_sessions', 'analytics_events', 'analytics_daily_rollups']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated`)
    }
  })

  it('purga el detalle crudo pero consolida antes de borrar', () => {
    // Acortar la retencion no puede implicar perder la serie historica.
    expect(migration).toContain('create or replace function public.purge_analytics_raw')
    expect(migration).toContain('perform public.rollup_analytics_daily(v_day)')
    expect(migration).toContain('select public.purge_analytics_raw(90)')
  })

  it('acota el lote de ingesta tambien del lado de la base', () => {
    expect(migration).toContain('jsonb_array_length(p_events) > 50')
  })
})
