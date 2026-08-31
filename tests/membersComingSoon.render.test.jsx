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

const listMembershipPlans = vi.fn()

vi.mock('../src/services/paymentService.js', () => ({
  listMembershipPlans: (...args) => listMembershipPlans(...args),
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
    dispatchEvent: () => false,
  })
})

afterEach(() => {
  cleanup()
  listMembershipPlans.mockReset()
})

describe('MembersPage catálogo de planes', () => {
  it('no inventa afiliaciones adulto/juvenil cuando el API no trae planes', async () => {
    listMembershipPlans.mockResolvedValue({ plans: [] })

    const { container } = render(
      <I18nProvider>
        <MembersPage memberships={[]} onNavigate={vi.fn()} session={null} />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.members-plans-feedback--notice')).not.toBeNull()
    })

    const bodyText = container.querySelector('.members-page__body')?.textContent ?? ''
    expect(bodyText).not.toMatch(/Atleta adulto/i)
    expect(bodyText).not.toMatch(/Atleta juvenil/i)
    expect(container.querySelectorAll('.membership-card--plu')).toHaveLength(0)
  })

  it('muestra el plan vivo del backend, no el fallback editorial', async () => {
    listMembershipPlans.mockResolvedValue({
      plans: [
        {
          id: 'plan-one-time',
          code: 'plu-annual',
          name: 'Afiliacion PLU anual',
          price: 92500,
          currency: 'ARS',
          collectionMode: 'one_time',
          billingFrequency: 'annual',
        },
        {
          id: 'plan-recurring',
          code: 'plu-annual-auto',
          name: 'Afiliacion PLU anual (auto)',
          price: 92500,
          currency: 'ARS',
          collectionMode: 'recurring',
          billingFrequency: 'annual',
        },
      ],
    })

    const { container } = render(
      <I18nProvider>
        <MembersPage memberships={[]} onNavigate={vi.fn()} session={null} />
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('.membership-card--plu')).not.toBeNull()
    })

    const cards = container.querySelectorAll('.membership-card--plu')
    expect(cards).toHaveLength(1)
    expect(cards[0].textContent).toMatch(/Afiliacion PLU anual/)
    expect(cards[0].textContent).toMatch(/92\.500/)
    expect(cards[0].textContent).not.toMatch(/Atleta adulto|Atleta juvenil|Mayores de 18|14 a 17/i)
  })
})

describe('afiliacion en produccion, sin gate de lanzamiento', () => {
  it('muestra combo y plan con los CTAs de pago activos, no en Proximamente', async () => {
    listMembershipPlans.mockResolvedValue({
      plans: [
        {
          id: 'plan-one-time',
          code: 'plu-annual-v2',
          name: 'Afiliacion anual',
          price: 75000,
          currency: 'ARS',
          collectionMode: 'one_time',
          billingFrequency: 'annual',
        },
      ],
    })

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
      expect(container.querySelector('.season-combo-offer__cta')?.textContent).not.toMatch(
        /Próximamente|Proximamente/i,
      )
    })
    expect(container.querySelector('.season-combo-offer__cta')?.disabled).toBe(false)
    expect(container.querySelector('.membership-card__cta')?.textContent).not.toMatch(
      /Próximamente|Proximamente/i,
    )
    expect(container.querySelector('.membership-card__cta')?.disabled).toBe(false)
    fireEvent.click(container.querySelector('.season-combo-offer__cta'))
    expect(onSelectEvent).toHaveBeenCalled()
  })
})
