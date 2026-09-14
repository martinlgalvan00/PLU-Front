import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

const fetchCommunitySpotlight = vi.fn()

vi.mock('../src/services/communityService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchCommunitySpotlight: (...args) => fetchCommunitySpotlight(...args),
  }
})

const CommunitySpotlight = (await import('../src/components/ui/CommunitySpotlight.jsx')).default

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
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

afterEach(() => {
  cleanup()
  fetchCommunitySpotlight.mockReset()
})

function renderSpotlight() {
  return render(
    <I18nProvider>
      <MotionProvider>
        <CommunitySpotlight onNavigate={vi.fn()} />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('CommunitySpotlight — métricas en cero', () => {
  it('oculta el bloque de stats cuando gyms, afiliados y provincias están en 00', async () => {
    fetchCommunitySpotlight.mockResolvedValue({
      members: [],
      stats: { activeGymCount: 0, memberCount: 0, provinceCount: 0 },
      source: 'supabase',
    })

    const { container } = renderSpotlight()

    await waitFor(() => {
      expect(container.querySelector('.community-spotlight__roster')?.getAttribute('aria-busy')).toBeNull()
    })

    expect(container.querySelector('.community-spotlight__stats')).toBeNull()
    expect(screen.queryByText('00')).toBeNull()
  })

  it('muestra solo las métricas con valor real', async () => {
    fetchCommunitySpotlight.mockResolvedValue({
      members: [],
      stats: { activeGymCount: 4, memberCount: 0, provinceCount: 2 },
      source: 'supabase',
    })

    const { container } = renderSpotlight()

    await waitFor(() => {
      expect(container.querySelector('.community-spotlight__stats')?.dataset.count).toBe('2')
    })

    expect(screen.getByText('04')).toBeTruthy()
    expect(screen.getByText('02')).toBeTruthy()
    expect(screen.getByText('Gimnasios')).toBeTruthy()
    expect(screen.getByText('Provincias')).toBeTruthy()
    expect(screen.queryByText('Afiliados')).toBeNull()
  })
})
