import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import PitbullCountdownIntro from '../src/components/ui/PitbullCountdownIntro.jsx'
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
  mockMatchMedia(() => false)
  window.sessionStorage.clear()
  // Solo la fecha: las animaciones de salida de Motion necesitan timers reales.
  vi.useFakeTimers({ toFake: ['Date'] })
  // 8 semanas exactas antes del meet (2026-10-10 09:00 ART).
  vi.setSystemTime(new Date('2026-08-15T09:00:00-03:00'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderIntro(props = {}) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <PitbullCountdownIntro
          event={{ dateISO: '2026-10-10' }}
          dateLabel="10 de octubre"
          {...props}
        />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('PitbullCountdownIntro', () => {
  it('anuncia cuánto falta para el torneo', () => {
    renderIntro()

    expect(screen.getByRole('status').textContent).toBe(
      'Faltan 8 semanas. Pitbull Classic · 10 de octubre',
    )
  })

  it('se levanta con Escape y no se repite al volver enseguida', async () => {
    const first = renderIntro()
    expect(screen.queryByRole('status')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 3000 })

    first.unmount()
    renderIntro()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('pasa a días cuando falta menos de una semana y usa singular con 1', () => {
    vi.setSystemTime(new Date('2026-10-09T09:00:00-03:00'))
    renderIntro()

    expect(screen.getByRole('status').textContent).toBe(
      'Falta 1 día. Pitbull Classic · 10 de octubre',
    )
  })

  it('no aparece con reduced motion ni cuando el evento ya pasó', () => {
    mockMatchMedia((query) => query.includes('prefers-reduced-motion'))
    renderIntro()
    expect(screen.queryByRole('status')).toBeNull()

    cleanup()
    mockMatchMedia(() => false)
    vi.setSystemTime(new Date('2026-10-11T09:00:00-03:00'))
    renderIntro()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
