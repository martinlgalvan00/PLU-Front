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
  it('una oferta exclusiva ya retirada no navega ni anuncia nada (20260915100000)', async () => {
    // Un backend todavía no migrado podría seguir contestando
    // `open_exclusive_offer`: `redeemPromotionCode` lo convierte en un rechazo
    // antes de que este widget lo vea, así que no debe mostrarse ni navegarse
    // a ningún lado — la oferta por código está retirada del producto.
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

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText(/pestaña secreta/i)).toBeNull()
    expect(onNavigate).not.toHaveBeenCalled()
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

  it('abre con el código del QR listo y explica el beneficio antes del checkout', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue({
      status: 'accepted',
      accepted: true,
      action: 'apply_to_checkout',
      code: 'AFILIACION-15',
      kind: 'percent',
      benefit: { percentOff: 15 },
      campaign: { name: 'Beneficio anual' },
      destination: { view: 'profile', tab: 'account-membership' },
    })
    const onNavigate = vi.fn()
    renderRedeemer({ defaultOpen: true, initialCode: 'afiliacion-15', onNavigate })

    expect(screen.getByLabelText(/^Código$/i).value).toBe('AFILIACION-15')
    fireEvent.click(screen.getByRole('button', { name: /Canjear/i }))

    expect(await screen.findByText('15% de descuento listo para usar.')).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Usar en Afiliación/i }))
    expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-membership' })
  })
})

/**
 * Reveal del canje.
 *
 * El resultado aceptado se contaba como un renglón debajo del input: campaña en
 * negrita, beneficio en gris, dos `small` con los medios de pago y el botón.
 * Todo cierto y todo del mismo peso, así que las condiciones que cambian la
 * operación —con qué se paga, si el pago se puede delegar y por cuánto tiempo,
 * cuánto cupo queda— se leían como notas al pie.
 *
 * Ahora ese momento se abre en su propia pieza y la banda queda como registro.
 * Lo que estos tests protegen es que sea UNA cosa o la otra: si las dos se
 * montan a la vez, cada control queda duplicado en el DOM.
 */
const CODIGO_FINANCIADO = {
  status: 'accepted',
  accepted: true,
  action: 'apply_to_checkout',
  code: 'COMBO-PITBULL',
  kind: 'fixed_price',
  campaign: { name: 'Combo Pitbull Classic', description: 'Afiliación más inscripción.' },
  benefit: {
    fixedPrice: 90000,
    manualChannels: ['bank_transfer', 'cash_pitbull'],
    mercadoPagoEnabled: false,
    financed: true,
    financingTermDays: 5,
    maxRedemptions: 10,
    remaining: 3,
    expiresAt: '2026-09-30T23:59:00.000Z',
  },
  destination: { view: 'profile', tab: 'account-membership' },
}

describe('reveal del canje', () => {
  it('el código aceptado abre el reveal con el beneficio como titular', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(CODIGO_FINANCIADO)
    renderRedeemer()

    await openAndSubmit('combo-pitbull')

    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    // El titular es el beneficio; la campaña queda arriba como eyebrow.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/precio promocional/i)
    expect(screen.getByText('Combo Pitbull Classic')).toBeTruthy()
    // La llave, para que se vea que el código es suyo.
    expect(dialog.textContent).toContain('COMBO-PITBULL')
  })

  it('cuenta las condiciones que el beneficio no dice', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(CODIGO_FINANCIADO)
    renderRedeemer()

    await openAndSubmit('combo-pitbull')
    await screen.findByRole('dialog')

    // Pasarela cerrada: no es "además podés", es "sólo así".
    expect(screen.getByText(/únicamente con/i).textContent).toMatch(/transferencia · efectivo/i)
    // El plazo del financiamiento, con su consecuencia. Viaja en el canje desde
    // 20260923100000: antes sólo lo sabía la ficha del checkout.
    expect(screen.getByText(/5 días para acreditarlo/i)).toBeTruthy()
    expect(screen.getByText(/Quedan 3 lugares/i)).toBeTruthy()
  })

  it('cerrado con Escape deja el registro en la banda, sin duplicar nada', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(CODIGO_FINANCIADO)
    renderRedeemer()

    await openAndSubmit('combo-pitbull')
    await screen.findByRole('dialog')
    // Con el reveal abierto la acción existe una sola vez.
    expect(screen.getAllByRole('button', { name: /Usar en Afiliación/i })).toHaveLength(1)

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Y sigue existiendo una sola vez, ahora en la banda.
    expect(screen.getAllByRole('button', { name: /Usar en Afiliación/i })).toHaveLength(1)
    // El detalle no se repite abajo: para eso está el reabrir.
    expect(screen.queryByText(/5 días para acreditarlo/i)).toBeNull()
    expect(screen.getByRole('button', { name: /Ver el beneficio/i })).toBeTruthy()
  })

  it('se puede volver a leer el detalle sin canjear de nuevo', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(CODIGO_FINANCIADO)
    renderRedeemer()

    await openAndSubmit('combo-pitbull')
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: /Ver el beneficio/i }))

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(redeemPromotionCodeRequest).toHaveBeenCalledTimes(1)
  })

  it('la acción principal del reveal navega y cierra la pieza', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue(CODIGO_FINANCIADO)
    const onNavigate = vi.fn()
    renderRedeemer({ onNavigate })

    await openAndSubmit('combo-pitbull')
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /Usar en Afiliación/i }))

    expect(onNavigate).toHaveBeenCalledWith('profile', { tab: 'account-membership' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('un código rechazado no abre ninguna pieza', async () => {
    vi.mocked(redeemPromotionCodeRequest).mockResolvedValue({
      status: 'rejected',
      accepted: false,
      reason: 'limit_reached',
    })
    renderRedeemer()

    await openAndSubmit('agotado')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
