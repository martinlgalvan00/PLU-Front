import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/paymentService.js', () => ({
  listMembershipPlans: vi.fn(async () => ({
    plans: [{
      id: 'plan-one-time',
      code: 'plu-annual-v2',
      name: 'Afiliacion anual',
      price: 75000,
      currency: 'ARS',
      collectionMode: 'one_time',
      billingFrequency: 'annual',
    }],
  })),
}))

const MembersPage = (await import('../src/pages/MembersPage.jsx')).default

beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(cleanup)

describe('CTA del combo Pitbull desde afiliaciones', () => {
  it('selecciona Pitbull y no el evento destacado de prueba a $2', async () => {
    const pitbull = {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      featured: false,
      price: 75000,
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      comboOffer: {
        active: true,
        price: 120000,
        currency: 'ARS',
        startsAt: '2020-01-01T00:00:00.000Z',
        endsAt: '2099-12-31T23:59:59.000Z',
      },
    }
    const featuredTestEvent = {
      slug: 'test-2026',
      title: 'test',
      featured: true,
      price: 2,
      pricing: { membership: 1, registration: 2, combo: 3 },
    }
    const onSelectEvent = vi.fn()

    const { container } = render(
      <I18nProvider>
        <MembersPage
          events={[featuredTestEvent, pitbull]}
          memberships={[]}
          onNavigate={vi.fn()}
          onSelectEvent={onSelectEvent}
          session={null}
        />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.members-combo-promo__price')?.textContent)
        .toContain('$\u00a0120.000')
    })

    fireEvent.click(container.querySelector('.members-combo-promo__cta'))
    expect(onSelectEvent).toHaveBeenCalledWith(pitbull)
  })
})
