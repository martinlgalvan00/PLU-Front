import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

const PRODUCTS = [
  {
    id: 'p-hoodie',
    slug: 'buzo-pitbull',
    title: 'Buzo Pitbull Classic',
    category: 'apparel',
    description: 'Buzo oficial del torneo.',
    price: 48000,
    imageUrls: ['http://img/a.jpg', 'http://img/b.jpg'],
    sizes: [
      { label: 'S', inStock: true },
      { label: 'M', inStock: true },
      { label: 'XL', inStock: false },
    ],
    inStock: true,
    lowStock: false,
    featured: true,
    event: null,
    course: null,
  },
  {
    id: 'p-gone',
    slug: 'buzo-agotado',
    title: 'Buzo Fundadores',
    category: 'apparel',
    description: '',
    price: 52000,
    imageUrls: [],
    sizes: [],
    inStock: false,
    lowStock: false,
    featured: false,
    event: null,
    course: null,
  },
  {
    id: 'p-excl',
    slug: 'remera-finalista',
    title: 'Remera finalista',
    category: 'exclusive',
    description: '',
    price: 32000,
    imageUrls: [],
    sizes: [],
    inStock: true,
    lowStock: true,
    featured: false,
    editionNote: 'Edición limitada · 150 piezas',
    event: { id: 'e1', slug: 'pitbull', title: 'Pitbull Classic' },
    course: null,
  },
  {
    id: 'p-course',
    slug: 'curso-jueces',
    title: 'Curso de jueces PLU',
    category: 'course',
    description: 'Formación para jueces.',
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
  },
]

vi.mock('../src/services/shopService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPublicShopProducts: vi.fn(async () => PRODUCTS),
}))
vi.mock('../src/services/contactService.js', () => ({ submitContactMessage: vi.fn() }))

const ShopPage = (await import('../src/pages/ShopPage.jsx')).default
const { resetShopProductsCache } = await import('../src/hooks/useShopProducts.js')
const { submitContactMessage } = await import('../src/services/contactService.js')

function mockMatchMedia(matchesQuery) {
  window.matchMedia = (query) => ({
    matches: matchesQuery(query),
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

// Reduced motion: las secciones y el cajón se montan sin esperar transiciones.
beforeEach(() => {
  mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))
  resetShopProductsCache()
  vi.mocked(submitContactMessage).mockReset()
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

const openTab = (name) => fireEvent.click(screen.getByRole('tab', { name }))

describe('Tienda — catálogo público', () => {
  it('muestra las cuatro secciones con el conteo de lo publicado', async () => {
    renderShop()

    await waitFor(() => expect(screen.getByRole('tab', { name: /Ropa y accesorios/ })).toBeTruthy())
    expect(screen.getByRole('tab', { name: /Ropa y accesorios.*02/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Exclusivas.*01/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Cursos.*01/ })).toBeTruthy()
  })

  it('lista la ropa con una marca por tarjeta: destacado o agotado', async () => {
    renderShop()
    openTab(/Ropa y accesorios/)

    expect(await screen.findByText('Buzo Pitbull Classic')).toBeTruthy()
    expect(screen.getByText('Destacado')).toBeTruthy()
    expect(screen.getByText('Agotado')).toBeTruthy()
  })

  it('las exclusivas muestran el torneo y el rótulo de edición limitada', async () => {
    renderShop()
    openTab(/Exclusivas/)

    expect(await screen.findByText('Remera finalista')).toBeTruthy()
    expect(screen.getByText('Pitbull Classic')).toBeTruthy()
    expect(screen.getByText('Edición limitada · 150 piezas')).toBeTruthy()
  })

  it('el cajón deshabilita el talle sin stock y la consulta lo incluye en el mensaje', async () => {
    submitContactMessage.mockResolvedValue({ ok: true })
    renderShop()
    openTab(/Ropa y accesorios/)

    fireEvent.click(await screen.findByRole('button', { name: 'Buzo Pitbull Classic' }))
    const drawer = await screen.findByRole('dialog', { name: 'Buzo Pitbull Classic' })

    expect(within(drawer).getByRole('radio', { name: 'XL' }).disabled).toBe(true)
    fireEvent.click(within(drawer).getByRole('radio', { name: 'M' }))
    fireEvent.click(within(drawer).getByRole('button', { name: /Consultar por este producto/i }))

    fireEvent.change(within(drawer).getByLabelText(/^Nombre$/i), { target: { value: 'Lucía' } })
    fireEvent.change(within(drawer).getByLabelText(/^Email$/i), {
      target: { value: 'lucia@example.com' },
    })
    expect(within(drawer).getByLabelText(/^Mensaje$/i).value).toContain('talle M')
    fireEvent.click(within(drawer).getByRole('button', { name: /^Enviar$/i }))

    await waitFor(() =>
      expect(submitContactMessage).toHaveBeenCalledWith(
        expect.objectContaining({ motive: 'tienda', email: 'lucia@example.com' }),
      ),
    )
    expect(submitContactMessage.mock.calls[0][0].message).toContain('Buzo Pitbull Classic')
    expect(await within(drawer).findByText('Consulta enviada')).toBeTruthy()
  })

  it('un producto agotado no ofrece consulta y lo dice', async () => {
    renderShop()
    openTab(/Ropa y accesorios/)

    fireEvent.click(await screen.findByRole('button', { name: 'Buzo Fundadores' }))
    const drawer = await screen.findByRole('dialog', { name: 'Buzo Fundadores' })

    expect(within(drawer).getByText('Agotado')).toBeTruthy()
    expect(within(drawer).queryByRole('button', { name: /Consultar/i })).toBeNull()
  })

  it('un curso muestra modalidad, lugar y cupo y consulta la inscripción con su motivo', async () => {
    submitContactMessage.mockResolvedValue({ ok: true })
    renderShop()
    openTab(/Cursos/)

    const row = await screen.findByRole('button', { name: /Curso de jueces PLU/ })
    expect(row.textContent).toContain('Presencial')
    expect(row.textContent).toContain('24 lugares')
    fireEvent.click(row)

    const drawer = await screen.findByRole('dialog', { name: 'Curso de jueces PLU' })
    fireEvent.click(within(drawer).getByRole('button', { name: /Consultar inscripción/i }))
    fireEvent.change(within(drawer).getByLabelText(/^Nombre$/i), { target: { value: 'Ana' } })
    fireEvent.change(within(drawer).getByLabelText(/^Email$/i), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.click(within(drawer).getByRole('button', { name: /^Enviar$/i }))

    await waitFor(() =>
      expect(submitContactMessage).toHaveBeenCalledWith(
        expect.objectContaining({ motive: 'curso' }),
      ),
    )
  })

  it('con el catálogo vacío muestra "Próximamente" y ofrece el aviso por email', async () => {
    const { fetchPublicShopProducts } = await import('../src/services/shopService.js')
    vi.mocked(fetchPublicShopProducts).mockResolvedValueOnce([])
    renderShop()
    openTab(/Exclusivas/)

    expect(await screen.findByText(/Piezas que nacen en cada torneo/i)).toBeTruthy()
    expect(screen.getByText(/^Próximamente$/i)).toBeTruthy()
    expect(screen.getByLabelText(/Enterate primero/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Avisarme/i })).toBeTruthy()
  })

  it('si el catálogo no carga mantiene el "Próximamente", avisa y permite reintentar', async () => {
    const { fetchPublicShopProducts } = await import('../src/services/shopService.js')
    vi.mocked(fetchPublicShopProducts)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([])
    renderShop()
    openTab(/Ropa y accesorios/)

    expect(await screen.findByText(/La colección oficial está en camino/i)).toBeTruthy()
    expect((await screen.findByRole('status')).textContent).toMatch(/No pudimos actualizar/i)

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }))
    await waitFor(() => expect(screen.queryByText(/No pudimos actualizar/i)).toBeNull())
    expect(vi.mocked(fetchPublicShopProducts)).toHaveBeenCalledTimes(2)
  })
})
