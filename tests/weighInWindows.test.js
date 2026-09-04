import { describe, expect, it } from 'vitest'
import {
  formatWeighInDay,
  formatWeighInSlotRange,
  groupWeighInWindowsByDay,
  normalizeWeighInWindows,
  suggestWeighInWindowsFromDays,
  weighInWindowFromForm,
  weighInWindowToForm,
  weighInWindowsNeedDayPrefill,
} from '../src/lib/weighInWindows.js'

const fridayMorning = {
  id: 'weighin-fri-am',
  label: 'Viernes',
  date: '2026-12-11',
  startsAt: '2026-12-11T09:00',
  endsAt: '2026-12-11T12:00',
  note: 'Pesaje adelantado.',
  sortOrder: 0,
}

const fridayEvening = {
  id: 'weighin-fri-pm',
  label: 'Viernes',
  date: '2026-12-11',
  startsAt: '2026-12-11T16:00',
  endsAt: '2026-12-11T19:00',
  note: 'Pesaje adelantado.',
  sortOrder: 1,
}

describe('weighInWindows', () => {
  it('descarta franjas incompletas y ordena por sortOrder', () => {
    expect(
      normalizeWeighInWindows([
        fridayEvening,
        { label: 'Sábado', startsAt: '', endsAt: '' },
        fridayMorning,
      ]),
    ).toEqual([fridayMorning, fridayEvening])
  })

  it('agrupa varias franjas del mismo día', () => {
    const groups = groupWeighInWindowsByDay([fridayMorning, fridayEvening])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: '2026-12-11',
      label: 'Viernes',
      notes: ['Pesaje adelantado.'],
    })
    expect(groups[0].slots.map((slot) => slot.id)).toEqual(['weighin-fri-am', 'weighin-fri-pm'])
  })

  /**
   * La fecha es `YYYY-MM-DD` de pared. Pasarla por `new Date('2026-12-11')` la
   * corre un día para atrás en cualquier huso al oeste de Greenwich -- o sea,
   * en el país -- y el público vería el pesaje el día equivocado.
   */
  it('nombra el día sin corrimiento de zona', () => {
    expect(formatWeighInDay('2026-12-11', 'es')).toMatch(/viernes/i)
    expect(formatWeighInDay('2026-12-11', 'es')).toMatch(/11/)
    expect(formatWeighInDay('2026-12-11', 'en')).toMatch(/friday/i)
    expect(formatWeighInDay('', 'es')).toBe('')
    expect(formatWeighInDay('no-es-fecha', 'es')).toBe('')
  })

  it('expone la fecha formateada como encabezado del día', () => {
    const [group] = groupWeighInWindowsByDay([fridayMorning], 'es')

    expect(group.date).toBe('2026-12-11')
    expect(group.dayLabel).toMatch(/viernes/i)
  })

  /**
   * Dos franjas el mismo día: el encabezado del grupo se queda con el label de
   * la primera, así que cada franja tiene que conservar el suyo o la segunda
   * queda sin nombre en público.
   */
  it('conserva el label de cada franja cuando comparten día', () => {
    const groups = groupWeighInWindowsByDay(
      [
        { ...fridayMorning, label: 'Viernes mañana' },
        { ...fridayEvening, label: 'Viernes tarde' },
      ],
      'es',
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].slots.map((slot) => slot.label)).toEqual([
      'Viernes mañana',
      'Viernes tarde',
    ])
  })

  it('formatea el rango con la hora de pared del panel', () => {
    expect(formatWeighInSlotRange(fridayMorning, 'es')).toBe('09:00 — 12:00')
    expect(formatWeighInSlotRange(fridayEvening, 'en')).toBe('16:00 — 19:00')
  })

  it('redondea ida y vuelta el formulario de Estructura', () => {
    const form = weighInWindowToForm(fridayMorning)
    expect(form).toMatchObject({
      label: 'Viernes',
      date: '2026-12-11',
      startTime: '09:00',
      endTime: '12:00',
      note: 'Pesaje adelantado.',
    })
    expect(weighInWindowFromForm(form, 0)).toMatchObject(fridayMorning)
  })

  it('completa franjas faltantes sin pisar fechas que ya tienen ventana', () => {
    const next = suggestWeighInWindowsFromDays(
      [
        { label: 'Viernes', date: '2026-12-11' },
        { label: 'Sábado', date: '2026-12-12' },
      ],
      [fridayMorning],
    )

    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({ date: '2026-12-11', startTime: '09:00', endTime: '12:00' })
    expect(next[1]).toMatchObject({
      date: '2026-12-12',
      label: 'Sábado',
      startTime: '08:00',
      endTime: '10:00',
    })
  })

  it('no sugiere prefill si cada día con fecha ya tiene franja', () => {
    expect(weighInWindowsNeedDayPrefill([{ date: '2026-12-11' }], [fridayMorning])).toBe(false)
    expect(
      weighInWindowsNeedDayPrefill(
        [
          { date: '2026-12-11' },
          { date: '2026-12-12' },
        ],
        [fridayMorning],
      ),
    ).toBe(true)
  })
})
