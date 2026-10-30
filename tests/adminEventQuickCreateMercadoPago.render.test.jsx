import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Alta de evento · Mercado Pago: el paso Venta ofrece elegir en qué cuenta entra
 * la plata y dice si puede cobrar, con la misma línea de estado que el editor.
 */

const profiles = [
  {
    id: 'mp-club',
    kind: 'mercado_pago',
    name: 'Club Norte',
    active: true,
    connectionStatus: 'connected',
    config: { connection: 'oauth' },
  },
  {
    id: 'mp-vieja',
    kind: 'mercado_pago',
    name: 'Cuenta vieja',
    active: false,
    config: {},
  },
]

vi.mock('../src/services/paymentProfileService.js', () => ({
  fetchPaymentProfiles: vi.fn(async ({ kind }) => ({
    profiles: kind === 'mercado_pago' ? profiles : [],
  })),
}))

const { default: AdminEventQuickCreate } =
  await import('../src/components/admin/AdminEventQuickCreate.jsx')

afterEach(cleanup)

function fillEventStep() {
  fireEvent.change(screen.getByLabelText('Título público'), { target: { value: 'Copa Norte' } })
  fireEvent.change(document.getElementById('quick-event-starts-at'), {
    target: { value: '2026-12-12T10:00' },
  })
  fireEvent.change(document.getElementById('quick-event-ends-at'), {
    target: { value: '2026-12-12T18:00' },
  })
  fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club' } })
  fireEvent.change(document.getElementById('quick-event-location'), {
    target: { value: 'Rosario' },
  })
}

describe('alta de evento · cuenta de Mercado Pago', () => {
  it('lista solo las cuentas activas, muestra el estado de la elegida y la envía', async () => {
    const onSubmit = vi.fn(async () => ({ event: { id: 'evt-nuevo' } }))
    render(
      <I18nProvider>
        <AdminEventQuickCreate canEdit onCancel={() => {}} onSubmit={onSubmit} />
      </I18nProvider>,
    )
    fillEventStep()
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))

    fireEvent.change(document.getElementById('quick-event-registration-opens'), {
      target: { value: '2026-06-01T10:00' },
    })
    fireEvent.change(document.getElementById('quick-event-registration-closes'), {
      target: { value: '2026-12-01T18:00' },
    })

    const select = await screen.findByLabelText('Cuenta de Mercado Pago')
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(2))
    expect(select.textContent).toContain('Club Norte')
    expect(select.textContent).not.toContain('Cuenta vieja')

    fireEvent.change(select, { target: { value: 'mp-club' } })
    expect(document.querySelector('.admin-event-quick__mp').textContent).toContain(
      'Vinculada con Mercado Pago · cobra en Club Norte',
    )

    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].mercadoPagoProfileId).toBe('mp-club')
  })
})
