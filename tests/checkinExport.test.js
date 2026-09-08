import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCheckinListExportRows, downloadCheckinListExcel } from '../src/services/checkinExport.js'

const t = (key) =>
  ({
    'admin.columns.attendee': 'Asistente',
    'admin.columns.document': 'Documento',
    'admin.checkin.type': 'Tipo',
    'admin.columns.category': 'Categoría',
    'admin.checkin.dayLabel': 'Día',
    'admin.columns.status': 'Estado',
    'admin.checkinApp.admitted': 'Ingresó',
    'admin.checkinApp.title': 'Control de ingreso',
    'admin.checkin.athlete': 'Atleta',
    'admin.checkin.spectator': 'Espectador',
    'admin.checkin.bothDays': 'Ambos',
    'admin.checkin.scheduleUnassigned': 'Día a confirmar',
  })[key] ?? key

const eventDays = [
  { dayIndex: 0, label: 'Día 1' },
  { dayIndex: 1, label: 'Día 2' },
]

describe('checkinExport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('arma filas de Excel con nombre, DNI y estado legible', () => {
    const rows = buildCheckinListExportRows(
      [
        {
          name: 'Martina Rivas',
          document: '40111222',
          type: 'atleta',
          meta: 'Raw · Open',
          dayIndexes: [0],
          status: 'pagada',
          checkedInAt: '',
        },
      ],
      { eventDays, t },
    )

    expect(rows).toEqual([
      {
        Asistente: 'Martina Rivas',
        Documento: '40111222',
        Tipo: 'Atleta',
        Categoría: 'Raw · Open',
        Día: 'Día 1',
        Estado: 'Pagada',
        Ingresó: '',
      },
    ])
  })

  it('descarga un .xls y no dispara archivo vacío', () => {
    const click = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:checkin'),
      revokeObjectURL: vi.fn(),
    })
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = click

    try {
      expect(downloadCheckinListExcel({ rows: [], eventDays, eventSlug: 'pitbull', t })).toBe(false)
      expect(click).not.toHaveBeenCalled()

      expect(
        downloadCheckinListExcel({
          rows: [
            {
              name: 'Ana',
              document: '1',
              type: 'espectador',
              dayIndexes: 'all',
              status: 'pagada',
            },
          ],
          eventDays,
          eventSlug: 'Pitbull Classic 2026',
          t,
        }),
      ).toBe(true)
      expect(click).toHaveBeenCalledTimes(1)
    } finally {
      HTMLAnchorElement.prototype.click = originalClick
    }
  })
})
