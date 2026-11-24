import { expect, userEvent, within } from 'storybook/test'
import PaymentProofsPanel from './PaymentProofsPanel.jsx'
import { AdminPreviewShell } from '../../pages/admin/adminPreviewShell.jsx'

/**
 * Archivo de comprobantes dentro del shell real. Los endpoints se interceptan a
 * nivel `fetch` para que el panel recorra su camino completo.
 */

export default {
  title: 'Admin/Archivo de comprobantes',
  parameters: { layout: 'fullscreen' },
}

const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

function mockProofs({
  summary,
  settings,
  forecast,
  draftForecast = forecast,
  trash = { count: 0, dueForPurge: 0, graceDays: 30 },
  trashItems = [],
}) {
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
    if (url.includes('/api/payment-proofs/summary'))
      return json({ summary, settings, forecast, trash })
    if (url.includes('/api/payment-proofs/forecast')) return json({ forecast: draftForecast })
    if (url.includes('/api/payment-proofs/trash'))
      return json({ items: trashItems, total: trashItems.length, graceDays: trash.graceDays })
    return original(input, init)
  }
  return () => {
    globalThis.fetch = original
  }
}

function Screen({ canEdit = true }) {
  return (
    <AdminPreviewShell section="payments">
      <PaymentProofsPanel canEdit={canEdit} />
    </AdminPreviewShell>
  )
}

const SUMMARY = { onServer: 42, notDownloaded: 17, downloaded: 25, deleted: 8 }

export const ConservarTodo = {
  beforeEach: () =>
    mockProofs({
      summary: SUMMARY,
      settings: { mode: 'keep', days: 30, graceDays: 30, updatedAt: '2026-10-12T15:00:00.000Z' },
      forecast: null,
    }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Comprobantes')).toBeTruthy()
    await expect(canvas.queryByText(/Van a la papelera/)).toBeNull()
  },
}

export const PapeleraConComprobantesSinCopia = {
  beforeEach: () =>
    mockProofs({
      summary: SUMMARY,
      settings: {
        mode: 'after_days',
        days: 10,
        graceDays: 30,
        updatedAt: '2026-10-12T15:00:00.000Z',
      },
      forecast: {
        mode: 'after_days',
        days: 10,
        windowDays: 7,
        count: 9,
        notDownloaded: 6,
        dueNow: 2,
        nextDueAt: '2026-10-14T03:30:00.000Z',
      },
    }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toBeTruthy()
    await expect(await canvas.findByText(/Sin descargar: 6/)).toBeTruthy()
  },
}

export const ConfirmarEnvioAPapelera = {
  beforeEach: () =>
    mockProofs({
      summary: SUMMARY,
      settings: { mode: 'keep', days: 30, graceDays: 30, updatedAt: null },
      forecast: null,
      draftForecast: {
        mode: 'after_days',
        days: 10,
        windowDays: 7,
        count: 12,
        notDownloaded: 6,
        dueNow: 0,
        nextDueAt: '2026-10-15T03:30:00.000Z',
      },
    }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByLabelText(/Papelera a los N días de aprobar/))
    const plazo = within(await canvas.findByRole('radiogroup', { name: 'Plazo' }))
    await userEvent.click(plazo.getByLabelText('10 días'))
    await canvas.findByText(/Con esta configuración/)
    await userEvent.click(canvas.getByRole('button', { name: 'Guardar política' }))
    await expect(await canvas.findByRole('button', { name: 'Sí, activar' })).toBeTruthy()
  },
}

export const SoloLectura = {
  beforeEach: () =>
    mockProofs({
      summary: SUMMARY,
      settings: {
        mode: 'after_export',
        days: 7,
        graceDays: 30,
        updatedAt: '2026-10-12T15:00:00.000Z',
      },
      forecast: {
        mode: 'after_export',
        days: 7,
        windowDays: 7,
        count: 0,
        notDownloaded: 0,
        dueNow: 0,
        nextDueAt: '2026-10-19T12:00:00.000Z',
      },
    }),
  render: () => <Screen canEdit={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/Sólo quien puede aprobar pagos cambia/)).toBeTruthy()
  },
}

export const PapeleraConArchivos = {
  beforeEach: () =>
    mockProofs({
      summary: SUMMARY,
      settings: { mode: 'keep', days: 30, graceDays: 30, updatedAt: '2026-10-12T15:00:00.000Z' },
      forecast: null,
      trash: { count: 3, dueForPurge: 1, graceDays: 30 },
      trashItems: [
        {
          id: 'f1',
          source: 'athlete',
          reference: 'RORD-ca7eb9266bda620c',
          person: 'Lucía Fernández',
          reason: 'superseded',
          deletedAt: '2026-10-10T15:00:00.000Z',
          purgeAt: '2999-01-01T00:00:00.000Z',
          exportedAt: '2026-10-11T15:00:00.000Z',
          restorable: true,
        },
        {
          id: 'f2',
          source: 'ticket',
          reference: 'TORD-1234567890ab',
          person: 'Marcos Gómez',
          reason: 'retention',
          deletedAt: '2026-09-01T15:00:00.000Z',
          purgeAt: '2026-10-01T15:00:00.000Z',
          exportedAt: null,
          restorable: false,
        },
        {
          id: 'f3',
          source: 'shop',
          reference: null,
          person: null,
          reason: 'orphan',
          deletedAt: '2026-10-12T15:00:00.000Z',
          purgeAt: '2999-01-01T00:00:00.000Z',
          exportedAt: null,
          restorable: true,
        },
      ],
    }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Ver papelera \(3\)/ }))
    await expect(await canvas.findByText('Lucía Fernández')).toBeTruthy()
    await expect(canvas.getByText('Sin identificar')).toBeTruthy()
    // Pasado el período, no se promete restaurar.
    await expect(canvas.getByText(/No se puede restaurar/)).toBeTruthy()
    await expect(canvas.getByRole('button', { name: 'Vaciar papelera' })).toBeTruthy()
  },
}
