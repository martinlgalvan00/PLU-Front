import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/services/athleteApi.js', () => ({
  fetchOfferUnlocks: vi.fn(),
}))

vi.mock('../src/motion/MotionContentSwap.tsx', () => ({
  default: ({ children }) => <>{children}</>,
}))
vi.mock('../src/components/ui/Reveal.jsx', () => ({ default: ({ children }) => <>{children}</> }))
vi.mock('../src/components/ui/EmailVerificationBanner.jsx', () => ({ default: () => null }))
vi.mock('../src/components/ui/GateMembershipBanner.jsx', () => ({ default: () => null }))
vi.mock('../src/pages/profile/ProfileHero.jsx', () => ({ default: () => null }))
vi.mock('../src/pages/profile/AccountNav.jsx', () => ({
  default: ({ activeId, visibleIds }) => (
    <nav data-testid="account-nav" data-active={activeId} data-visible={visibleIds.join(',')} />
  ),
}))
vi.mock('../src/pages/profile/QrCredentialSection.jsx', () => ({ default: () => <div>QR</div> }))
vi.mock('../src/pages/profile/PromotionBenefitsSection.jsx', () => ({
  default: () => <div>Beneficios</div>,
}))
vi.mock('../src/pages/profile/ExclusiveOfferSection.jsx', () => ({
  default: () => <div data-testid="exclusive-offer">Oferta exclusiva</div>,
}))
vi.mock('../src/pages/profile/UpcomingEventsSection.jsx', () => ({
  default: () => <div data-testid="events-section">Torneos</div>,
}))
vi.mock('../src/pages/profile/HistorySection.jsx', () => ({ default: () => <div>Historial</div> }))
vi.mock('../src/pages/profile/MembershipPurchaseSection.jsx', () => ({
  default: () => <div>Afiliación</div>,
}))
vi.mock('../src/pages/profile/PaymentsSection.jsx', () => ({ default: () => <div>Pagos</div> }))
vi.mock('../src/pages/profile/PersonalDataSection.jsx', () => ({
  default: () => <div>Datos</div>,
}))
vi.mock('../src/pages/profile/SecuritySection.jsx', () => ({
  default: () => <div>Seguridad</div>,
}))

const AthleteProfilePage = (await import('../src/pages/AthleteProfilePage.jsx')).default
const { fetchOfferUnlocks } = await import('../src/services/athleteApi.js')

const BASE_OFFER = {
  code: 'ONLY-PITBULL',
  kind: 'offer',
  redeemed: true,
  event: { slug: 'pitbull-classic', title: 'Pitbull Classic' },
  comboOffer: { active: true },
}

function renderProfile({ offer, payment }) {
  vi.mocked(fetchOfferUnlocks).mockResolvedValue([offer])
  return render(
    <AthleteProfilePage
      athlete={{ id: 'ath-1', fullName: 'Ana Pérez' }}
      memberships={[]}
      payments={payment ? [{ athleteId: 'ath-1', ...payment }] : []}
      registrations={[]}
      events={[]}
      initialTab="account-offer"
      session={{ role: 'athlete_plu', athleteId: 'ath-1' }}
    />,
  )
}

afterEach(cleanup)
beforeEach(() => vi.mocked(fetchOfferUnlocks).mockReset())

describe('ciclo de vida de la oferta secreta en Mi cuenta', () => {
  it('FIAR otorgado elimina la pestaña y deja al atleta en Torneos', async () => {
    const purchase = {
      orderId: 'ord-fiar',
      status: 'validacion_manual',
      method: 'manual_link',
      financingAllowed: true,
      manualPaymentDeclaredAt: '2026-08-21T12:00:00Z',
      financedEntitlementsAt: '2026-08-21T12:00:00Z',
    }
    renderProfile({ offer: { ...BASE_OFFER, purchase }, payment: { id: 'ord-fiar', ...purchase } })

    await waitFor(() => expect(fetchOfferUnlocks).toHaveBeenCalled())
    expect(screen.getByTestId('account-nav').dataset.visible).not.toContain('account-offer')
    expect(screen.getByTestId('account-nav').dataset.active).toBe('account-events')
    expect(screen.getByTestId('events-section')).toBeTruthy()
    expect(screen.queryByTestId('exclusive-offer')).toBeNull()
  })

  it('la aprobación de Finanzas también elimina la pestaña', async () => {
    const purchase = { orderId: 'ord-paid', status: 'aprobado', method: 'manual_link' }
    renderProfile({ offer: { ...BASE_OFFER, purchase }, payment: { id: 'ord-paid', ...purchase } })

    await waitFor(() => expect(fetchOfferUnlocks).toHaveBeenCalled())
    expect(screen.getByTestId('account-nav').dataset.visible).not.toContain('account-offer')
    expect(screen.getByTestId('events-section')).toBeTruthy()
  })

  it('una transferencia sin FIAR conserva la ficha mientras espera revisión', async () => {
    const purchase = {
      orderId: 'ord-review',
      status: 'validacion_manual',
      method: 'manual_link',
      financingAllowed: false,
      manualPaymentDeclaredAt: '2026-08-21T12:00:00Z',
    }
    renderProfile({
      offer: { ...BASE_OFFER, purchase },
      payment: { id: 'ord-review', ...purchase },
    })

    await waitFor(() => expect(screen.getByTestId('exclusive-offer')).toBeTruthy())
    expect(screen.getByTestId('account-nav').dataset.visible).toContain('account-offer')
    expect(screen.getByTestId('account-nav').dataset.active).toBe('account-offer')
  })
})
