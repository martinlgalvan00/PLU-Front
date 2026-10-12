import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PitbullMeetCountdown from '../src/components/ui/PitbullMeetCountdown.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

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

beforeEach(() => {
  // Con reduced motion la card se monta ya cargada (sin esperar al viewport).
  mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-08-15T09:00:00-03:00'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderCard(dateISO) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <PitbullMeetCountdown event={{ dateISO }} dateLabel="10 de octubre" />
      </MotionProvider>
    </I18nProvider>,
  )
}

const platesPerSide = (container) =>
  container.querySelector('.barbell__half')?.querySelectorAll('.barbell__plate').length

describe('PitbullMeetCountdown — "Hasta el Classic"', () => {
  it('muestra cuántas semanas faltan y carga un disco por semana en cada extremo', () => {
    const { container } = renderCard('2026-10-10')

    expect(screen.getByRole('status').textContent).toBe('Faltan 8 semanas')
    expect(container.querySelector('.meet-clock__value')?.textContent).toBe('8')
    expect(container.querySelectorAll('.barbell__half')).toHaveLength(2)
    expect(platesPerSide(container)).toBe(8)
    expect(container.querySelector('.barbell__collar')).not.toBeNull()
  })

  it('pasa a días en la última semana, con singular y un disco por día', () => {
    vi.setSystemTime(new Date('2026-10-09T09:00:00-03:00'))
    const { container } = renderCard('2026-10-10')

    expect(screen.getByRole('status').textContent).toBe('Falta 1 día')
    expect(platesPerSide(container)).toBe(1)
  })

  it('limita los discos a 12 aunque falten más semanas, sin falsear el número', () => {
    const { container } = renderCard('2026-12-12')

    expect(container.querySelector('.meet-clock__value')?.textContent).toBe('17')
    expect(platesPerSide(container)).toBe(12)
    expect(container.querySelector('.barbell')?.getAttribute('data-capped')).toBe('true')
  })

  it('no se muestra cuando el evento ya empezó', () => {
    vi.setSystemTime(new Date('2026-10-11T09:00:00-03:00'))
    const { container } = renderCard('2026-10-10')

    expect(container.querySelector('.pitbull-meet-countdown')).toBeNull()
  })
})
