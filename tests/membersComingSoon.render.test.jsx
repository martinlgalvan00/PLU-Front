import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    env: {
      ...actual.env,
      appProduction: true,
      paidCheckoutEnabled: null,
    },
  }
})

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

describe('afiliacion con APP_PRODUCTION y cobro cerrado', () => {
  it('muestra combo y plan con todos los CTAs en Proximamente', async () => {
    const pitbull = {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      featured: true,
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
    const onSelectEvent = vi.fn()
    const { container } = render(
      <I18nProvider>
        <MembersPage
          events={[pitbull]}
          memberships={[]}
          onNavigate={vi.fn()}
          onSelectEvent={onSelectEvent}
          session={null}
        />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.members-combo-promo__cta')?.textContent)
        .toMatch(/Próximamente|Proximamente/i)
    })
    expect(container.querySelector('.members-combo-promo__cta')?.disabled).toBe(true)
    expect(container.querySelector('.membership-card__cta')?.textContent)
      .toMatch(/Próximamente|Proximamente/i)
    expect(container.querySelector('.membership-card__cta')?.disabled).toBe(true)
    expect(container.querySelector('.members-plu-hero__cta-row .btn')?.textContent)
      .toMatch(/Próximamente|Proximamente/i)
    fireEvent.click(container.querySelector('.members-combo-promo__cta'))
    expect(onSelectEvent).not.toHaveBeenCalled()
  })
})
