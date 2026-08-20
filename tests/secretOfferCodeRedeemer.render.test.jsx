import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

vi.mock('../src/services/athleteApi.js', () => ({
  redeemPromotionCodeRequest: vi.fn(),
}))

const SecretOfferCodeRedeemer = (await import('../src/components/ui/SecretOfferCodeRedeemer.jsx'))
  .default
const { redeemPromotionCodeRequest } = await import('../src/services/athleteApi.js')

function renderRedeemer(props = {}) {
  return render(
    <I18nProvider>
      <SecretOfferCodeRedeemer session={{ role: 'athlete_plu' }} onNavigate={vi.fn()} {...props} />
    </I18nProvider>,
  )
}

async function openAndSubmit(code = 'only-pitbull') {
  fireEvent.click(screen.getByRole('button', { name: /Tengo un código/i }))
  fireEvent.change(screen.getByLabelText(/^Código$/i), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: /Canjear/i }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.mocked(redeemPromotionCodeRequest).mockReset()
})

describe('canje secreto reutilizable', () => {
  it('anuncia la pestaña secreta y recién después redirige', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue({
      status: 'accepted',
      accepted: true,
      action: 'open_exclusive_offer',
      code: 'ONLY-PITBULL',
      offer: { code: 'ONLY-PITBULL' },
    })
    const onNavigate = vi.fn()
    renderRedeemer({ onNavigate })

    await openAndSubmit()
    await waitFor(() =>
      expect(redeemPromotionCodeRequest).toHaveBeenCalledWith({
        code: 'ONLY-PITBULL',
        context: { surface: 'global' },
      }),
    )
    expect(screen.getByText('Redirigiéndote a tu pestaña secreta…')).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()

    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-offer' }),
    )
  })

  it('pide iniciar sesión si todavía no hay un atleta autenticado', async () => {
    renderRedeemer({ session: null })

    await openAndSubmit()

    expect(screen.getByText(/ingresar con tu cuenta de atleta/i)).toBeTruthy()
    expect(redeemPromotionCodeRequest).not.toHaveBeenCalled()
  })

  it('explica un código inválido sin navegar', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue({
      status: 'rejected',
      accepted: false,
      reason: 'not_found',
    })
    const onNavigate = vi.fn()
    renderRedeemer({ onNavigate })

    await openAndSubmit('NO-EXISTE')

    expect((await screen.findByRole('alert')).textContent).toMatch(/no existe/i)
    expect(onNavigate).not.toHaveBeenCalled()
  })
})
