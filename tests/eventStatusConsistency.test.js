import { describe, expect, it } from 'vitest'
import { resolveAthleteEventStatus } from '../src/lib/athleteEventStatus.js'
import { isTicketSalesEnabled } from '../src/lib/eventPricing.js'
import {
  getPublicEventStatus,
  resolvePublicRegistrationPhase,
  withPublicEventStatus,
} from '../src/lib/publicRegistrationPhase.js'
import { isRegistrationOpen } from '../src/lib/status.js'
import { getEventRegistrationAvailability } from '../src/services/eventAdminService.js'
import { nextScheduleBoundary } from '../src/hooks/useScheduleClock.js'

/**
 * Una sola verdad para "¿se puede inscribir?": el resolvedor público, la
 * etiqueta que ven las tarjetas, lo que le dice la cuenta al atleta y lo que
 * muestra el panel tienen que coincidir en TODA combinación de estado y
 * ventana. Si alguien vuelve a escribir su propia regla en una pantalla, este
 * cruce es lo que lo detecta.
 */

const NOW = new Date('2026-11-01T12:00:00-03:00')
const STATUSES = [
  'proximamente',
  'inscripcion_abierta',
  'cupos_limitados',
  'agotado',
  'cerrado',
  'finalizado',
]
const WINDOWS = {
  sinVentana: {},
  aperturaFutura: { registrationOpensAt: '2026-11-10T10:00:00-03:00' },
  aperturaPasada: { registrationOpensAt: '2026-10-01T10:00:00-03:00' },
  cierreVencido: { registrationClosesAt: '2026-10-31T23:59:00-03:00' },
  cierreFuturo: { registrationClosesAt: '2026-11-20T23:59:00-03:00' },
}
const SESSION = { role: 'athlete_plu', athleteId: 'a1' }
const MEMBERSHIPS = [{ athleteId: 'a1', status: 'activa', endsAt: '2027-12-31' }]

function eventWith(status, windowFields) {
  return {
    slug: 'meet',
    title: 'Meet',
    status,
    published: true,
    slots: 100,
    registered: 10,
    requiresMembership: false,
    pricing: { ticketsEnabled: true },
    ...windowFields,
  }
}

describe('estado de inscripción: todas las superficies coinciden', () => {
  for (const registrationEnabled of [true, false]) {
    for (const status of STATUSES) {
      for (const [windowName, windowFields] of Object.entries(WINDOWS)) {
        const interruptor = registrationEnabled ? 'cobros activos' : 'cobros pausados'
        it(`${status} · ${windowName} · ${interruptor}`, () => {
          const raw = eventWith(status, windowFields)
          const options = { registrationEnabled }
          const mapped = withPublicEventStatus(raw, NOW, options)
          const phase = resolvePublicRegistrationPhase(mapped, {
            checkoutEnabled: registrationEnabled,
            now: NOW,
          })

          // La fase no cambia por resolver el estado antes (App lo hace una vez).
          expect(phase.phase).toBe(
            resolvePublicRegistrationPhase(raw, { checkoutEnabled: registrationEnabled, now: NOW })
              .phase,
          )
          // Lo que dice la etiqueta/CTA = lo que permite la fase.
          expect(isRegistrationOpen(getPublicEventStatus(raw, NOW, options))).toBe(phase.canRegister)
          // La cuenta del atleta ofrece inscribirse solo si la fase lo permite.
          const athlete = resolveAthleteEventStatus({
            event: mapped,
            session: SESSION,
            registrations: [],
            memberships: MEMBERSHIPS,
          })
          expect(athlete === 'can_register').toBe(phase.canRegister)
          // El panel anuncia "en vivo" cuando el público puede inscribirse.
          if (registrationEnabled) {
            expect(getEventRegistrationAvailability(raw, NOW).isLive).toBe(phase.canRegister)
          } else {
            expect(phase.canRegister).toBe(false)
          }
        })
      }
    }
  }
})

describe('cobros de inscripción pausados', () => {
  it('un evento abierto se ve como próximamente en todas partes, igual que en su página', () => {
    const raw = eventWith('inscripcion_abierta', {})
    expect(getPublicEventStatus(raw, NOW, { registrationEnabled: false })).toBe('proximamente')
    expect(getPublicEventStatus(raw, NOW, { registrationEnabled: true })).toBe('inscripcion_abierta')
  })

  it('no pausa las entradas: el estado guardado sigue siendo el que manda', () => {
    const mapped = withPublicEventStatus(eventWith('inscripcion_abierta', {}), NOW, {
      registrationEnabled: false,
    })
    expect(mapped.status).toBe('proximamente')
    expect(mapped.storedStatus).toBe('inscripcion_abierta')
    expect(isTicketSalesEnabled(mapped)).toBe(true)
  })

  it('cerrado y finalizado conservan su estado aunque los cobros estén pausados', () => {
    for (const status of ['cerrado', 'finalizado', 'agotado']) {
      expect(
        getPublicEventStatus(eventWith(status, {}), NOW, { registrationEnabled: false }),
      ).toBe(status)
    }
  })
})

describe('entradas: cortan por el estado guardado, no por la ventana de atletas', () => {
  it('con la ventana de inscripción vencida las entradas siguen a la venta', () => {
    const raw = eventWith('inscripcion_abierta', WINDOWS.cierreVencido)
    const mapped = withPublicEventStatus(raw, NOW)
    expect(mapped.status).toBe('cerrado')
    expect(isTicketSalesEnabled(mapped)).toBe(true)
  })

  it('con el estado guardado cerrado o finalizado no se venden', () => {
    expect(isTicketSalesEnabled(withPublicEventStatus(eventWith('cerrado', {}), NOW))).toBe(false)
    expect(isTicketSalesEnabled(withPublicEventStatus(eventWith('finalizado', {}), NOW))).toBe(false)
  })
})

describe('reloj de ventanas', () => {
  it('apunta a la próxima frontera futura, abra o cierre', () => {
    const events = [
      { registrationOpensAt: '2026-11-10T10:00:00-03:00', registrationClosesAt: '2026-11-20T10:00:00-03:00' },
      { registrationClosesAt: '2026-11-05T10:00:00-03:00' },
      { registrationOpensAt: '2026-10-01T10:00:00-03:00' },
    ]
    expect(nextScheduleBoundary(events, NOW.getTime())).toBe(
      new Date('2026-11-05T10:00:00-03:00').getTime(),
    )
  })

  it('sin ventanas por delante no agenda nada', () => {
    expect(nextScheduleBoundary([{ status: 'cerrado' }, {}], NOW.getTime())).toBeNull()
    expect(nextScheduleBoundary([], NOW.getTime())).toBeNull()
  })
})
