/**
 * Smoke render + interaction for DigitalCredential (plan QA).
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import DigitalCredential from '../src/components/ui/DigitalCredential.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

const athlete = {
  fullName: 'Agustin Di Santo',
  documentId: '44545980',
  birthDate: '2002-11-03',
  gym: 'Pitbull',
  city: 'Quilmes',
  province: 'Buenos Aires',
  sex: 'M',
}

function renderCredential(membership) {
  return render(
    <I18nProvider>
      <DigitalCredential athlete={athlete} membership={membership} />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe('DigitalCredential', () => {
  it('renders active status with premium face layers', () => {
    const { container } = renderCredential({
      status: 'activa',
      memberCode: 'PLU-00123',
      expirationDate: '2027-01-01',
    })

    const status = container.querySelector('.account-credential__status')
    expect(status?.classList.contains('is-active')).toBe(true)
    expect(status?.classList.contains('is-inactive')).toBe(false)
    expect(
      within(container.querySelector('.account-credential__face--front')).getByText(
        'Agustin Di Santo',
      ),
    ).toBeTruthy()
    expect(container.querySelector('.account-credential__watermark')).toBeTruthy()
    expect(container.querySelector('.account-credential__grain')).toBeTruthy()
    expect(container.querySelector('.account-credential__tilt')).toBeTruthy()
  })

  it('renders inactive membership with muted inactive chip', () => {
    const { container } = renderCredential({ status: 'inactiva' })
    const status = container.querySelector('.account-credential__status')
    expect(status?.classList.contains('is-inactive')).toBe(true)
    expect(status?.classList.contains('is-active')).toBe(false)
  })

  it('flips via card tap and flip button', () => {
    const { container } = renderCredential({ status: 'activa', memberCode: 'PLU-9' })
    const card = container.querySelector('.account-credential__card')
    const flip = container.querySelector('.account-credential__flip')
    expect(card?.dataset.flipped).toBe('0')

    fireEvent.click(card)
    expect(card?.dataset.flipped).toBe('1')
    expect(within(flip).getByText(/ver frente/i)).toBeTruthy()

    fireEvent.click(flip)
    expect(card?.dataset.flipped).toBe('0')
    expect(within(flip).getByText(/ver reverso/i)).toBeTruthy()
  })

  it('shows athlete identity on the reverse face', () => {
    const { container } = renderCredential({ status: 'activa', memberCode: 'PLU-9' })
    const back = container.querySelector('.account-credential__face--back')
    expect(within(back).getByText('Agustin Di Santo')).toBeTruthy()
    expect(within(back).getByText('44545980')).toBeTruthy()
    expect(within(back).getByText('Pitbull')).toBeTruthy()
  })
})
