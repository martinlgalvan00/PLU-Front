import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

const HOODIE = {
  id: 'p-hoodie',
  slug: 'buzo',
  title: 'Buzo Pitbull Classic',
  category: 'apparel',
  description: '',
  price: 48000,
  imageUrls: [],
  sizes: [
    { label: 'M', inStock: true },
    { label: 'XL', inStock: false },
  ],
  inStock: true,
  lowStock: false,
  featured: false,
  event: null,
  course: null,
}
const COURSE = {
  id: 'p-course',
  slug: 'curso',
  title: 'Curso de jueces PLU',
  category: 'course',
  description: '',
  price: 45000,
  imageUrls: [],
  sizes: [],
  inStock: true,
  lowStock: false,
  featured: false,
  event: null,
  course: {
    startsAt: '2027-03-20T16:00:00.000Z',
    modality: 'presencial',
    location: 'Banfield',
    capacity: 24,
  },
}

vi.mock('../src/services/shopService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPublicShopProducts: vi.fn(async () => [HOODIE, COURSE]),
}))
vi.mock('../src/services/contactService.js', () => ({ submitContactMessage: vi.fn() }))
vi.mock('../src/services/shopOrderService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchShopCheckout: vi.fn(),
  createShopOrder: vi.fn(),
  startShopPayment: vi.fn(),
  fetchShopOrder: vi.fn(),
  reconcileShopOrder: vi.fn(),
  uploadShopOrderProof: vi.fn(),
}))

const ShopPage = (await import('../src/pages/ShopPage.jsx')).default
const { resetShopProductsCache } = await import('../src/hooks/useShopProducts.js')
const service = await import('../src/services/shopOrderService.js')

const baseOrder = (overrides = {}) => ({
  id: '3f2b5d1e-1111-4222-8333-444455556666',
  reference: 'TND-AB3K9Z',
  status: 'pendiente',
  paymentMethod: 'cash_on_site',
  amount: 48000,
  currency: 'ARS',
  buyerName: 'Lucía',
  buyerEmail: 'lucia@example.com',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  paymentPending: false,
  needsRefund: false,
  hasProof: false,
  items: [
    {
      productId: 'p-hoodie',
      title: 'Buzo Pitbull Classic',
      sizeLabel: 'M',
      unitPrice: 48000,
      quantity: 1,
      category: 'apparel',
    },
  ],
  payment: {
    method: 'cash_on_site',
    bankDetails: null,
    cashInstructions: 'Sede Banfield, sábados',
    fulfillmentNote: '',
  },
  ...overrides,
})

function stubMatchMedia() {
  window.matchMedia = (query) => ({
    matches: String(query).includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    },
  )
})

const assign = vi.fn()

beforeEach(() => {
  stubMatchMedia()
  window.localStorage.clear()
  resetShopProductsCache()
  assign.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign, pathname: '/tienda', search: '', hash: '' },
  })
  for (const fn of Object.values(service)) if (vi.isMockFunction(fn)) fn.mockReset()
  service.fetchShopCheckout.mockResolvedValue({
    open: true,
    methods: { mercado_pago: true, bank_transfer: true, cash_on_site: true },
    cashInstructions: '',
    fulfillmentNote: '',
  })
  service.fetchShopOrder.mockResolvedValue(baseOrder())
})

afterEach(cleanup)

function renderShop() {
  return render(
    <I18nProvider>
      <MotionProvider>
        <ShopPage events={[]} onNavigate={vi.fn()} />
      </MotionProvider>
    </I18nProvider>,
  )
}

async function addHoodie() {
  fireEvent.click(await screen.findByRole('tab', { name: /Ropa y accesorios/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Buzo Pitbull Classic' }))
  const drawer = await screen.findByRole('dialog', { name: 'Buzo Pitbull Classic' })
  return drawer
}

async function goToDetails() {
  fireEvent.click(await screen.findByRole('button', { name: /Abrir mi pedido/ }))
  const bag = await screen.findByRole('dialog', { name: 'Tu pedido' })
  fireEvent.click(within(bag).getByRole('button', { name: /Continuar/ }))
  return bag
}

function fillBuyer(bag) {
  fireEvent.change(within(bag).getByLabelText(/Nombre y apellido/), {
    target: { value: 'Lucía Pérez' },
  })
  fireEvent.change(within(bag).getByLabelText(/^Email$/), {
    target: { value: 'lucia@example.com' },
  })
}

describe('Tienda — armar el pedido', () => {
  it('pide talle antes de agregar y deja agregar con talle', async () => {
    renderShop()
    const drawer = await addHoodie()

    fireEvent.click(within(drawer).getByRole('button', { name: /Agregar al pedido/ }))
    expect((await within(drawer).findByRole('alert')).textContent).toMatch(/Elegí un talle/)
    expect(screen.queryByRole('button', { name: /Abrir mi pedido/ })).toBeNull()

    fireEvent.click(within(drawer).getByRole('radio', { name: 'M' }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Agregar al pedido/ }))
    expect(await within(drawer).findByText('Agregado a tu pedido')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('plu.shop.cart.v1'))[0]).toMatchObject({
      productId: 'p-hoodie',
      sizeLabel: 'M',
      quantity: 1,
    })
  })

  it('el carrito suma cantidades, recalcula el total y queda guardado', async () => {
    renderShop()
    const drawer = await addHoodie()
    fireEvent.click(within(drawer).getByRole('radio', { name: 'M' }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Agregar al pedido/ }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Ver mi pedido/ }))

    const bag = await screen.findByRole('dialog', { name: 'Tu pedido' })
    expect(within(bag).getByText('Talle M')).toBeTruthy()
    fireEvent.click(within(bag).getByRole('button', { name: 'Sumar uno' }))
    expect(within(bag).getByText('$ 96.000', { selector: 'strong' })).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('plu.shop.cart.v1'))[0].quantity).toBe(2)

    fireEvent.click(within(bag).getByRole('button', { name: /Quitar Buzo Pitbull Classic/ }))
    expect(within(bag).getByText('Todavía no agregaste nada.')).toBeTruthy()
  })

  it('un curso se reserva sin talle y sin selector de cantidad', async () => {
    renderShop()
    fireEvent.click(await screen.findByRole('tab', { name: /Cursos/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Curso de jueces PLU/ }))
    const drawer = await screen.findByRole('dialog', { name: 'Curso de jueces PLU' })
    fireEvent.click(within(drawer).getByRole('button', { name: /Reservar mi lugar/ }))
    fireEvent.click(await within(drawer).findByRole('button', { name: /Ver mi pedido/ }))

    const bag = await screen.findByRole('dialog', { name: 'Tu pedido' })
    expect(within(bag).queryByRole('button', { name: 'Sumar uno' })).toBeNull()
  })

  it('un carrito guardado se limpia contra el catálogo: el producto agotado se quita con aviso', async () => {
    window.localStorage.setItem(
      'plu.shop.cart.v1',
      JSON.stringify([
        {
          productId: 'p-gone',
          category: 'apparel',
          quantity: 1,
          title: 'Buzo Fundadores',
          price: 52000,
          sizeLabel: 'M',
        },
        {
          productId: 'p-hoodie',
          category: 'apparel',
          quantity: 1,
          title: 'Buzo Pitbull Classic',
          price: 40000,
          sizeLabel: 'M',
        },
      ]),
    )
    renderShop()
    fireEvent.click(await screen.findByRole('button', { name: /Abrir mi pedido/ }))
    const bag = await screen.findByRole('dialog', { name: 'Tu pedido' })

    expect(within(bag).getByText(/Buzo Fundadores ya no está disponible/)).toBeTruthy()
    expect(within(bag).getByText(/cambió de precio: ahora \$ 48\.000/)).toBeTruthy()
  })
})

describe('Tienda — confirmar y pagar', () => {
  async function prepareCart() {
    renderShop()
    const drawer = await addHoodie()
    fireEvent.click(within(drawer).getByRole('radio', { name: 'M' }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Agregar al pedido/ }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Seguir mirando/ }))
  }

  it('efectivo: manda solo producto, talle y cantidad, vacía el carrito y muestra la referencia', async () => {
    service.createShopOrder.mockResolvedValue({ order: baseOrder(), accessToken: 'a'.repeat(43) })
    await prepareCart()
    const bag = await goToDetails()
    await screen.findByRole('radio', { name: /Efectivo en el lugar/ })
    fillBuyer(bag)
    fireEvent.click(within(bag).getByRole('radio', { name: /Efectivo en el lugar/ }))
    fireEvent.click(within(bag).getByRole('button', { name: /Confirmar pedido/ }))

    await waitFor(() => expect(service.createShopOrder).toHaveBeenCalledTimes(1))
    const payload = service.createShopOrder.mock.calls[0][0]
    expect(payload.paymentMethod).toBe('cash_on_site')
    expect(payload.items).toEqual([{ productId: 'p-hoodie', sizeLabel: 'M', quantity: 1 }])
    expect(JSON.stringify(payload)).not.toMatch(/price|amount|unitPrice/)
    expect(payload.buyer).toMatchObject({ name: 'Lucía Pérez', email: 'lucia@example.com' })

    expect(await within(bag).findByText('TND-AB3K9Z')).toBeTruthy()
    expect(await within(bag).findByText(/Sede Banfield/)).toBeTruthy()
    expect(window.localStorage.getItem('plu.shop.cart.v1')).toBeNull()
  })

  it('Mercado Pago: crea el pedido y redirige al checkout del proveedor', async () => {
    service.createShopOrder.mockResolvedValue({
      order: baseOrder({ paymentMethod: 'mercado_pago' }),
      accessToken: 'b'.repeat(43),
    })
    service.startShopPayment.mockResolvedValue({
      initPoint: 'https://www.mercadopago.com.ar/checkout/x',
    })
    await prepareCart()
    const bag = await goToDetails()
    await screen.findByRole('radio', { name: /Mercado Pago/ })
    fillBuyer(bag)
    fireEvent.click(within(bag).getByRole('button', { name: /Confirmar pedido/ }))

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://www.mercadopago.com.ar/checkout/x'),
    )
    expect(service.startShopPayment).toHaveBeenCalledWith(
      '3f2b5d1e-1111-4222-8333-444455556666',
      'b'.repeat(43),
    )
  })

  it('Mercado Pago: si no se puede abrir el pago el pedido queda reservado con su botón', async () => {
    service.createShopOrder.mockResolvedValue({
      order: baseOrder({ paymentMethod: 'mercado_pago' }),
      accessToken: 'b'.repeat(43),
    })
    service.startShopPayment.mockRejectedValue(new Error('caído'))
    service.fetchShopOrder.mockResolvedValue(baseOrder({ paymentMethod: 'mercado_pago' }))
    await prepareCart()
    const bag = await goToDetails()
    await screen.findByRole('radio', { name: /Mercado Pago/ })
    fillBuyer(bag)
    fireEvent.click(within(bag).getByRole('button', { name: /Confirmar pedido/ }))

    expect(await within(bag).findByRole('button', { name: /Pagar con Mercado Pago/ })).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
  })

  it('solo ofrece los medios abiertos', async () => {
    service.fetchShopCheckout.mockResolvedValue({
      open: true,
      methods: { mercado_pago: false, bank_transfer: false, cash_on_site: true },
    })
    await prepareCart()
    const bag = await goToDetails()
    await within(bag).findByRole('radio', { name: /Efectivo en el lugar/ })
    expect(within(bag).queryByRole('radio', { name: /Mercado Pago/ })).toBeNull()
    expect(within(bag).queryByRole('radio', { name: /Transferencia/ })).toBeNull()
  })

  it('con la tienda cerrada lo dice en lugar de mostrar un formulario que va a fallar', async () => {
    service.fetchShopCheckout.mockResolvedValue({ open: false, methods: {} })
    await prepareCart()
    const bag = await goToDetails()
    expect(await within(bag).findByText(/no está cobrando/)).toBeTruthy()
    expect(within(bag).queryByRole('button', { name: /Confirmar pedido/ })).toBeNull()
  })

  it('un rechazo del servidor (sin stock) se muestra y deja volver al pedido', async () => {
    service.createShopOrder.mockRejectedValue(new Error('No hay stock suficiente de "Buzo".'))
    await prepareCart()
    const bag = await goToDetails()
    await screen.findByRole('radio', { name: /Efectivo en el lugar/ })
    fillBuyer(bag)
    fireEvent.click(within(bag).getByRole('button', { name: /Confirmar pedido/ }))

    expect((await within(bag).findByRole('alert')).textContent).toMatch(/No hay stock suficiente/)
    expect(window.localStorage.getItem('plu.shop.cart.v1')).not.toBeNull()
  })
})

describe('Tienda — estado del pedido', () => {
  const openOrder = async () => {
    renderShop()
    fireEvent.click(await screen.findByRole('tab', { name: /Cursos/ }))
    return null
  }

  it('entrar desde el link del correo abre el pedido y limpia la dirección', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    window.location.search = '?pedido=3f2b5d1e-1111-4222-8333-444455556666'
    window.location.hash = `#t=${'c'.repeat(43)}`
    service.fetchShopOrder.mockResolvedValue(
      baseOrder({
        paymentMethod: 'bank_transfer',
        payment: {
          method: 'bank_transfer',
          bankDetails: {
            alias: 'plu.tienda',
            cbu: '0000003100000000000001',
            holder: 'PLU Argentina',
          },
          cashInstructions: '',
          fulfillmentNote: '',
        },
      }),
    )
    await openOrder()

    expect(await screen.findByText('Esperando la transferencia')).toBeTruthy()
    expect(service.fetchShopOrder).toHaveBeenCalledWith(
      '3f2b5d1e-1111-4222-8333-444455556666',
      'c'.repeat(43),
    )
    expect(screen.getByText('plu.tienda')).toBeTruthy()
    expect(replaceState).toHaveBeenCalledWith(null, '', '/tienda')
    replaceState.mockRestore()
  })

  it('al volver de Mercado Pago pide al servidor que verifique el pago y muestra el resultado', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    window.location.search =
      '?pedido=3f2b5d1e-1111-4222-8333-444455556666&pago=success&payment_id=999'
    window.localStorage.setItem(
      'plu.shop.orders.v1',
      JSON.stringify({ '3f2b5d1e-1111-4222-8333-444455556666': 'd'.repeat(43) }),
    )
    service.reconcileShopOrder.mockResolvedValue({
      reconciled: true,
      outcome: 'approved',
      order: baseOrder({ paymentMethod: 'mercado_pago', status: 'aprobado' }),
    })
    await openOrder()

    expect(await screen.findByText('Pago acreditado')).toBeTruthy()
    expect(service.reconcileShopOrder).toHaveBeenCalledWith(
      '3f2b5d1e-1111-4222-8333-444455556666',
      'd'.repeat(43),
      '999',
    )
    replaceState.mockRestore()
  })

  it('un pedido que no se encuentra no se confunde con un corte de red', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    window.location.search = '?pedido=3f2b5d1e-1111-4222-8333-444455556666'
    window.location.hash = `#t=${'e'.repeat(43)}`
    service.fetchShopOrder.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 403 }))
    await openOrder()
    expect((await screen.findByRole('alert')).textContent).toMatch(/No encontramos el pedido/)
    cleanup()

    window.location.hash = `#t=${'e'.repeat(43)}`
    service.fetchShopOrder.mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 }))
    await openOrder()
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos cargar tu pedido/)
    replaceState.mockRestore()
  })

  it('transferencia: sube el comprobante y lo confirma', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
    window.location.search = '?pedido=3f2b5d1e-1111-4222-8333-444455556666'
    window.location.hash = `#t=${'f'.repeat(43)}`
    const transfer = baseOrder({
      paymentMethod: 'bank_transfer',
      payment: {
        method: 'bank_transfer',
        bankDetails: { alias: 'plu.tienda', cbu: '', holder: '' },
        cashInstructions: '',
        fulfillmentNote: '',
      },
    })
    service.fetchShopOrder.mockResolvedValue(transfer)
    service.uploadShopOrderProof.mockResolvedValue({ ...transfer, hasProof: true })
    await openOrder()
    await screen.findByText('Esperando la transferencia')

    const input = document.querySelector('input[type=file]')
    const file = new File(['x'], 'comp.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/Comprobante recibido/)).toBeTruthy()
    expect(service.uploadShopOrderProof).toHaveBeenCalledWith(
      '3f2b5d1e-1111-4222-8333-444455556666',
      'f'.repeat(43),
      file,
    )
    replaceState.mockRestore()
  })
})
