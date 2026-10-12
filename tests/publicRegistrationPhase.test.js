import { describe, expect, it } from 'vitest'
import {
  getPublicRegistrationPresentation,
  PUBLIC_REGISTRATION_PHASE,
  resolvePublicRegistrationPhase,
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
