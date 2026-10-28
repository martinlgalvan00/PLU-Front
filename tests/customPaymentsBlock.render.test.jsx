import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'

const fetchEventPaymentInfo = vi.fn()
vi.mock('../src/services/eventPaymentInfoService.js', () => ({ fetchEventPaymentInfo }))

const { default: CustomPaymentsBlock } =
  await import('../src/components/events/landing-blocks/CustomPaymentsBlock.jsx')

afterEach(cleanup)

const EVENT = { slug: 'pitbull-classic-2026', venue: 'La Troupé', location: 'Banfield' }

function Harness({ props = {} }) {
  const { t, locale } = useI18n()
  return (
    <CustomPaymentsBlock
      block={{ id: 'pagos', type: 'payments', visible: true, props }}
      ctx={{ event: EVENT, t, locale }}
    />
  )
}

function renderBlock(props) {
  return render(
    <I18nProvider>
      <Harness props={props} />
    </I18nProvider>,
  )
}

describe('bloque "Cómo pagar" de la landing', () => {
  it('lista los medios abiertos y, con efectivo, dónde pagar con Maps y Waze', async () => {
    fetchEventPaymentInfo.mockResolvedValue({
      registrationEnabled: true,
      channels: ['mercado_pago', 'cash_pitbull'],
      cashPayment: { place: 'Gimnasio Pitbull', address: 'Av. Mitre 1234, Avellaneda' },
    })
    renderBlock()
    expect(await screen.findByText('Mercado Pago')).toBeTruthy()
    expect(screen.getByText('Efectivo')).toBeTruthy()
    expect(screen.queryByText('Transferencia bancaria')).toBeNull()
    expect(screen.getByText('Gimnasio Pitbull')).toBeTruthy()
    expect(screen.getByRole('link', { name: /abrir en waze/i })).toBeTruthy()
  })

  it('con la inscripción pausada lo dice en vez de prometer medios', async () => {
    fetchEventPaymentInfo.mockResolvedValue({
      registrationEnabled: false,
      channels: ['mercado_pago'],
      cashPayment: null,
    })
    renderBlock({ title: 'Pagos' })
    expect(await screen.findByText(/no está recibiendo pagos/i)).toBeTruthy()
    expect(screen.queryByText('Mercado Pago')).toBeNull()
  })
})
