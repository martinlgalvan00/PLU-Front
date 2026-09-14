import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import MembersBenefitsShowcase from '../src/components/ui/MembersBenefitsShowcase.jsx'
import MembersRequirementsCarousel from '../src/components/ui/MembersRequirementsCarousel.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import { MEMBERSHIP_BENEFITS, MEMBERSHIP_REQUIREMENTS } from '../src/lib/content/es.js'

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

function renderWithProviders(ui) {
  return render(
    <I18nProvider>
      <MotionProvider>{ui}</MotionProvider>
    </I18nProvider>,
  )
}

vi.mock('../src/services/paymentService.js', () => ({
  listMembershipPlans: vi.fn(async () => ({ plans: [] })),
}))

const MembersPage = (await import('../src/pages/MembersPage.jsx')).default

describe('Teatro 3D de afiliación', () => {
  it('renderiza beneficios con la credencial como protagonista y headings visibles', () => {
    const { container } = renderWithProviders(
      <MembersBenefitsShowcase
        items={MEMBERSHIP_BENEFITS}
        title="Qué incluye"
        lead="Credencial QR, estado en perfil y calendario oficial bajo estándar PLU USA."
        ariaLabel="Beneficios de la afiliación"
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Qué incluye' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Credencial digital QR' })).toBeTruthy()
    expect(container.querySelectorAll('.members-benefits__row')).toHaveLength(4)
    expect(container.querySelector('.members-benefits__row--lead')?.textContent).toContain(
      'Credencial digital QR',
    )
    expect(['js', 'css']).toContain(container.querySelector('.members-benefits')?.dataset.theater)
  })

  it('apaga el teatro de beneficios con reduced motion', () => {
    mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))

    const { container } = renderWithProviders(
      <MembersBenefitsShowcase
        items={MEMBERSHIP_BENEFITS}
        title="Qué incluye"
        lead="Lead"
        ariaLabel="Beneficios de la afiliación"
      />,
    )

    expect(container.querySelector('.members-benefits')?.dataset.theater).toBe('off')
    expect(container.querySelector('.members-benefits--theater')).toBeNull()
    mockMatchMedia(() => false)
  })

  it('renderiza los cuatro requisitos como placas con título de sección', () => {
    const { container } = renderWithProviders(
      <MembersRequirementsCarousel
        items={MEMBERSHIP_REQUIREMENTS}
        title="Antes de afiliarte"
        lead="Documentación mínima para validar tu solicitud."
        ariaLabel="Requisitos de afiliación"
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Antes de afiliarte' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Documento' })).toBeTruthy()
    expect(container.querySelectorAll('.members-req__cell')).toHaveLength(4)
    expect(container.querySelectorAll('.members-req__plate')).toHaveLength(4)
    expect(['js', 'css']).toContain(container.querySelector('.members-req')?.dataset.theater)
  })

  it('apaga el teatro de requisitos con reduced motion', () => {
    mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))

    const { container } = renderWithProviders(
      <MembersRequirementsCarousel
        items={MEMBERSHIP_REQUIREMENTS}
        title="Antes de afiliarte"
        lead="Lead"
        ariaLabel="Requisitos de afiliación"
      />,
    )

    expect(container.querySelector('.members-req')?.dataset.theater).toBe('off')
    expect(container.querySelector('.members-req--theater')).toBeNull()
    mockMatchMedia(() => false)
  })

  it('conserva el ancla #requisitos y las dos secciones en la página', async () => {
    const { container } = renderWithProviders(
      <MembersPage memberships={[]} onNavigate={vi.fn()} session={null} events={[]} />,
    )

    expect(container.querySelector('#requisitos')).not.toBeNull()
    expect(container.querySelector('.members-plu-block--benefits')).not.toBeNull()
    expect(container.querySelector('.members-plu-block--requirements')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Qué incluye' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Antes de afiliarte' })).toBeTruthy()
  })
})
