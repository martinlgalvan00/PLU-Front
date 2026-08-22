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
]

const rows = [{ id: '1', name: 'Juana Pérez', document: '12345678' }]

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
})
