import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminDataTable from '../src/components/admin/AdminDataTable.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

function renderTable(ui) {
  return render(<I18nProvider>{ui}</I18nProvider>)
}

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

    renderTable(<AdminDataTable columns={columns} rows={rows} pagination={false} />)

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

    const { container } = renderTable(
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

    const { container } = renderTable(
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

    const { container } = renderTable(
      <AdminDataTable columns={columns} rows={manyRows} pageSize={10} />,
    )

    await waitFor(() => {
      expect(container.querySelector('.admin-data-table-shell--cards')).toBeTruthy()
    })

    expect(container.querySelectorAll('.data-table-card--compact')).toHaveLength(10)
    expect(container.querySelector('.admin-data-table-shell__pagination')).toBeTruthy()
  })
})

describe('AdminDataTable — selección en cards', () => {
  it('en viewport angosto muestra checkbox por fila cuando hay rowSelection', async () => {
    setViewportWidth(480)
    const onChange = vi.fn()

    renderTable(
      <AdminDataTable
        columns={columns}
        rows={rows}
        pagination={false}
        getRowSelectLabel={(row) => `Seleccionar a ${row.name}`}
        rowSelection={{ selectedRowKeys: [], onChange }}
      />,
    )

    const rowCheckbox = await screen.findByRole('checkbox', { name: 'Seleccionar a Juana Pérez' })
    expect(screen.getByRole('checkbox', { name: 'Seleccionar esta página (1)' })).toBeTruthy()
    expect(screen.getByText('Esta página')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Juana Pérez' })).toBeNull()

    fireEvent.click(rowCheckbox)
    expect(onChange).toHaveBeenCalledWith(['1'])
  })

  it('con selectOnRowClick tilda la card y no dispara onRowClick', async () => {
    setViewportWidth(480)
    const onChange = vi.fn()
    const onRowClick = vi.fn()

    const { container } = renderTable(
      <AdminDataTable
        columns={columns}
        rows={rows}
        pagination={false}
        selectOnRowClick
        getRowSelectLabel={(row) => `Seleccionar a ${row.name}`}
        rowSelection={{ selectedRowKeys: [], onChange }}
        onRowClick={onRowClick}
        rowClassName="data-table__row--clickable"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.data-table-card--compact')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Juana Pérez'))
    expect(onChange).toHaveBeenCalledWith(['1'])
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('sin selectOnRowClick el click de la card abre la fila y no tilda', async () => {
    setViewportWidth(480)
    const onChange = vi.fn()
    const onRowClick = vi.fn()

    renderTable(
      <AdminDataTable
        columns={columns}
        rows={rows}
        pagination={false}
        getRowSelectLabel={(row) => `Seleccionar a ${row.name}`}
        rowSelection={{ selectedRowKeys: [], onChange }}
        onRowClick={onRowClick}
      />,
    )

    await screen.findByRole('checkbox', { name: 'Seleccionar a Juana Pérez' })
    fireEvent.click(screen.getByText('Juana Pérez'))
    expect(onRowClick).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})
