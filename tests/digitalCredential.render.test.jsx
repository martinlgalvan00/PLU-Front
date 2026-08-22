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
  // El rito de emisión se marca en localStorage: sin limpiar, el primer test
  // que monta un código se lo consume a los siguientes.
  window.localStorage.clear()
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

  it('keeps the card solid when there is no active membership', () => {
    const { container } = renderCredential({ status: 'inactiva' })
    const card = container.querySelector('.account-credential__card')
    expect(card?.dataset.flippable).toBe('0')
    expect(card?.getAttribute('role')).toBeNull()
    expect(container.querySelector('.account-credential__face--back')).toBeNull()
    expect(container.querySelector('.account-credential__flip')).toBeNull()

    fireEvent.click(card)
    expect(card?.dataset.flipped).toBe('0')
    expect(container.querySelector('.account-credential__face--back')).toBeNull()
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

  it('shows the athlete data grid on the reverse face', () => {
    const { container } = renderCredential({
      status: 'activa',
      memberCode: 'PLU-9',
      expirationDate: '2027-01-01',
    })
    const back = container.querySelector('.account-credential__face--back')
    expect(within(back).getByText('44545980')).toBeTruthy()
    expect(within(back).getByText('Pitbull')).toBeTruthy()
    // El reverso no repite el nombre del frente: identifica por código.
    expect(within(back).queryByText('Agustin Di Santo')).toBeNull()
    expect(back.querySelector('.account-credential__back-code').textContent).toBe('PLU-9')
  })

  it('plays the issue ritual only the first time for a member code', () => {
    const first = renderCredential({
      status: 'activa',
      memberCode: 'PLU-777',
      expirationDate: '2027-01-01',
    })
    const firstCard = first.container.querySelector('.account-credential__card')
    expect(firstCard.dataset.issued).toBe('1')
    expect(first.container.querySelector('.account-credential__sheen')).toBeTruthy()
    expect(window.localStorage.getItem('plu.celebrated.credential-issue.PLU-777')).toBe('1')

    cleanup()

    const again = renderCredential({
      status: 'activa',
      memberCode: 'PLU-777',
      expirationDate: '2027-01-01',
    })
    const againCard = again.container.querySelector('.account-credential__card')
    expect(againCard.dataset.issued).toBe('0')
    expect(again.container.querySelector('.account-credential__sheen')).toBeNull()
  })

  it('does not play the issue ritual without an active membership', () => {
    const { container } = renderCredential({ status: 'inactiva', memberCode: 'PLU-778' })
    expect(container.querySelector('.account-credential__card').dataset.issued).toBe('0')
    expect(container.querySelector('.account-credential__sheen')).toBeNull()
    expect(window.localStorage.getItem('plu.celebrated.credential-issue.PLU-778')).toBeNull()
  })

  it('marks the card as flipped by hand so the weighted turn can play', () => {
    const { container } = renderCredential({ status: 'activa', memberCode: 'PLU-779' })
    const card = container.querySelector('.account-credential__card')
    expect(card.dataset.flipTouched).toBe('0')

    fireEvent.click(card)
    expect(card.dataset.flipTouched).toBe('1')
    expect(card.dataset.flipped).toBe('1')
  })

  it('mounts the verification QR surface on the reverse face', () => {
    const { container } = renderCredential({
      status: 'activa',
      memberCode: 'PLU-780',
      expirationDate: '2027-01-01',
    })
    const back = container.querySelector('.account-credential__face--back')
    // La placa existe desde el primer render (estado 'pending' mientras el
    // generador dinámico resuelve): el dorso nunca muestra un hueco.
    expect(back.querySelector('.credential-qr')).toBeTruthy()
    expect(back.querySelector('.account-credential__back-qr')).toBeTruthy()
  })

  it('puts the member code and validity on the front footer', () => {
    const { container } = renderCredential({
      status: 'activa',
      memberCode: 'PLU-00123',
      expirationDate: '2027-01-01',
    })
    const foot = container.querySelector('.account-credential__foot')
    expect(within(foot).getByText('PLU-00123')).toBeTruthy()
    expect(foot.querySelector('.account-credential__code')).toBeTruthy()
    expect(within(foot).getByText(/vigencia/i)).toBeTruthy()
  })
})
