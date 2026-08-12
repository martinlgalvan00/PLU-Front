import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MEMBERSHIP_FUNNEL_STEPS } from '../server/routes/analytics.js'
import { PERMISSION_CATALOG, PERMISSION_KEYS, hasPermission } from '../src/lib/permissions.js'

/**
 * Cierre del proceso de auditoría de uso: lo que este archivo protege es que el
 * informe no vuelva a poder mentir.
 *
 * Tres cosas se rompieron en silencio antes y no se notaban mirando el panel:
 * el embudo declaraba cinco pasos y sólo dos se emitían; la RPC del embudo
 * contaba cada paso por separado, así que un paso podía superar al anterior; y
 * el mapa de calor no guardaba la forma del documento, así que dibujaba una
 * grilla cuadrada con coordenadas de una página cuatro veces más alta.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814130000_web_analytics.sql'),
  'utf8',
)

const tracker = readFileSync(resolve(process.cwd(), 'src/services/analyticsService.js'), 'utf8')
const trackerBridge = readFileSync(
  resolve(process.cwd(), 'src/components/layout/AnalyticsTracker.jsx'),
  'utf8',
)
const checkout = readFileSync(
  resolve(process.cwd(), 'src/components/ui/MercadoPagoEmbeddedCheckout.jsx'),
  'utf8',
)
const route = readFileSync(resolve(process.cwd(), 'server/routes/analytics.js'), 'utf8')

describe('cobertura del embudo', () => {
  it('cada paso canónico tiene quién lo emita', () => {
    // El hueco real: `landing_view`, `membership_view` y
    // `membership_checkout_opened` estaban declarados y traducidos, pero ningún
    // archivo del frontend los emitía. El embudo mostraba 0 → 0 → 0 → N → M.
    const emitters = [tracker, trackerBridge, checkout].join('\n')
    for (const step of MEMBERSHIP_FUNNEL_STEPS) {
      expect(emitters, `nadie emite ${step}`).toContain(step)
    }
  })

  it('los pasos de vista salen del puente del router, no de cada página', () => {
    expect(trackerBridge).toContain("home: 'landing_view'")
    expect(trackerBridge).toContain("members: 'membership_view'")
  })

  it('el checkout distingue afiliación de inscripción y de entradas', () => {
    expect(checkout).toContain("membership: 'membership_checkout_opened'")
    expect(checkout).toContain("competition: 'registration_checkout_opened'")
    expect(checkout).toContain("tickets: 'tickets_checkout_opened'")
  })
})

describe('embudo monotónico en la RPC', () => {
  it('exige la cadena completa y en orden, en vez de contar cada paso aparte', () => {
    // La forma vieja era una subconsulta por paso sin relación entre pasos.
    // La nueva ordena las primeras ocurrencias por visitante y corta la cadena
    // en cuanto se saltea un paso o el tiempo retrocede.
    expect(migration).toContain('lag(idx) over (partition by visitor_id order by idx)')
    expect(migration).toContain('lag(at) over (partition by visitor_id order by idx)')
    expect(migration).toContain('idx = prev_idx + 1 and at >= prev_at')
    expect(migration).toContain('bool_and(')
  })

  it('devuelve todos los pasos aunque nadie los haya alcanzado', () => {
    // Sin el left join, un paso sin visitantes desaparecía de la respuesta y el
    // panel dibujaba un embudo con menos escalones de los que tiene.
    expect(migration).toContain('left join reached on reached.idx = steps.idx')
    expect(migration).toContain('coalesce(reached.visitors, 0)')
  })
})

describe('mapa de calor con la forma real de la página', () => {
  it('guarda el tamaño del documento que produjo las coordenadas', () => {
    expect(migration).toContain('document_width integer')
    expect(migration).toContain('document_height integer')
    expect(migration).toContain("nullif(v_event->>'documentWidth', '')::integer")
    expect(migration).toContain("nullif(v_event->>'documentHeight', '')::integer")
  })

  it('el tracker manda esas dimensiones con cada click', () => {
    expect(tracker).toContain('documentWidth: Math.round(width)')
    expect(tracker).toContain('documentHeight: Math.round(height)')
  })

  it('el endpoint las acepta con un techo mayor al del viewport', () => {
    // Un documento largo pasa los 20000px que sí alcanzan para un viewport.
    expect(route).toContain('documentWidth: z.coerce.number().int().min(0).max(200000).optional()')
    expect(route).toContain('documentHeight: z.coerce.number().int().min(0).max(200000).optional()')
  })

  it('la RPC devuelve la proporción como mediana y permite filtrar por dispositivo', () => {
    expect(migration).toContain('percentile_cont(0.5) within group (')
    expect(migration).toContain("'aspectRatio'")
    expect(migration).toContain('p_device_type text default null')
    expect(migration).toContain('(p_device_type is null or s.device_type = p_device_type)')
  })
})

describe('lo más usado y el recorrido identificado', () => {
  it('el ranking global agrupa por elemento y trae personas además de clicks', () => {
    expect(migration).toContain('create or replace function public.get_analytics_elements(')
    expect(migration).toContain('count(distinct visitor_id) as visitors')
  })

  it('el recorrido por atleta existe y se reserva a service_role', () => {
    expect(migration).toContain('create or replace function public.get_analytics_athlete_journey(')
    expect(migration).toContain(
      'revoke all on function public.get_analytics_athlete_journey(uuid, timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.get_analytics_athlete_journey(uuid, timestamptz, timestamptz, integer, uuid) to service_role;',
    )
  })

  it('las RPC nuevas no quedan expuestas a anon ni authenticated', () => {
    expect(migration).toContain(
      'revoke all on function public.get_analytics_elements(timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;',
    )
  })

  it('la firma del heatmap se re-otorga con el parámetro nuevo', () => {
    // Cambiar la firma sin actualizar el grant deja la función sin permisos y el
    // panel responde 500 recién en producción.
    expect(migration).toContain(
      'grant execute on function public.get_analytics_heatmap(text, timestamptz, timestamptz, uuid, text) to service_role;',
    )
  })
})

describe('permiso del recorrido identificado', () => {
  it('está separado de la lectura agregada del informe', () => {
    const identity = PERMISSION_CATALOG.find(({ key }) => key === 'admin.analytics.identity')
    expect(identity).toBeTruthy()
    expect(identity.module).toBe('analytics')
    expect(PERMISSION_KEYS).toContain('admin.analytics.identity')
  })

  it('ver métricas no alcanza para abrir la navegación de una persona', () => {
    const productAnalyst = { permissions: ['admin.analytics.read'] }
    expect(hasPermission(productAnalyst, 'admin.analytics.read')).toBe(true)
    expect(hasPermission(productAnalyst, 'admin.analytics.identity')).toBe(false)
  })

  it('el endpoint identificado lo exige y registra la consulta', () => {
    expect(route).toContain("requirePermission('admin.analytics.identity'")
    expect(route).toContain("action: 'analytics.athlete_journey_viewed'")
    expect(route).toContain("entityType: 'athlete'")
    // El actor tiene que quedar en el registro: sin eso la bitácora dice que
    // alguien miró, pero no quién.
    expect(route).toContain('actorId: req.auth?.user?.id ?? null')
  })
})
