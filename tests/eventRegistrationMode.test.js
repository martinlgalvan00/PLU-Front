import { describe, expect, it } from 'vitest'
import {
  applyRegistrationModeToDraft,
  registrationModeOfDraft,
} from '../src/lib/eventRegistrationMode.js'

const NOW = new Date('2026-11-01T12:00:00')

describe('modo de inscripción del borrador', () => {
  it('lee el modo desde estado + ventana', () => {
    expect(registrationModeOfDraft({ status: 'proximamente' }, NOW)).toBe('soon')
    expect(registrationModeOfDraft({ status: 'inscripcion_abierta' }, NOW)).toBe('open')
    expect(
      registrationModeOfDraft({ status: 'inscripcion_abierta', registrationOpensAt: '2026-11-05T10:00' }, NOW),
    ).toBe('scheduled')
    expect(registrationModeOfDraft({ status: 'cupos_limitados' }, NOW)).toBe('open')
    expect(registrationModeOfDraft({ status: 'agotado' }, NOW)).toBe('open')
    expect(registrationModeOfDraft({ status: 'cerrado' }, NOW)).toBe('closed')
    expect(registrationModeOfDraft({ status: 'finalizado' }, NOW)).toBe('ended')
  })

  it('cada modo escrito se lee de vuelta igual', () => {
    const base = { status: 'proximamente', registrationOpensAt: '' }
    for (const mode of ['soon', 'open', 'closed', 'ended']) {
      expect(registrationModeOfDraft(applyRegistrationModeToDraft(base, mode, NOW), NOW)).toBe(mode)
    }
    const scheduled = {
      ...applyRegistrationModeToDraft(base, 'scheduled', NOW),
      registrationOpensAt: '2026-11-05T10:00',
    }
    expect(registrationModeOfDraft(scheduled, NOW)).toBe('scheduled')
  })

  it('abrir ya borra una apertura futura y conserva una pasada', () => {
    expect(
      applyRegistrationModeToDraft({ registrationOpensAt: '2026-11-05T10:00' }, 'open', NOW)
        .registrationOpensAt,
    ).toBe('')
    expect(
      applyRegistrationModeToDraft({ registrationOpensAt: '2026-10-05T10:00' }, 'open', NOW)
        .registrationOpensAt,
    ).toBe('2026-10-05T10:00')
  })
})
