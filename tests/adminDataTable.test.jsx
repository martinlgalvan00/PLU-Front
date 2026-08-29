import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import AdminDataTable from '../src/components/admin/AdminDataTable.jsx'

const originalInnerWidth = window.innerWidth

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  cleanup()
  setViewportWidth(originalInnerWidth)
})

const columns = [
  { key: 'name', label: 'Nombre', mobile: 'primary' },
  { key: 'document', label: 'Documento', mobile: 'hidden' },
  { key: 'status', label: 'Estado', mobile: 'badge', render: (row) => row.status },
  {
    key: 'action',
    label: 'Acción',
    mobile: 'action',
    render: () => <button type="button">Validar</button>,
  },
]

const rows = [{ id: '1', name: 'Juana Pérez', document: '12345678', status: 'activo' }]

/**
 * `AdminDataTable` ocultaba columnas `mobile: 'hidden'` leyendo
 * `window.innerWidth` una sola vez al montar, así que redimensionar la
 * ventana (o rotar un tablet) no volvía a mostrar/ocultar nada. El fix
 * escucha `resize` -- este test lo dispara y confirma que la columna
 * reacciona en caliente, sin pasar por `matchMedia` (varios mocks de otras
 * pantallas lo simulan siempre en "no coincide", sin importar la query).
 */
describe('AdminDataTable — columnas responsive', () => {
  it('muestra u oculta una columna "hidden" al cambiar el viewport en caliente', async () => {
    setViewportWidth(1024)

    render(<AdminDataTable columns={columns} rows={rows} pagination={false} />)

    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Documento' })).toBeTruthy()

    setViewportWidth(480)

    await waitFor(() =>
      expect(screen.queryByRole('columnheader', { name: 'Documento' })).toBeNull(),
    )

    setViewportWidth(1024)

    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'Documento' })).toBeTruthy(),
    )
  })

  it('en viewport angosto renderiza cards compactas con primary/badge/action', async () => {
    setViewportWidth(480)

    const { container } = render(
      <AdminDataTable columns={columns} rows={rows} pagination={false} />,
    )

    await waitFor(() => {
      expect(container.querySelector('.admin-data-table-shell--cards')).toBeTruthy()
      expect(container.querySelector('.data-table-card--compact')).toBeTruthy()
    })

    expect(screen.queryByRole('columnheader', { name: 'Documento' })).toBeNull()
    expect(screen.getByText('Juana Pérez')).toBeTruthy()
    expect(screen.getByText('activo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Validar' })).toBeTruthy()
    expect(screen.queryByText('12345678')).toBeNull()
  })

  it('acepta getRowClassName legacy y lo aplica a la fila', async () => {
    setViewportWidth(1024)

    const { container } = render(
      <AdminDataTable
        columns={columns}
        rows={rows}
        pagination={false}
        getRowClassName={(row) => (row.id === '1' ? 'data-table__row--selected' : '')}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.data-table__row--selected')).toBeTruthy()
    })
  })

  it('en viewport angosto paginan las cards compactas', async () => {
    setViewportWidth(480)
    const manyRows = Array.from({ length: 30 }, (_, index) => ({
      id: String(index + 1),
      name: `Atleta ${index + 1}`,
      document: `${10000000 + index}`,
      status: 'activo',
    }))

    const { container } = render(
      <AdminDataTable columns={columns} rows={manyRows} pageSize={10} />,
    )

    await waitFor(() => {
      expect(container.querySelector('.admin-data-table-shell--cards')).toBeTruthy()
    })

    expect(container.querySelectorAll('.data-table-card--compact')).toHaveLength(10)
    expect(container.querySelector('.admin-data-table-shell__pagination')).toBeTruthy()
  })
})
