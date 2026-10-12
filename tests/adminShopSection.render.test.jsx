import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const hoodie = {
  id: 'p1',
  slug: 'buzo',
  title: 'Buzo Pitbull Classic',
  category: 'apparel',
  description: '',
  price: 48000,
  stock: 0,
  sizes: [{ label: 'M', stock: 5 }],
  imagePaths: [],
  imageUrls: [],
  status: 'published',
  featured: true,
  sortOrder: 0,
}
const course = {
  ...hoodie,
  id: 'p2',
  slug: 'curso',
  title: 'Curso de jueces',
  category: 'course',
  sizes: [],
  courseStartsAt: '2027-03-20T16:00:00.000Z',
  courseModality: 'presencial',
  featured: false,
  status: 'draft',
}

vi.mock('../src/services/shopService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAdminShopProducts: vi.fn(),
  saveAdminShopProduct: vi.fn(),
  deleteAdminShopProduct: vi.fn(),
}))

const service = await import('../src/services/shopService.js')
const ShopSection = (await import('../src/pages/admin/ShopSection.jsx')).default

const EVENTS = [{ id: 'e1', title: 'Pitbull Classic' }]

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <ShopSection canEdit events={EVENTS} {...props} />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.mocked(service.fetchAdminShopProducts).mockReset().mockResolvedValue([hoodie, course])
  vi.mocked(service.saveAdminShopProduct).mockReset().mockResolvedValue({})
  vi.mocked(service.deleteAdminShopProduct).mockReset().mockResolvedValue({})
})

afterEach(cleanup)

describe('Admin — catálogo de la tienda', () => {
  it('lista el catálogo real con estado, conteos y filtro por familia', async () => {
    renderSection()

    expect(await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' })).toBeTruthy()
    expect(screen.getByText('2 en catálogo')).toBeTruthy()
    expect(screen.getByText('1 publicados')).toBeTruthy()

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Filtrar por categoría' })).getByRole('button', {
        name: 'Curso',
      }),
    )
    expect(screen.queryByRole('button', { name: 'Editar Buzo Pitbull Classic' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Editar Curso de jueces' })).toBeTruthy()
  })

  it('con el catálogo vacío invita a cargar el primer producto', async () => {
    vi.mocked(service.fetchAdminShopProducts).mockResolvedValue([])
    renderSection()

    expect(
      await screen.findByText('Catálogo vacío. Publicá el primer producto oficial.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nuevo producto/ })).toBeTruthy()
  })

  it('si no carga muestra el error con reintento y no un catálogo vacío', async () => {
    vi.mocked(service.fetchAdminShopProducts).mockRejectedValueOnce(new Error('Sin conexión'))
    renderSection()

    expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' })).toBeTruthy()
  })

  it('sin permiso de edición no ofrece alta ni abre la edición', async () => {
    renderSection({ canEdit: false })

    const tile = await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' })
    expect(tile.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: /Nuevo producto/ })).toBeNull()
  })

  it('no guarda sin nombre ni precio y lo explica', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Ingresá el nombre del producto.',
    )
    expect(service.saveAdminShopProduct).not.toHaveBeenCalled()
  })

  it('una exclusiva publicada exige torneo y, con torneo, guarda y recarga el catálogo', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Familia'), { target: { value: 'exclusive' } })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), {
      target: { value: 'Remera finalista' },
    })
    fireEvent.change(within(dialog).getByLabelText('Precio (ARS)'), { target: { value: '32000' } })
    fireEvent.change(within(dialog).getByLabelText('Estado'), { target: { value: 'published' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Elegí el torneo de la exclusiva para publicarla.',
    )
    expect(service.saveAdminShopProduct).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText('Torneo'), { target: { value: 'e1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))

    await waitFor(() =>
      expect(service.saveAdminShopProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'exclusive',
          eventId: 'e1',
          title: 'Remera finalista',
        }),
      ),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.fetchAdminShopProducts).toHaveBeenCalledTimes(2)
  })

  it('un curso publicado exige fecha y un borrador no', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Familia'), { target: { value: 'course' } })
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Taller' } })
    fireEvent.change(within(dialog).getByLabelText('Precio (ARS)'), { target: { value: '30000' } })
    fireEvent.change(within(dialog).getByLabelText('Estado'), { target: { value: 'published' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Cargá la fecha y la modalidad del curso para publicarlo.',
    )

    fireEvent.change(within(dialog).getByLabelText('Estado'), { target: { value: 'draft' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))
    await waitFor(() => expect(service.saveAdminShopProduct).toHaveBeenCalledTimes(1))
  })

  it('si el guardado falla deja el formulario abierto con el motivo', async () => {
    vi.mocked(service.saveAdminShopProduct).mockRejectedValueOnce(new Error('Slug duplicado'))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Slug duplicado')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('eliminar pide confirmación inline antes de borrar', async () => {
    renderSection()
    await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' })

    fireEvent.click(screen.getAllByRole('button', { name: /^Eliminar/ })[0])
    expect(service.deleteAdminShopProduct).not.toHaveBeenCalled()

    const firstTile = screen.getAllByRole('listitem')[0]
    fireEvent.click(await within(firstTile).findByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(service.deleteAdminShopProduct).toHaveBeenCalledWith('p1'))
  })
})
