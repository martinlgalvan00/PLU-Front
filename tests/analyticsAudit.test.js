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
/**
 * Segunda migración del dominio: tiempo activo, engagement y el embudo por
 * sesión. Se lee aparte porque redefine funciones de la primera, y afirmar el
 * contrato nuevo sobre el archivo viejo daría verde sobre código muerto.
 */
const activeTimeMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260821130000_analytics_active_time_engagement.sql'),
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
    expect(trackerBridge).toContain("members: 'membership_view'")
  })

  it('el primer paso no depende de la portada', () => {
    // Atado a `view === 'home'`, toda sesión que entrara directo a una landing
    // profunda nunca emitía el paso 1, y como el embudo exige arrancar por ahí,
    // quedaba descartada del embudo completo. Sobre el tráfico real eran el 39%
    // de las sesiones: Instagram linkea a `/pitbull` y `/afiliacion`, no a `/`.
    expect(trackerBridge).toContain("const ENTRY_FUNNEL_STEP = 'landing_view'")
    expect(trackerBridge).not.toContain("home: 'landing_view'")
    // Una sola vez por montaje: sin el guard, volver a la portada reabriría el
    // embudo a mitad de la navegación.
    expect(trackerBridge).toContain('entryTracked')
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
    // La nueva ordena las primeras ocurrencias y corta la cadena en cuanto se
    // saltea un paso o el tiempo retrocede.
    expect(activeTimeMigration).toContain('idx = prev_idx + 1 and at >= prev_at')
    expect(activeTimeMigration).toContain('bool_and(')
  })

  it('encadena dentro de la sesión y no del visitante', () => {
    // Con `min(occurred_at)` por visitante sobre la ventana entera, dos intentos
    // de compra se pisan: quien paga, vuelve y reabre el checkout termina con su
    // primer `checkout_opened` posterior a su primer `payment_submitted`, la
    // condición de orden falla y desaparece del embudo. Con datos reales eso
    // reportaba 0 en `payment_submitted` habiendo dos pagos registrados.
    expect(activeTimeMigration).toContain('lag(idx) over (partition by session_id order by idx)')
    expect(activeTimeMigration).toContain('lag(at) over (partition by session_id order by idx)')
    // El conteo sigue siendo de personas, no de sesiones.
    expect(activeTimeMigration).toContain('count(distinct visitor_id) as visitors')
  })

  it('devuelve todos los pasos aunque nadie los haya alcanzado', () => {
    // Sin el left join, un paso sin visitantes desaparecía de la respuesta y el
    // panel dibujaba un embudo con menos escalones de los que tiene.
    expect(activeTimeMigration).toContain('left join reached on reached.idx = steps.idx')
    expect(activeTimeMigration).toContain('coalesce(reached.visitors, 0)')
  })
})

describe('tiempo activo y engagement', () => {
  it('el tracker cuenta sólo el tramo con la pestaña visible', () => {
    // El punto entero: `duration_seconds` es reloj de pared y contaba igual una
    // pestaña olvidada en segundo plano que una lectura real.
    expect(tracker).toContain('function settleActiveTime()')
    expect(tracker).toContain('function resumeActiveTime()')
    expect(tracker).toContain("document.visibilityState !== 'hidden'")
    expect(tracker).toContain('activeMs: Math.round(activeMs)')
  })

  it('el tiempo de lectura viaja aunque no haya un solo evento', () => {
    // Alguien que lee sin tocar nada produce atención y cero interacción. Sin el
    // latido, esa lectura no se registra en ningún lado.
    expect(tracker).toContain('ACTIVE_HEARTBEAT_MS')
    expect(tracker).toContain('state.pendingActiveMs >= ACTIVE_HEARTBEAT_MS')
    expect(route).toContain('activeMs: z.coerce.number().int().min(0).max(900_000).optional()')
    // El endpoint tiene que aceptar el lote sin eventos, pero no uno vacío del
    // todo: eso abriría sesiones de la nada.
    expect(route).toContain('body.events.length > 0 || (body.context?.activeMs ?? 0) > 0')
  })

  it('los cortes de engagement son columnas generadas, no lógica de la ingesta', () => {
    // Calcularlos en la aplicación permitiría que una sesión quede marcada con
    // un criterio y otra con otro.
    expect(activeTimeMigration).toContain('generated always as (')
    expect(activeTimeMigration).toContain(
      'active_seconds >= 10 or page_count >= 2 or conversion_count >= 1',
    )
    expect(activeTimeMigration).toContain(
      'generated always as (page_count >= 2 or conversion_count >= 1) stored',
    )
  })

  it('el tiempo activo nunca supera al reloj de pared', () => {
    // Un cliente con la hora corrida mostraría "3 minutos de atención" en una
    // sesión de 40 segundos.
    expect(activeTimeMigration).toContain(
      'active_seconds = least(active_seconds + v_active_seconds, v_duration)',
    )
  })

  it('el rebote se calcula sobre engagement y no sobre el contador de eventos', () => {
    // La condición vieja (`page_count <= 1 and event_count <= 1`) daba 8% de
    // rebote porque el tracker emite scroll y clicks por su cuenta.
    expect(activeTimeMigration).toContain(
      'count(*) filter (where not is_engaged)::numeric / count(*)',
    )
    expect(activeTimeMigration).toContain("'engagementRate'")
    expect(activeTimeMigration).toContain("'avgActiveSeconds'")
    // La lectura sin término temporal es la única comparable contra lo
    // registrado antes de que existiera `active_seconds`.
    expect(activeTimeMigration).toContain("'qualitySessions'")
  })

  it('la consolidación diaria arrastra las métricas nuevas', () => {
    // Sin esto, la serie histórica sobrevive a la purga de 90 días con las
    // métricas viejas y pierde las nuevas justo donde más sirven.
    expect(activeTimeMigration).toContain('avg_active_seconds')
    expect(activeTimeMigration).toContain('engaged_sessions')
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
