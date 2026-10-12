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

    // La familia se elige con chips (botones), no con un select.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Exclusiva de torneo' }))
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

    fireEvent.click(within(dialog).getByRole('button', { name: 'Curso' }))
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

  it('duplicar abre un producto nuevo como borrador, con el mismo contenido y sin destacar', async () => {
    renderSection()
    await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicar' })[0])
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('Nombre').value).toBe('Buzo Pitbull Classic (copia)')
    expect(within(dialog).getByLabelText('Estado').value).toBe('draft')
    expect(within(dialog).getByLabelText('Precio (ARS)').value).toBe('48000')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))
    await waitFor(() => expect(service.saveAdminShopProduct).toHaveBeenCalledTimes(1))
    const saved = vi.mocked(service.saveAdminShopProduct).mock.calls[0][0]
    expect(saved.id).toBeUndefined()
    expect(saved.featured).toBe(false)
    expect(saved.sizes).toEqual([{ label: 'M', stock: 5 }])
  })

  it('duplicar un curso deja la fecha vacía para cargar la nueva edición', async () => {
    renderSection()
    await screen.findByRole('button', { name: 'Editar Curso de jueces' })

    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicar' })[1])
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText('Nombre').value).toBe('Curso de jueces (copia)')
    expect(within(dialog).getByLabelText('Inicio').value).toBe('')
  })

  it('la curva completa carga todos los talles que faltan de una vez', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: '+ Curva completa' }))

    expect(dialog.querySelectorAll('.admin-shop-sizes__row')).toHaveLength(6)
    expect(within(dialog).queryByRole('button', { name: '+ Curva completa' })).toBeNull()
  })

  it('guardar y cargar otro deja el formulario listo para el siguiente producto', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Remera' } })
    fireEvent.change(within(dialog).getByLabelText('Precio (ARS)'), { target: { value: '25000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar y cargar otro' }))

    await waitFor(() => expect(service.saveAdminShopProduct).toHaveBeenCalledTimes(1))
    expect((await within(dialog).findByRole('status')).textContent).toBe(
      'Guardado: Remera. Cargá el siguiente.',
    )
    expect(within(dialog).getByLabelText('Nombre').value).toBe('')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('cerrar con cambios sin guardar pide confirmación; sin cambios cierra directo', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    let dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cancelar' })[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Gorra' } })
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cancelar' })[0])

    expect(within(dialog).getByText('¿Descartar los cambios sin guardar?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }))
    expect(within(dialog).getByLabelText('Nombre').value).toBe('Gorra')

    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cancelar' })[0])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(service.saveAdminShopProduct).not.toHaveBeenCalled()
  })

  it('no deja guardar talles repetidos', async () => {
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo producto/ }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Buzo' } })
    fireEvent.change(within(dialog).getByLabelText('Precio (ARS)'), { target: { value: '40000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Otro' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '+ Otro' }))
    const labels = dialog.querySelectorAll('.admin-shop-sizes__label')
    fireEvent.change(labels[0], { target: { value: 'M' } })
    fireEvent.change(labels[1], { target: { value: 'm' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar en catálogo' }))

    expect((await within(dialog).findByRole('alert')).textContent).toBe('Hay talles repetidos.')
    expect(service.saveAdminShopProduct).not.toHaveBeenCalled()
  })

  it('al editar trae el stock vigente y no el del listado viejo', async () => {
    renderSection()
    await screen.findByRole('button', { name: 'Editar Buzo Pitbull Classic' })
    vi.mocked(service.fetchAdminShopProducts).mockResolvedValueOnce([
      { ...hoodie, sizes: [{ label: 'M', stock: 3 }] },
      course,
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Editar Buzo Pitbull Classic' }))
    const dialog = await screen.findByRole('dialog')

    expect(dialog.querySelector('.admin-shop-sizes__stock').value).toBe('3')
  })
})
