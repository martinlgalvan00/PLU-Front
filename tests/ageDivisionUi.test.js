import { describe, expect, it } from 'vitest'
import { buildAgeDivisionSelectState } from '../shared/ageDivisionUi.js'

describe('buildAgeDivisionSelectState', () => {
  const day = '2026-10-19'
  const all = ['Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters']

  it('auto-completa vacío con la franja natural', () => {
    const state = buildAgeDivisionSelectState({
      birthDate: '2005-06-01',
      eventDate: day,
      allDivisions: all,
      currentDivision: '',
    })
    expect(state.suggested).toBe('Junior')
    expect(state.value).toBe('Junior')
    expect(state.changed).toBe(true)
    expect(state.options).toEqual(['Junior', 'Open'])
    expect(state.hasAgeRule).toBe(true)
  })

  it('respeta Open cuando está permitido', () => {
    const state = buildAgeDivisionSelectState({
      birthDate: '2005-06-01',
      eventDate: day,
      allDivisions: all,
      currentDivision: 'Open',
    })
    expect(state.value).toBe('Open')
    expect(state.changed).toBe(false)
  })

  it('clampa una división inválida', () => {
    const state = buildAgeDivisionSelectState({
      birthDate: '2005-06-01',
      eventDate: day,
      allDivisions: all,
      currentDivision: 'Masters',
    })
    expect(state.value).toBe('Junior')
    expect(state.changed).toBe(true)
  })

  it('sin DOB deja el catálogo completo', () => {
    const state = buildAgeDivisionSelectState({
      birthDate: '',
      allDivisions: all,
      currentDivision: 'Open',
    })
    expect(state.options).toEqual(all)
    expect(state.hasAgeRule).toBe(false)
    expect(state.value).toBe('Open')
    expect(state.changed).toBe(false)
  })
})
