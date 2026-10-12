import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const order = (overrides = {}) => ({
  id: 'o1',
  reference: 'TND-AAA111',
  status: 'pendiente',
  paymentMethod: 'bank_transfer',
  amount: 48000,
  buyerName: 'Lucía Pérez',
  buyerEmail: 'lucia@example.com',
  buyerPhone: null,
  buyerNote: 'Retiro el sábado',
  createdAt: '2026-10-11T12:00:00.000Z',
  fulfilledAt: null,
  needsRefund: false,
  paymentPending: false,
  hasProof: true,
  items: [
    { productId: 'p1', title: 'Buzo Pitbull', sizeLabel: 'M', unitPrice: 48000, quantity: 1 },
  ],
  ...overrides,
})

vi.mock('../src/services/shopService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAdminShopProducts: vi.fn(async () => []),
  fetchAdminShopOrders: vi.fn(),
  approveShopOrder: vi.fn(),
  cancelShopOrder: vi.fn(),
  fulfillShopOrder: vi.fn(),
  resolveShopOrderRefund: vi.fn(),
  fetchShopOrderProofUrl: vi.fn(),
  fetchShopCheckoutSettings: vi.fn(),
  saveShopCheckoutSettings: vi.fn(),
}))

const service = await import('../src/services/shopService.js')
const ShopSection = (await import('../src/pages/admin/ShopSection.jsx')).default

const SETTINGS = {
  mercadoPagoEnabled: true,
  bankTransferEnabled: true,
  cashEnabled: true,
  mercadoPagoProfileId: null,
  bankTransferProfileId: null,
  cashInstructions: 'Sede Banfield',
  fulfillmentNote: '',
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <ShopSection canEdit events={[]} {...props} />
    </I18nProvider>,
  )
}

const openTab = (name) => fireEvent.click(screen.getByRole('tab', { name }))

beforeEach(() => {
  for (const fn of Object.values(service)) if (vi.isMockFunction(fn)) fn.mockReset()
  service.fetchAdminShopProducts.mockResolvedValue([])
  service.fetchAdminShopOrders.mockResolvedValue([
    order(),
    order({ id: 'o2', reference: 'TND-BBB222', status: 'aprobado', paymentMethod: 'cash_on_site' }),
    order({
      id: 'o3',
      reference: 'TND-CCC333',
      status: 'aprobado',
      paymentMethod: 'mercado_pago',
      needsRefund: true,
    }),
  ])
  service.fetchShopCheckoutSettings.mockResolvedValue({
    settings: SETTINGS,
    profiles: { bank: [{ id: 'b1', name: 'Cuenta PLU' }], mercadoPago: [] },
    effective: {
      open: true,
      methods: { mercado_pago: true, bank_transfer: true, cash_on_site: true },
    },
  })
})

afterEach(cleanup)

describe('Admin — pedidos de la tienda', () => {
  it('muestra la cola de pendientes primero, con conteo y el detalle del comprador', async () => {
    renderSection()
    openTab('Pedidos')

    expect(await screen.findByText('TND-AAA111')).toBeTruthy()
    expect(screen.queryByText('TND-BBB222')).toBeNull()
    expect(screen.getByText('1 pendientes')).toBeTruthy()
    expect(screen.getByText(/Lucía Pérez · lucia@example.com/)).toBeTruthy()
    expect(screen.getByText(/Retiro el sábado/)).toBeTruthy()
  })

  it('filtra por estado y separa entregado de pagado', async () => {
    service.fetchAdminShopOrders.mockResolvedValue([
      order({
        id: 'o2',
        reference: 'TND-BBB222',
        status: 'aprobado',
        fulfilledAt: '2026-10-12T10:00:00.000Z',
      }),
    ])
    renderSection()
    openTab('Pedidos')
    await screen.findByText('1 pendientes').catch(() => null)
    fireEvent.click(await screen.findByRole('button', { name: 'Pagado' }))

    const row = (await screen.findByText('TND-BBB222')).closest('li')
    expect(within(row).getByText('Entregado')).toBeTruthy()
  })

  it('acreditar una transferencia pide confirmar el monto y avisa por el servidor', async () => {
    service.approveShopOrder.mockResolvedValue(order({ status: 'aprobado' }))
    renderSection()
    openTab('Pedidos')
    const row = (await screen.findByText('TND-AAA111')).closest('li')

    fireEvent.click(within(row).getByRole('button', { name: 'Acreditar pago' }))
    expect(within(row).getByText(/recibiste \$ 48\.000 de Lucía Pérez/)).toBeTruthy()
    expect(service.approveShopOrder).not.toHaveBeenCalled()

    fireEvent.click(within(row).getByRole('button', { name: 'Acreditar pago' }))
    await waitFor(() => expect(service.approveShopOrder).toHaveBeenCalledWith('o1'))
  })

  it('el comprobante se abre con un link temporal, no con una ruta del bucket', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    service.fetchShopOrderProofUrl.mockResolvedValue('https://storage.test/signed?token=1')
    renderSection()
    openTab('Pedidos')
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprobante' }))

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://storage.test/signed?token=1',
        '_blank',
        'noopener,noreferrer',
      ),
    )
    open.mockRestore()
  })

  it('cancelar pide motivo opcional y entrega el stock al catálogo', async () => {
    service.cancelShopOrder.mockResolvedValue(order({ status: 'cancelado' }))
    renderSection()
    openTab('Pedidos')
    const row = (await screen.findByText('TND-AAA111')).closest('li')

    fireEvent.click(within(row).getByRole('button', { name: 'Cancelar pedido' }))
    fireEvent.change(within(row).getByPlaceholderText('Motivo (opcional)'), {
      target: { value: 'No pagó' },
    })
    fireEvent.click(within(row).getByRole('button', { name: 'Cancelar y devolver el stock' }))

    await waitFor(() => expect(service.cancelShopOrder).toHaveBeenCalledWith('o1', 'No pagó'))
  })

  it('un pago de Mercado Pago acreditado no se puede cancelar desde acá y avisa por qué', async () => {
    renderSection()
    openTab('Pedidos')
    fireEvent.click(await screen.findByRole('button', { name: 'Pagado' }))

    const row = (await screen.findByText('TND-CCC333')).closest('li')
    expect(within(row).queryByRole('button', { name: 'Cancelar pedido' })).toBeNull()
    expect(within(row).getByText(/se devuelve desde Mercado Pago/)).toBeTruthy()
    expect(within(row).getByRole('alert').textContent).toMatch(/hay que devolverlo/)
  })

  it('un pedido pagado se marca entregado', async () => {
    service.fulfillShopOrder.mockResolvedValue(order({ status: 'aprobado', fulfilledAt: 'x' }))
    renderSection()
    openTab('Pedidos')
    fireEvent.click(await screen.findByRole('button', { name: 'Pagado' }))
    const row = (await screen.findByText('TND-BBB222')).closest('li')

    fireEvent.click(within(row).getByRole('button', { name: 'Marcar entregado' }))
    await waitFor(() => expect(service.fulfillShopOrder).toHaveBeenCalledWith('o2'))
  })

  it('sin permiso de edición solo se mira', async () => {
    renderSection({ canEdit: false })
    openTab('Pedidos')
    const row = (await screen.findByText('TND-AAA111')).closest('li')
    expect(within(row).queryByRole('button', { name: 'Acreditar pago' })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Cancelar pedido' })).toBeNull()
  })

  it('si no cargan los pedidos lo dice con reintento', async () => {
    service.fetchAdminShopOrders.mockRejectedValueOnce(new Error('x'))
    renderSection()
    openTab('Pedidos')
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /No se pudieron cargar los pedidos/,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('TND-AAA111')).toBeTruthy()
  })
})

describe('Admin — cobro de la tienda', () => {
  it('muestra qué se ofrece hoy y avisa si la transferencia no tiene cuenta', async () => {
    service.fetchShopCheckoutSettings.mockResolvedValue({
      settings: SETTINGS,
      profiles: { bank: [], mercadoPago: [] },
      effective: {
        open: true,
        methods: { mercado_pago: true, bank_transfer: false, cash_on_site: true },
      },
    })
    renderSection()
    openTab('Cobro')

    expect(await screen.findByText('Hoy se ofrece')).toBeTruthy()
    expect(screen.getByText(/sin alias ni CBU: no se ofrece/)).toBeTruthy()
  })

  it('guarda los cambios y repinta lo que el servidor publica', async () => {
    service.saveShopCheckoutSettings.mockResolvedValue({
      settings: { ...SETTINGS, cashEnabled: false },
      effective: {
        open: true,
        methods: { mercado_pago: true, bank_transfer: true, cash_on_site: false },
      },
    })
    renderSection()
    openTab('Cobro')
    await screen.findByText('Hoy se ofrece')

    fireEvent.click(screen.getByRole('checkbox', { name: /Efectivo en el lugar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(service.saveShopCheckoutSettings).toHaveBeenCalledWith(
        expect.objectContaining({ cashEnabled: false, mercadoPagoEnabled: true }),
      ),
    )
    expect(await screen.findByText('Cambios guardados.')).toBeTruthy()
  })

  it('un error al guardar se muestra y no pierde lo editado', async () => {
    service.saveShopCheckoutSettings.mockRejectedValue(
      new Error('La cuenta bancaria elegida no existe'),
    )
    renderSection()
    openTab('Cobro')
    await screen.findByText('Hoy se ofrece')
    fireEvent.change(screen.getByLabelText('Cómo se entrega'), {
      target: { value: 'Envío por correo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/cuenta bancaria elegida/)
    expect(screen.getByLabelText('Cómo se entrega').value).toBe('Envío por correo')
  })

  it('sin permiso de edición no hay botón de guardar', async () => {
    renderSection({ canEdit: false })
    openTab('Cobro')
    await screen.findByText('Hoy se ofrece')
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  })
})
