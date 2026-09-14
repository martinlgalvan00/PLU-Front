import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminEventPriceSchedule from '../src/components/admin/AdminEventPriceSchedule.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(() => cleanup())

function renderSchedule(props = {}) {
  return render(
    <I18nProvider>
      <AdminEventPriceSchedule
        canEdit
        currentPrice={75000}
        onClearSchedule={vi.fn(async () => ({}))}
        onSetSchedule={vi.fn(async () => ({}))}
        {...props}
      />
    </I18nProvider>,
  )
}

describe('AdminEventPriceSchedule', () => {
  it('no pide programar si el evento todavía no existe', () => {
    render(
      <I18nProvider>
        <AdminEventPriceSchedule canEdit currentPrice={75000} />
      </I18nProvider>,
    )
    expect(screen.queryByRole('button', { name: /programar un cambio/i })).toBeNull()
  })

  it('abre el formulario y exige fecha futura', async () => {
    const onSetSchedule = vi.fn(async () => ({}))
    renderSchedule({ onSetSchedule })

    fireEvent.click(screen.getByRole('button', { name: /programar un cambio/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /nuevo precio$/i }), {
      target: { value: '90000' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^programar$/i }))

    expect(onSetSchedule).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/desde cuándo/i)
  })

  it('programa precio y fecha por el mismo contrato que Tarifas', async () => {
    const onSetSchedule = vi.fn(async () => ({}))
    renderSchedule({ onSetSchedule })

    fireEvent.click(screen.getByRole('button', { name: /programar un cambio/i }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /nuevo precio$/i }), {
      target: { value: '90000' },
    })
    fireEvent.change(screen.getByLabelText(/rige desde/i), { target: { value: '15122099' } })
    fireEvent.change(screen.getByLabelText(/^hora$/i), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: /^programar$/i }))

    await vi.waitFor(() => expect(onSetSchedule).toHaveBeenCalledTimes(1))
    expect(onSetSchedule).toHaveBeenCalledWith({
      price: 90000,
      manualPrice: undefined,
      effectiveAt: '2099-12-15T10:00',
    })
  })

  it('muestra el cambio pendiente y permite cancelarlo', async () => {
    const onClearSchedule = vi.fn(async () => ({}))
    renderSchedule({
      onClearSchedule,
      priceEffectiveAt: '2099-10-01T03:00:00.000Z',
      scheduledPrice: 90000,
    })

    expect(screen.getByText(/90\.000|90000/).textContent).toMatch(/desde/i)
    fireEvent.click(screen.getByRole('button', { name: /cancelar programación/i }))
    await vi.waitFor(() => expect(onClearSchedule).toHaveBeenCalledTimes(1))
  })
})
