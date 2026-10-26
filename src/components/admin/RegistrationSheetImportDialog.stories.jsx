import { expect, userEvent, waitFor, within } from 'storybook/test'
import '../../styles/pages/admin.css'
import RegistrationSheetImportDialog from './RegistrationSheetImportDialog.jsx'

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const PARSED = {
  ok: true,
  rows: [2, 3, 4, 5].map((row) => ({ row, registrationId: ID(row), values: {} })),
  issues: [{ row: 7, field: 'registrationId', code: 'ID_INVALID', value: 'fila sin ID' }],
  columns: [],
  unknownColumns: [],
}

const PREVIEW = {
  summary: { total: 4, changed: 3, unchanged: 0, invalid: 1, applied: 0, failed: 0 },
  rows: [
    {
      row: 2,
      registrationId: ID(2),
      athlete: 'Agostina Suarez',
      event: 'Barbell Submission',
      state: 'changed',
      changes: [
        { field: 'division', from: 'Open', to: 'Junior' },
        { field: 'modalities', from: ['full_power'], to: ['full_power', 'bench'] },
      ],
      warnings: [],
      errors: [],
    },
    {
      row: 3,
      registrationId: ID(3),
      athlete: 'Martín Gómez',
      event: 'Barbell Submission',
      state: 'changed',
      changes: [
        { field: 'declaredWeightClass', from: '82,5', to: '90' },
        { field: 'bodyweightKg', from: 81.2, to: 86.4 },
      ],
      warnings: [],
      errors: [],
    },
    {
      row: 4,
      registrationId: ID(4),
      athlete: 'Lucía Fernández',
      event: 'Barbell Submission',
      state: 'changed',
      changes: [{ field: 'bodyweightKg', from: 59.5, to: 61 }],
      warnings: [{ field: 'bodyweightKg', code: 'BODYWEIGHT_OVER_CLASS' }],
      errors: [],
    },
    {
      row: 5,
      registrationId: ID(5),
      athlete: 'Juan Pérez',
      event: 'Barbell Submission',
      state: 'invalid',
      changes: [],
      warnings: [],
      errors: [{ field: 'declaredWeightClass', code: 'WEIGHT_CLASS_INVALID', value: '44' }],
    },
  ],
}

const injected = {
  readFile: async () => PARSED,
  previewRows: async () => PREVIEW,
  applyRows: async () => ({
    summary: { total: 3, changed: 0, unchanged: 0, invalid: 0, applied: 3, failed: 0 },
    rows: PREVIEW.rows.slice(0, 3).map((row) => ({ ...row, state: 'applied' })),
  }),
}

export default {
  title: 'Admin/RegistrationSheetImportDialog',
  component: RegistrationSheetImportDialog,
  parameters: { layout: 'fullscreen' },
  args: { onClose: () => {}, onApplied: () => {}, ...injected },
}

/** Primer paso: elegir el .xlsx exportado desde la tabla. */
export const ElegirArchivo = {}

async function uploadSheet(canvasElement) {
  const body = within(canvasElement.ownerDocument.body)
  const input = canvasElement.ownerDocument.querySelector('input[type="file"]')
  await userEvent.upload(input, new File(['x'], 'inscripciones-barbell.xlsx'))
  return body
}

/** Vista previa: qué cambia por fila y qué no se va a aplicar, antes de guardar. */
export const VistaPrevia = {
  args: { eventSlug: 'barbell-submission-2027', eventLabel: 'Barbell Submission' },
  play: async ({ canvasElement }) => {
    const body = await uploadSheet(canvasElement)
    const heading = await body.findByText('Cambios a aplicar')
    await waitFor(() => expect(heading).toBeVisible())
    await expect(body.getByRole('button', { name: 'Aplicar 3 cambios' })).toBeEnabled()
  },
}

/** Resultado: cuántas se actualizaron (y cuáles fallaron, si alguna). */
export const Aplicado = {
  play: async ({ canvasElement }) => {
    const body = await uploadSheet(canvasElement)
    await userEvent.click(await body.findByRole('button', { name: 'Aplicar 3 cambios' }))
    const done = await body.findByText('Se actualizaron 3 inscripciones')
    await waitFor(() => expect(done).toBeVisible())
  },
}
