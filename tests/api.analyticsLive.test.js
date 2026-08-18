import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import {
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/**
 * Presencia en vivo y metricas de acceso.
 *
 * El panel contestaba "cuanta gente entro en los ultimos 30 dias" y no
 * contestaba "cuanta gente hay ahora": durante un evento en curso habia que
 * abrir la base y escribir el `where last_seen_at > now() - interval` a mano.
 *
 * Lo que estos tests fijan no es el numero —depende de los datos— sino las
 * cuatro propiedades que hacen que el numero se pueda creer:
 *
 *   1. La ventana la define el servidor y esta acotada. Sin techo, `/live`
 *      seria el informe historico servido por un endpoint sin indices para eso.
 *   2. La respuesta no se cachea. Un panel que refresca cada 15s contra una
 *      respuesta cacheada muestra un numero viejo con cara de nuevo.
 *   3. Personas e intentos son campos distintos. Leer eventos como personas es
 *      el error mas facil de cometer con la bitacora de accesos.
 *   4. Ambos endpoints exigen permiso.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822110000_live_presence_and_access_metrics.sql'),
  'utf8',
)

function createAnalyticsRepositoryDouble() {
  const live = vi.fn(async ({ windowMinutes } = {}) => ({
    generatedAt: '2026-08-15T13:00:00.000Z',
    windowMinutes,
    visitors: 7,
    sessions: 8,
    identified: 2,
    peakLastHour: 12,
    peakToday: 30,
    visitorsToday: 94,
    series: [{ minute: '2026-08-15T12:59:00.000Z', sessions: 5 }],
    pages: [{ path: '/pitbull', visitors: 4, sessions: 4 }],
    devices: [{ device_type: 'mobile', visitors: 5 }],
    countries: [],
    referrers: [],
  }))
  const accessMetrics = vi.fn(async () => ({
    succeeded: { events: 736, people: 303, athletes: 290, staff: 13 },
    failed: { events: 77, people: 15, athletes: 7, staff: 15 },
    accountsCreated: 452,
    failureRate: 0.0947,
    blockedPeople: 15,
    series: [],
    failureReasons: [{ reason: 'invalid_credentials', attempts: 77, people: 15 }],
  }))
  return { repository: { live, accessMetrics }, live, accessMetrics }
}

async function setup({ role = 'admin_maximal' } = {}) {
  const staff = await buildStaffUser({ role, email: `${role}@live.test` })
  const prisma = createPrismaDouble([staff])
  const analytics = createAnalyticsRepositoryDouble()
  const target = listen(createApp({ prisma, analyticsRepository: analytics.repository }))
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { target, cookie, analytics }
}

describe('API de presencia en vivo (/api/analytics/live)', () => {
  it('devuelve la foto de ahora con la ventana por omision', async () => {
    const { target, cookie, analytics } = await setup()

    try {
      const response = await fetch(`${target.url}/api/analytics/live`, {
        headers: { Cookie: cookie },
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({ visitors: 7, identified: 2, peakLastHour: 12 })
      // Cinco minutos: tolera diez latidos perdidos del tracker (late cada 30s)
      // antes de dar por ida a una persona que sigue leyendo.
      expect(analytics.live).toHaveBeenCalledWith({ windowMinutes: 5 })
    } finally {
      await target.close()
    }
  })

  it('no se cachea', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/analytics/live`, {
        headers: { Cookie: cookie },
      })

      // Sin esto, un panel con auto-refresco muestra la misma foto durante
      // minutos y nadie se entera de que dejo de actualizarse.
      expect(response.headers.get('cache-control')).toContain('no-store')
    } finally {
      await target.close()
    }
  })

  it('acota la ventana pedida por el cliente', async () => {
    const { target, cookie } = await setup()

    try {
      const excesiva = await fetch(`${target.url}/api/analytics/live?windowMinutes=1440`, {
        headers: { Cookie: cookie },
      })
      // Una ventana de un dia convertiria este endpoint —pensado para
      // consultarse cada 15 segundos— en el informe historico.
      expect(excesiva.status).toBe(400)

      const valida = await fetch(`${target.url}/api/analytics/live?windowMinutes=30`, {
        headers: { Cookie: cookie },
      })
      expect(valida.status).toBe(200)
    } finally {
      await target.close()
    }
  })

  it('exige permiso de analitica', async () => {
    const { target, cookie } = await setup({ role: 'staff_checkin' })

    try {
      const response = await fetch(`${target.url}/api/analytics/live`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(403)
    } finally {
      await target.close()
    }
  })
})

describe('API de accesos (/api/analytics/access)', () => {
  it('separa personas de intentos', async () => {
    const { target, cookie } = await setup()

    try {
      const response = await fetch(`${target.url}/api/analytics/access?days=30`, {
        headers: { Cookie: cookie },
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      // La distincion es el punto entero del endpoint: 736 asientos de login
      // exitoso son 303 personas entrando muchas veces, no 736 personas.
      expect(body.succeeded.events).toBe(736)
      expect(body.succeeded.people).toBe(303)
      expect(body.succeeded.people).toBeLessThan(body.succeeded.events)
    } finally {
      await target.close()
    }
  })

  it('exige permiso de analitica', async () => {
    const { target, cookie } = await setup({ role: 'staff_checkin' })

    try {
      const response = await fetch(`${target.url}/api/analytics/access?days=7`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(403)
    } finally {
      await target.close()
    }
  })
})

describe('contrato SQL de la migracion', () => {
  it('las dos RPC quedan fuera del alcance de anon', () => {
    // La presencia expone en que ruta esta parada la gente y los accesos
    // exponen cuantas cuentas fallan: ninguna de las dos puede quedar al
    // alcance de la clave publica del navegador.
    for (const fn of ['get_analytics_live', 'get_access_metrics']) {
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${fn}[^;]*from public, anon, authenticated`),
      )
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[^;]*to service_role`),
      )
    }
  })

  it('la ventana de presencia tiene techo tambien en la RPC', () => {
    // El endpoint ya valida, pero la RPC no puede confiar en eso: se invoca
    // tambien desde scripts y trabajos.
    expect(migration).toContain('least(coalesce(p_window_minutes, 5), 60)')
  })

  it('la serie mide concurrencia y no actividad por minuto', () => {
    // Contar eventos por minuto daria una curva dentada que subestima a quien
    // esta leyendo sin tocar nada: una sesion cuenta en el minuto que su
    // intervalo cubre, haya emitido o no un evento ahi.
    expect(migration).toContain("r.started_at <= m.minute + interval '1 minute'")
    expect(migration).toContain('r.last_seen_at >= m.minute')
  })

  it('la presencia se apoya en un indice por last_seen_at', () => {
    // El indice existente lidera por `visitor_id` y no sirve para este filtro:
    // sin uno propio, cada refresco escanea la tabla entera.
    expect(migration).toContain('analytics_sessions_last_seen_idx')
  })
})
