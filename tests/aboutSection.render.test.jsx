import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import AboutSection from '../src/components/ui/AboutSection.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import { ABOUT_PILLARS } from '../src/lib/content/es.js'

function mockMatchMedia(matchesQuery) {
  window.matchMedia = (query) => ({
    matches: matchesQuery(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

beforeAll(() => {
  mockMatchMedia(() => false)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
})

afterEach(cleanup)

function renderAbout(onNavigate) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <AboutSection onNavigate={onNavigate} />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('AboutSection — manifiesto de pilares', () => {
  it('muestra título, placas con copy confirmado y la primera como protagonista', () => {
    const { container } = renderAbout()

    expect(
      screen.getByRole('heading', { level: 2, name: /Un estándar para afiliar, competir/i }),
    ).toBeTruthy()
    expect(container.querySelectorAll('.about-section__plate-item')).toHaveLength(3)
    expect(container.querySelector('.about-section__plate-item--lead')?.textContent).toContain(
      'Estándar PLU',
    )

    for (const pillar of ABOUT_PILLARS) {
      expect(screen.getByRole('heading', { level: 3, name: pillar.title })).toBeTruthy()
      expect(screen.getByText(pillar.text)).toBeTruthy()
    }

    expect(['js', 'css']).toContain(container.querySelector('.about-section')?.dataset.theater)
  })

  it('apaga el teatro con reduced motion y conserva el CTA', () => {
    mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))
    const onNavigate = vi.fn()
    const { container } = renderAbout(onNavigate)

    expect(container.querySelector('.about-section')?.dataset.theater).toBe('off')
    expect(container.querySelector('.about-section--theater')).toBeNull()
    expect(screen.getByRole('button', { name: 'Conocer nuestra comunidad' })).toBeTruthy()
    mockMatchMedia(() => false)
  })
})
