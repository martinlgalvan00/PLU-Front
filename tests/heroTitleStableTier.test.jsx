import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El título de la portada entra con un wipe de `clip-path` en desktop y con
 * fade en touch o tier 'low'. El tier se mide en vivo y puede bajar con la
 * entrada ya terminada: antes la variante se recalculaba, Motion dejaba de
 * animar `clipPath` y el H1 quedaba en `inset(100%)`, invisible. Este test
 * baja el tier después de la entrada y exige que el título siga descubierto.
 */

let reportTier = null

vi.mock('../src/motion/deviceTier', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getDeviceTier: () => 'high',
    observeRuntimeMotionTier: (callback) => {
      reportTier = callback
      return () => {
        reportTier = null
      }
    },
  }
})

vi.mock('../src/motion/useReducedMotion.ts', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, hasFinePointer: () => true }
})

const { default: MotionProvider } = await import('../src/motion/MotionProvider.tsx')
const { default: HeroSection } = await import('../src/components/layout/HeroSection.jsx')
const { I18nProvider } = await import('../src/i18n/I18nProvider.jsx')

afterEach(cleanup)

function titleClips(container) {
  return [...container.querySelectorAll('.hero__title-line')].map((line) => line.style.clipPath)
}

describe('HeroSection con el tier cambiando en vivo', () => {
  it('bajar a "low" después de la entrada no vuelve a ocultar el título', async () => {
    const { container } = render(
      <I18nProvider>
        <MotionProvider>
          <HeroSection onNavigate={() => {}} onSelectEvent={() => {}} />
        </MotionProvider>
      </I18nProvider>,
    )

    // La entrada dura 0.7s más la cascada; se deja terminar.
    await act(() => new Promise((resolve) => setTimeout(resolve, 1400)))
    const settled = titleClips(container)
    expect(settled.length).toBeGreaterThan(0)
    for (const clip of settled) expect(clip).not.toMatch(/^inset\(100%/)

    act(() => reportTier?.('low'))
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)))

    expect(document.documentElement.getAttribute('data-motion-tier')).toBe('low')
    for (const clip of titleClips(container)) expect(clip).not.toMatch(/^inset\(100%/)
  })
})
