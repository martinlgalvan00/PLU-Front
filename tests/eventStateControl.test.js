import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EVENT_STATUS } from '../src/lib/events.js'
import { getMapMarkerKind } from '../src/lib/eventMap.js'
import { getStatusMeta, isRegistrationOpen } from '../src/lib/status.js'
import {
  ADMIN_EVENT_STATUS_OPTIONS,
  EVENT_QUICK_STATUS_VALUES,
  isEventFull,
} from '../src/services/eventAdminService.js'

/**
 * Control de estado del evento y cupo lleno automático
 * (migración 20260807140000).
 *
 * Las verificaciones sobre el SQL son de texto, como el resto de los tests de
 * migración del repo; el comportamiento se valida ejecutando la migración
 * contra Postgres.
 */

vi.mock('../src/lib/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const { apiPost } = await import('../src/lib/api.js')
const { setEventStateRequest } = await import('../src/services/eventAdminService.js')

afterEach(() => {
  vi.resetAllMocks()
})

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260807140000_event_state_control.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

const SUPABASE_EVENT_ROW = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  venue: 'La Troupe',
  location: 'Banfield',
  starts_at: '2026-11-14T12:00:00.000Z',
  ends_at: '2026-11-15T22:00:00.000Z',
  capacity: 80,
  status: 'agotado',
  published: true,
  rules: {},
  eventRegistrations: Array.from({ length: 80 }, () => ({ status: 'confirmada' })),
}

describe('vocabulario del estado agotado', () => {
  it('tiene etiqueta y tono en las tres tablas de estado', () => {
    expect(EVENT_STATUS.agotado).toBeDefined()
    expect(EVENT_STATUS.agotado.tone).toBe('danger')
    expect(getStatusMeta('agotado').label).toBe('Cupo lleno')
    expect(getStatusMeta('agotado').tone).toBe('danger')
  })

  // Es la garantía que evita el bug que este estado viene a cerrar: un evento
  // lleno no puede seguir invitando a inscribirse desde el sitio público.
  it('no habilita la inscripción', () => {
    expect(isRegistrationOpen('agotado')).toBe(false)
    expect(isRegistrationOpen('inscripcion_abierta')).toBe(true)
    expect(isRegistrationOpen('cupos_limitados')).toBe(true)
  })

  it('se lee como cerrado en el mapa de competencias', () => {
    expect(getMapMarkerKind({ status: 'agotado' })).toBe('closed')
  })

  it('es filtrable en el panel pero no elegible a mano', () => {
    expect(ADMIN_EVENT_STATUS_OPTIONS.map(([value]) => value)).toContain('agotado')
    expect(EVENT_QUICK_STATUS_VALUES).not.toContain('agotado')
  })
})

describe('isEventFull', () => {
  it('marca lleno al llegar al cupo', () => {
    expect(isEventFull({ slots: 80, registered: 80 })).toBe(true)
    expect(isEventFull({ slots: 80, registered: 81 })).toBe(true)
    expect(isEventFull({ slots: 80, registered: 79 })).toBe(false)
  })

  // Un evento sin tope no se llena nunca: la base tampoco lo sincroniza.
  it('no marca lleno un evento sin cupo definido', () => {
    expect(isEventFull({ slots: 0, registered: 40 })).toBe(false)
    expect(isEventFull({ registered: 40 })).toBe(false)
  })
})

describe('setEventStateRequest', () => {
  it('manda solo los campos presentes y mapea la respuesta', async () => {
    apiPost.mockResolvedValue({
      event: SUPABASE_EVENT_ROW,
      events: [SUPABASE_EVENT_ROW],
      statusOverridden: true,
    })

    const result = await setEventStateRequest('pitbull-classic-2026', { published: false })

    expect(apiPost).toHaveBeenCalledWith('/api/events/pitbull-classic-2026/state', {
      published: false,
    })
    expect(result.event.status).toBe('agotado')
    expect(result.event.registered).toBe(80)
    expect(result.statusOverridden).toBe(true)
  })

  it('no manda published cuando solo cambia el estado', async () => {
    apiPost.mockResolvedValue({ event: SUPABASE_EVENT_ROW, events: [SUPABASE_EVENT_ROW] })

    const result = await setEventStateRequest('pitbull-classic-2026', { status: 'cerrado' })

    expect(apiPost).toHaveBeenCalledWith('/api/events/pitbull-classic-2026/state', {
      status: 'cerrado',
    })
    // Sin la bandera en la respuesta, el panel no debe anunciar una corrección.
    expect(result.statusOverridden).toBe(false)
  })

  // El requisito de afiliación viaja por el camino quirúrgico desde
  // 20260826100000: por `/upsert` el guardado recrea días, tandas y tipos de
  // entrada, y para apagar un flag eso es un efecto colateral inaceptable en un
  // evento que ya tiene la grilla asignada.
  it('manda requiresMembership sin arrastrar estado ni publicación', async () => {
    apiPost.mockResolvedValue({ event: SUPABASE_EVENT_ROW, events: [SUPABASE_EVENT_ROW] })

    await setEventStateRequest('pitbull-classic-2026', { requiresMembership: false })

    expect(apiPost).toHaveBeenCalledWith('/api/events/pitbull-classic-2026/state', {
      requiresMembership: false,
    })
  })

  it('rechaza sin slug antes de salir a la red', async () => {
    await expect(setEventStateRequest('', { published: true })).rejects.toThrow(/slug/i)
    expect(apiPost).not.toHaveBeenCalled()
  })
})

describe('migración 20260807140000', () => {
  it('agrega agotado al check de estados sin perder los cinco previos', () => {
    expect(migration).toMatch(/add constraint events_status_check/)
    for (const status of [
      'proximamente',
      'inscripcion_abierta',
      'cupos_limitados',
      'agotado',
      'cerrado',
      'finalizado',
    ]) {
      expect(migration).toContain(`'${status}'`)
    }
  })

  // El conteo tiene que ser el mismo que bloquea create_competition_registration_v2:
  // contar distinto marcaría agotado un evento que el RPC todavía acepta.
  it('cuenta el cupo con los mismos estados que bloquean el alta', () => {
    const body = functionBody(migration, 'function plu_private.event_active_registrations')
    expect(body).toContain("r.status in ('pendiente_pago', 'pagada', 'confirmada')")
  })

  it('solo mueve los estados que dependen del cupo', () => {
    const body = functionBody(migration, 'function plu_private.sync_event_capacity_status')
    expect(body).toContain(
      "v_event.status not in ('inscripcion_abierta', 'cupos_limitados', 'agotado')",
    )
    // Sin tope no hay nada que derivar.
    expect(body).toContain('v_event.capacity is null')
    // Se libera un lugar y el evento vuelve a tomar inscripciones.
    expect(body).toMatch(/v_next := 'inscripcion_abierta'/)
  })

  it('sincroniza en alta, baja y cambio de estado de una inscripción', () => {
    expect(migration).toMatch(
      /create trigger event_registrations_capacity_sync\s+after insert or delete or update of status, event_id/,
    )
  })

  // sync_event_capacity_status hace su propio UPDATE sobre events y volvería a
  // entrar en el guard: sin el corte por profundidad es recursión infinita.
  it('corta la recursión del guard de events', () => {
    const body = functionBody(migration, 'function plu_private.event_capacity_status_guard')
    expect(body).toContain('pg_trigger_depth() > 1')
  })

  it('staff_set_event_state deja los dos campos opcionales e independientes', () => {
    const body = functionBody(migration, 'function public.staff_set_event_state')
    expect(body).toContain('status = coalesce(p_status, status)')
    expect(body).toContain('published = coalesce(p_published, published)')
    expect(body).toContain('p_status is null and p_published is null')
  })

  // Devolver el evento pedido en vez del guardado dejaría al panel mostrando
  // "inscripción abierta" sobre un evento que la base acaba de volver a agotar.
  it('staff_set_event_state relee el evento después del trigger', () => {
    const body = functionBody(migration, 'function public.staff_set_event_state')
    const updateAt = body.indexOf('update public.events set')
    const rereadAt = body.indexOf('select * into v_event from public.events where id = v_before.id')
    expect(rereadAt).toBeGreaterThan(updateAt)
    expect(body).toContain(
      "'statusOverridden', p_status is not null and p_status <> v_event.status",
    )
  })

  it('solo el service_role puede cambiar el estado', () => {
    expect(migration).toContain(
      'revoke all on function public.staff_set_event_state(text, text, boolean, text)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.staff_set_event_state(text, text, boolean, text) to service_role;',
    )
  })

  it('pone al día los eventos que ya estaban llenos', () => {
    expect(migration).toMatch(
      /where capacity is not null\s+and status in \('inscripcion_abierta', 'cupos_limitados'\)/,
    )
  })
})

describe('migración 20260807150000', () => {
  const registrationFix = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260807150000_registration_agotado_returns_plu04.sql',
    ),
    'utf8',
  )

  // Sin este mapeo el overflow del cupo llega como PLU03 ("no abierta") porque
  // el trigger ya pasó el evento a `agotado` antes del siguiente alta.
  it('mapea status=agotado a PLU04 antes del gate de inscripción abierta', () => {
    const body = functionBody(registrationFix, 'function public.create_competition_registration_v2')
    const agotadoAt = body.indexOf("v_event.status = 'agotado'")
    const openGateAt = body.indexOf(
      "v_event.status not in ('inscripcion_abierta', 'cupos_limitados')",
    )
    expect(agotadoAt).toBeGreaterThan(-1)
    expect(openGateAt).toBeGreaterThan(agotadoAt)
    expect(body).toMatch(
      /status = 'agotado'[\s\S]*?No quedan cupos para este evento\.[\s\S]*?errcode = 'PLU04'/,
    )
  })
})
