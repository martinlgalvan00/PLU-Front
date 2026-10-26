import { describe, expect, it } from 'vitest'
import { eventSiteState } from '../src/lib/eventPublicSurface.js'

describe('eventSiteState', () => {
  it('sin publicar está oculto, aunque la landing esté encendida', () => {
    expect(eventSiteState({ published: false, landing: { publicVisible: true } })).toBe('hidden')
    expect(eventSiteState({})).toBe('hidden')
  })

  it('publicado con la landing apagada muestra el cartel de construcción', () => {
    expect(eventSiteState({ published: true, landing: { publicVisible: false } })).toBe(
      'construction',
    )
  })

  it('publicado sin landing configurada muestra la página completa', () => {
    expect(eventSiteState({ published: true })).toBe('live')
    expect(eventSiteState({ published: true, landing: { publicVisible: true } })).toBe('live')
  })
})
