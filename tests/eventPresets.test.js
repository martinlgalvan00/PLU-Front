import { describe, expect, it } from 'vitest'
import { applyEventPreset, describeEventPreset, EVENT_PRESET_IDS } from '../src/lib/eventPresets.js'
import { emptyEventLanding, normalizeEventLanding } from '../src/lib/eventLanding.js'
import { createAdminEventDraft } from '../src/services/eventAdminService.js'

function baseDraft(overrides = {}) {
  return {
    ...createAdminEventDraft(),
    title: 'Copa Otoño',
    venue: 'Club Central',
    location: 'Rosario',
    slots: 80,
    ...overrides,
  }
}

describe('presets de evento', () => {
  it('expone los cuatro presets definidos', () => {
    expect(EVENT_PRESET_IDS).toEqual(['blank', 'meet', 'seminar', 'invitational'])
  })

  it('blank no cambia nada', () => {
    const draft = baseDraft({ requiresMembership: false, salesIntent: 'announce' })
    expect(applyEventPreset(draft, 'blank')).toEqual(draft)
  })

  it.each([
    ['meet', true, 'meet', 'charge'],
    ['seminar', false, 'editorial', 'charge'],
    ['invitational', true, 'submission', 'announce'],
  ])('%s fija acceso, plantilla y venta', (id, requiresMembership, templateId, salesIntent) => {
    const next = applyEventPreset(baseDraft({ requiresMembership: !requiresMembership }), id)
    expect(next.requiresMembership).toBe(requiresMembership)
    expect(next.landing.templateId).toBe(templateId)
    expect(next.salesIntent).toBe(salesIntent)
  })

  it('no toca título, sede, cupo, precios ni medios de cobro', () => {
    const draft = baseDraft({
      paymentChannelOverrides: { registration: ['bank_transfer'] },
      bankTransferProfileId: 'bank-1',
      mercadoPagoProfileId: 'mp-1',
    })
    for (const id of EVENT_PRESET_IDS) {
      const next = applyEventPreset(draft, id)
      const { landing: _l, requiresMembership: _r, salesIntent: _s, ...rest } = next
      const { landing: _l0, requiresMembership: _r0, salesIntent: _s0, ...rest0 } = draft
      expect(rest).toEqual(rest0)
    }
  })

  it('no muta el draft original', () => {
    const draft = baseDraft()
    const snapshot = structuredClone(draft)
    const next = applyEventPreset(draft, 'invitational')
    expect(next).not.toBe(draft)
    expect(draft).toEqual(snapshot)
  })

  it('conserva slots, tema y layout de la landing al cambiar la plantilla', () => {
    const landing = {
      ...emptyEventLanding('meet', 'ember'),
      slots: { ...emptyEventLanding('meet').slots, heroTitle: 'Título propio' },
      layout: { blocks: [], palette: { accent: '#112233' } },
    }
    const normalized = normalizeEventLanding(landing)
    const next = applyEventPreset(baseDraft({ landing }), 'seminar')
    expect(next.landing.templateId).toBe('editorial')
    expect(next.landing.themeId).toBe('ember')
    expect(next.landing.slots.heroTitle).toBe('Título propio')
    expect(next.landing.layout).toEqual(normalized.layout)
  })

  it('un id desconocido devuelve el draft igual', () => {
    const draft = baseDraft()
    expect(applyEventPreset(draft, 'nope')).toBe(draft)
    expect(applyEventPreset(draft, undefined)).toBe(draft)
    expect(applyEventPreset(draft, 'toString')).toBe(draft)
  })

  it('describe lo que fija cada preset', () => {
    expect(describeEventPreset('blank')).toEqual([])
    expect(describeEventPreset('nope')).toEqual([])
    expect(describeEventPreset('meet')).toEqual([
      { key: 'access', value: 'members' },
      { key: 'landing', value: 'meet' },
      { key: 'sales', value: 'charge' },
    ])
    expect(describeEventPreset('seminar')).toEqual([
      { key: 'access', value: 'open' },
      { key: 'landing', value: 'editorial' },
      { key: 'sales', value: 'charge' },
    ])
    expect(describeEventPreset('invitational')).toEqual([
      { key: 'access', value: 'members' },
      { key: 'landing', value: 'submission' },
      { key: 'sales', value: 'announce' },
    ])
  })
})
