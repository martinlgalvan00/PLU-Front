import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import RegistrationSheetImportDialog from '../src/components/admin/RegistrationSheetImportDialog.jsx'

afterEach(cleanup)

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

const PARSED = {
  ok: true,
  rows: [
    { row: 2, registrationId: ID_A, values: { category: 'Raw With Wraps' } },
    { row: 3, registrationId: ID_B, values: { declaredWeightClass: '44' } },
  ],
  issues: [{ row: 5, field: 'registrationId', code: 'ID_INVALID', value: 'abc' }],
  columns: ['registrationId', 'category', 'declaredWeightClass'],
  unknownColumns: ['Notas'],
}

const PREVIEW = {
  summary: { total: 2, changed: 1, unchanged: 0, invalid: 1, applied: 0, failed: 0 },
  rows: [
    {
      row: 2,
      registrationId: ID_A,
      athlete: 'Lucía Prueba',
      event: 'Barbell Submission',
      state: 'changed',
      changes: [{ field: 'category', from: 'Raw', to: 'Raw With Wraps' }],
      warnings: [{ field: 'bodyweightKg', code: 'BODYWEIGHT_OVER_CLASS' }],
      errors: [],
    },
    {
      row: 3,
      registrationId: ID_B,
      athlete: 'Juan Prueba',
      state: 'invalid',
      changes: [],
      warnings: [],
      errors: [{ field: 'declaredWeightClass', code: 'WEIGHT_CLASS_INVALID', value: '44' }],
    },
  ],
}

function renderDialog(props = {}) {
  const handlers = {
    onClose: vi.fn(),
    onApplied: vi.fn(),
    readFile: vi.fn().mockResolvedValue(PARSED),
    previewRows: vi.fn().mockResolvedValue(PREVIEW),
    applyRows: vi.fn().mockResolvedValue({
      summary: { total: 1, changed: 0, unchanged: 0, invalid: 0, applied: 1, failed: 0 },
      rows: [{ ...PREVIEW.rows[0], state: 'applied' }],
    }),
    ...props,
  }
  render(
    <I18nProvider>
      <RegistrationSheetImportDialog {...handlers} />
    </I18nProvider>,
  )
  return handlers
}

function pickFile(name = 'inscripciones.xlsx') {
  const input = document.querySelector('input[type="file"]')
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } })
}

describe('RegistrationSheetImportDialog', () => {
  it('muestra los cambios y los errores antes de aplicar', async () => {
    const handlers = renderDialog()
    pickFile()

    expect(await screen.findByText('Cambios a aplicar')).toBeTruthy()
    expect(handlers.previewRows).toHaveBeenCalledWith(PARSED.rows, expect.objectContaining({ eventSlug: null }))
    expect(screen.getByText('1 con cambios')).toBeTruthy()
    // Error del servidor + error del archivo, por número de fila.
    expect(screen.getByText('2 con errores')).toBeTruthy()
    expect(screen.getByText(/no corresponde al sexo del atleta/)).toBeTruthy()
    expect(screen.getByText(/El ID "abc" no es válido/)).toBeTruthy()
    expect(screen.getByText('El peso supera la categoría de peso.')).toBeTruthy()
    expect(screen.getByText(/Columnas que no se reconocen y se ignoran: Notas/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aplicar 1 cambio' })).toBeTruthy()
  })

  it('aplica solo las filas con cambios y avisa al cerrar para refrescar', async () => {
    const handlers = renderDialog()
    pickFile()
    fireEvent.click(await screen.findByRole('button', { name: 'Aplicar 1 cambio' }))

    expect(await screen.findByText('Se actualizó 1 inscripción')).toBeTruthy()
    expect(handlers.applyRows).toHaveBeenCalledWith([PARSED.rows[0]], expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(handlers.onApplied).toHaveBeenCalledTimes(1)
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('rechaza un archivo que no es .xlsx sin leerlo', async () => {
    const handlers = renderDialog()
    pickFile('inscripciones.csv')

    expect((await screen.findByRole('alert')).textContent).toMatch(/tiene que ser \.xlsx/)
    expect(handlers.readFile).not.toHaveBeenCalled()
  })

  it('explica por qué no sirve la planilla', async () => {
    renderDialog({
      readFile: vi.fn().mockResolvedValue({ ok: false, error: 'NO_HEADER', rows: [], issues: [] }),
    })
    pickFile()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/columna "ID inscripción"/),
    )
  })

  it('sin cambios no deja aplicar', async () => {
    renderDialog({
      previewRows: vi.fn().mockResolvedValue({
        summary: { total: 1, changed: 0, unchanged: 1, invalid: 0 },
        rows: [{ row: 2, registrationId: ID_A, state: 'unchanged', changes: [], errors: [] }],
      }),
      readFile: vi.fn().mockResolvedValue({ ...PARSED, issues: [], unknownColumns: [] }),
    })
    pickFile()

    expect(await screen.findByText(/no hay nada para aplicar/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aplicar 0 cambios' }).disabled).toBe(true)
  })
})
