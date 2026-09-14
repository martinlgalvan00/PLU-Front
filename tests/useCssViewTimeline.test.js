import { afterEach, describe, expect, it, vi } from 'vitest'
import { supportsCssViewTimeline } from '../src/motion/useCssViewTimeline.ts'

describe('supportsCssViewTimeline', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('es false si CSS.supports no existe', () => {
    vi.stubGlobal('CSS', undefined)
    expect(supportsCssViewTimeline()).toBe(false)
  })

  it('usa el soporte nativo de animation-timeline: view()', () => {
    vi.stubGlobal('CSS', {
      supports: (property, value) =>
        property === 'animation-timeline: view()' ||
        (property === 'animation-timeline' && value === 'view()'),
    })
    expect(supportsCssViewTimeline()).toBe(true)
  })

  it('es false cuando el browser no declara view timelines', () => {
    vi.stubGlobal('CSS', { supports: () => false })
    expect(supportsCssViewTimeline()).toBe(false)
  })
})
