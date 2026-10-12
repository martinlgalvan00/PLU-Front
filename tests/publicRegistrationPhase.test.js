import { describe, expect, it } from 'vitest'
import {
  getPublicEventStatus,
  getPublicRegistrationPresentation,
  PUBLIC_REGISTRATION_PHASE,
  resolvePublicRegistrationPhase,
  withPublicEventStatus,
} from '../src/lib/publicRegistrationPhase.js'

const NOW = new Date('2026-06-15T12:00:00.000Z')

function t(key) {
  const map = {
    'pages.pitbull.badgeComingSoon': 'Próximamente',
    'pages.pitbull.badgeClosed': 'Inscripción cerrada',
    'pages.pitbull.ctaComingSoon': 'Próximamente',
    'pages.pitbull.ctaClosed': 'Inscripción cerrada',
    'pages.home.viewResults': 'Ver resultados',
    'status.inscripcion_abierta': 'Inscripción abierta',
    'status.cupos_limitados': 'Cupos limitados',
    'status.agotado': 'Cupo lleno',
    'status.finalizado': 'Finalizado',
  }
  return map[key] ?? key
}

describe('resolvePublicRegistrationPhase', () => {
  it('abre cuando el status permite altas, la ventana rige y los cobros están on', () => {
    const resolved = resolvePublicRegistrationPhase(
      {
        status: 'inscripcion_abierta',
        registrationOpensAt: '2026-01-01T00:00:00.000Z',
        registrationClosesAt: '2026-12-01T00:00:00.000Z',
      },
      { checkoutEnabled: true, now: NOW },
    )
    expect(resolved.phase).toBe(PUBLIC_REGISTRATION_PHASE.open)
    expect(resolved.canRegister).toBe(true)
    expect(resolved.softLaunch).toBe(false)
  })

  it('cierra por status aunque la ventana todavía no venció', () => {
    const resolved = resolvePublicRegistrationPhase(
      {
        status: 'cerrado',
        registrationClosesAt: '2026-12-01T00:00:00.000Z',
      },
      { checkoutEnabled: true, now: NOW },
    )
    expect(resolved.phase).toBe(PUBLIC_REGISTRATION_PHASE.closed)
    expect(resolved.canRegister).toBe(false)
    expect(resolved.closedByWindow).toBe(false)
  })

  it('cierra por ventana aunque el status siga abierto', () => {
    const resolved = resolvePublicRegistrationPhase(
      {
        status: 'inscripcion_abierta',
        registrationClosesAt: '2026-06-01T00:00:00.000Z',
      },
      { checkoutEnabled: true, now: NOW },
    )
    expect(resolved.phase).toBe(PUBLIC_REGISTRATION_PHASE.closed)
    expect(resolved.closedByWindow).toBe(true)
    expect(resolved.canRegister).toBe(false)
  })

  it('marca soft-launch si los cobros están apagados', () => {
    const resolved = resolvePublicRegistrationPhase(
      { status: 'inscripcion_abierta' },
      { checkoutEnabled: false, now: NOW },
    )
    expect(resolved.phase).toBe(PUBLIC_REGISTRATION_PHASE.coming_soon)
    expect(resolved.softLaunch).toBe(true)
    expect(resolved.canRegister).toBe(false)
  })

  it('marca soft-launch si todavía no llegó registrationOpensAt', () => {
    const resolved = resolvePublicRegistrationPhase(
      {
        status: 'inscripcion_abierta',
        registrationOpensAt: '2026-09-01T00:00:00.000Z',
      },
      { checkoutEnabled: true, now: NOW },
    )
    expect(resolved.phase).toBe(PUBLIC_REGISTRATION_PHASE.coming_soon)
    expect(resolved.scheduled).toBe(true)
  })

  it('respeta proximamente, agotado y finalizado', () => {
    expect(
      resolvePublicRegistrationPhase({ status: 'proximamente' }, { now: NOW }).phase,
    ).toBe(PUBLIC_REGISTRATION_PHASE.coming_soon)
    expect(resolvePublicRegistrationPhase({ status: 'agotado' }, { now: NOW }).phase).toBe(
      PUBLIC_REGISTRATION_PHASE.full,
    )
    expect(resolvePublicRegistrationPhase({ status: 'finalizado' }, { now: NOW }).phase).toBe(
      PUBLIC_REGISTRATION_PHASE.finished,
    )
  })

  it('cupos_limitados con ventana vigente cuenta como abierto', () => {
    const resolved = resolvePublicRegistrationPhase(
      { status: 'cupos_limitados' },
      { checkoutEnabled: true, now: NOW },
    )
    expect(resolved.phase).toBe(PUBLIC_REGISTRATION_PHASE.open)
  })
})

describe('getPublicRegistrationPresentation', () => {
  it('presenta cerrado con badge y CTA de inscripción cerrada', () => {
    const presentation = getPublicRegistrationPresentation(
      { phase: PUBLIC_REGISTRATION_PHASE.closed, status: 'cerrado' },
      t,
    )
    expect(presentation.badgeLabel).toBe('Inscripción cerrada')
    expect(presentation.badgeTone).toBe('danger')
    expect(presentation.primaryCtaLabel).toBe('Inscripción cerrada')
    expect(presentation.primaryDisabled).toBe(true)
    expect(presentation.showJoinSecondary).toBe(true)
    expect(presentation.showRegistrationFee).toBe(false)
  })

  it('en abierto reusa el label del status y permite fee', () => {
    const presentation = getPublicRegistrationPresentation(
      { phase: PUBLIC_REGISTRATION_PHASE.open, status: 'inscripcion_abierta' },
      t,
    )
    expect(presentation.badgeLabel).toBe('Inscripción abierta')
    expect(presentation.badgeTone).toBe('success')
    expect(presentation.primaryDisabled).toBe(false)
    expect(presentation.showRegistrationFee).toBe(true)
  })

  it('en cupo lleno deshabilita el CTA primario y ofrece afiliar', () => {
    const presentation = getPublicRegistrationPresentation(
      { phase: PUBLIC_REGISTRATION_PHASE.full, status: 'agotado' },
      t,
    )
    expect(presentation.badgeLabel).toBe('Cupo lleno')
    expect(presentation.primaryCtaLabel).toBe('Inscripción cerrada')
    expect(presentation.primaryDisabled).toBe(true)
    expect(presentation.showJoinSecondary).toBe(true)
  })
})

describe('estado público del evento', () => {
  const now = new Date('2026-11-01T12:00:00-03:00')

  it('una ventana de cierre vencida cuenta como cerrada aunque el estado guardado diga abierta', () => {
    const event = {
      status: 'inscripcion_abierta',
      registrationClosesAt: '2026-10-31T23:59:00-03:00',
    }
    expect(getPublicEventStatus(event, now)).toBe('cerrado')
    expect(getPublicEventStatus({ ...event, status: 'cupos_limitados' }, now)).toBe('cerrado')
    expect(withPublicEventStatus(event, now).status).toBe('cerrado')
  })

  it('con la ventana vigente, sin ventana o en otros estados no cambia nada', () => {
    const open = { status: 'inscripcion_abierta', registrationClosesAt: '2026-11-30T23:59:00-03:00' }
    expect(getPublicEventStatus(open, now)).toBe('inscripcion_abierta')
    expect(getPublicEventStatus({ status: 'inscripcion_abierta' }, now)).toBe('inscripcion_abierta')
    expect(getPublicEventStatus({ status: 'finalizado', registrationClosesAt: '2020-01-01' }, now)).toBe('finalizado')
    expect(getPublicEventStatus({ status: 'proximamente', registrationClosesAt: '2020-01-01' }, now)).toBe('proximamente')
    expect(getPublicEventStatus(null, now)).toBe('proximamente')
  })

  it('devuelve el mismo objeto cuando el estado no cambia', () => {
    const event = { status: 'cerrado' }
    expect(withPublicEventStatus(event, now)).toBe(event)
  })
})

describe('"Inscripciones en breve" lo decide el evento, no el entorno', () => {
  const now = new Date('2026-09-01T12:00:00-03:00')

  it('Próximamente es soft-launch aunque los cobros estén habilitados', () => {
    const phase = resolvePublicRegistrationPhase({ status: 'proximamente' }, { checkoutEnabled: true, now })
    expect(phase.softLaunch).toBe(true)
    expect(phase.canRegister).toBe(false)
  })

  it('abierta con una apertura futura se anuncia y abre sola cuando llega la fecha', () => {
    const event = { status: 'inscripcion_abierta', registrationOpensAt: '2026-09-10T10:00:00-03:00' }
    expect(resolvePublicRegistrationPhase(event, { now }).softLaunch).toBe(true)
    const after = new Date('2026-09-10T10:00:01-03:00')
    const opened = resolvePublicRegistrationPhase(event, { now: after })
    expect(opened.softLaunch).toBe(false)
    expect(opened.canRegister).toBe(true)
  })

  it('el interruptor de cobros del panel apagado también la anuncia', () => {
    const event = { status: 'inscripcion_abierta' }
    expect(resolvePublicRegistrationPhase(event, { checkoutEnabled: false, now }).softLaunch).toBe(true)
  })

  it('cerrada o finalizada no es soft-launch', () => {
    expect(resolvePublicRegistrationPhase({ status: 'cerrado' }, { now }).softLaunch).toBe(false)
    expect(resolvePublicRegistrationPhase({ status: 'finalizado' }, { now }).softLaunch).toBe(false)
  })
})

describe('apertura programada en el estado público', () => {
  const now = new Date('2026-11-01T12:00:00-03:00')

  it('abierta con la apertura por delante se ve como próximamente y abre sola', () => {
    const event = { status: 'inscripcion_abierta', registrationOpensAt: '2026-11-10T10:00:00-03:00' }
    expect(getPublicEventStatus(event, now)).toBe('proximamente')
    expect(withPublicEventStatus(event, now).storedStatus).toBe('inscripcion_abierta')
    expect(getPublicEventStatus(event, new Date('2026-11-10T10:00:01-03:00'))).toBe(
      'inscripcion_abierta',
    )
  })
})

