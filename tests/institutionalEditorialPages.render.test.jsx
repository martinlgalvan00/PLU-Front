import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

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
  globalThis.IntersectionObserver ??= class {
    constructor(callback) {
      this.callback = callback
    }

    observe() {
      this.callback?.([{ isIntersecting: true, target: document.body }], this)
    }

    unobserve() {}
    disconnect() {}
  }
})

vi.mock('../src/services/lifterLookupService.js', () => ({
  searchPublishedLifters: vi.fn((query) => {
    const normalized = String(query).trim().toLowerCase()
    if (normalized.length < 2) return []
    if (normalized.includes('zz')) return []
    return [
      {
        id: 'meet:open:ana',
        name: 'Ana Test',
        division: 'Open',
        meet: 'Pitbull Classic',
        totalLabel: '480 kg',
      },
    ]
  }),
}))

const SponsorsPage = (await import('../src/pages/SponsorsPage.jsx')).default
const StandardsPage = (await import('../src/pages/StandardsPage.jsx')).default
const CommunityPage = (await import('../src/pages/CommunityPage.jsx')).default

function renderPage(Page) {
  const onNavigate = vi.fn()
  const view = render(
    <I18nProvider>
      <MotionProvider>
        <Page onNavigate={onNavigate} />
      </MotionProvider>
    </I18nProvider>,
  )
  return { ...view, onNavigate }
}

afterEach(cleanup)

describe('páginas institucionales editoriales', () => {
  it('muestra tiers de sponsors como ranking con slots vacíos honestos', () => {
    const { container, onNavigate } = renderPage(SponsorsPage)

    expect(screen.getByRole('heading', { name: /sponsors oficiales/i })).toBeTruthy()
    expect(container.querySelector('.sponsors-tiers__item--title')).toBeTruthy()
    expect(screen.getAllByText(/slot disponible/i).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /proponer alianza/i }))
    expect(onNavigate).toHaveBeenCalledWith('contact')
  })

  it('busca atletas en el lookup de estándares y conserva el cierre al reglamento', () => {
    const { onNavigate } = renderPage(StandardsPage)

    expect(screen.getByText(/escribí al menos 2 letras/i)).toBeTruthy()

    const input = screen.getByPlaceholderText(/nombre del atleta/i)
    fireEvent.change(input, { target: { value: 'zz' } })
    expect(screen.getByText(/no hay coincidencias/i)).toBeTruthy()

    fireEvent.change(input, { target: { value: 'Ana' } })
    expect(screen.getByText('Ana Test')).toBeTruthy()
    expect(screen.getByText('480 kg')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /abrir reglamento/i }))
    expect(onNavigate).toHaveBeenCalledWith('rulebook')
  })

  it('expone canales y el padrón como nota editorial, no como empty-state de card', () => {
    const { container, onNavigate } = renderPage(CommunityPage)

    expect(container.querySelector('.community-honest-state__icon')).toBeNull()
    expect(screen.getByRole('heading', { name: /el padrón público está en preparación/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /consultar al equipo/i }))
    expect(onNavigate).toHaveBeenCalledWith('contact')

    fireEvent.click(screen.getByRole('button', { name: /ver afiliación/i }))
    expect(onNavigate).toHaveBeenCalledWith('members')
  })
})
