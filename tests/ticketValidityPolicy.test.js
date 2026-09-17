import { describe, expect, it } from 'vitest'
import {
  TICKET_ACCESS_POLICY_MODE,
  TICKET_ACCESS_USAGE_MODE,
  addCalendarDay,
  summarizeTicketQrValidity,
  ticketValidityDurationParts,
} from '../src/lib/ticketValidityPolicy.js'

const EVENT_DAYS = [
  { dayIndex: 0, label: 'Día 1', date: '2026-08-15' },
  { dayIndex: 1, label: 'Día 2', date: '2026-08-16' },
]

describe('ticketValidityPolicy', () => {
  it('suma un día de calendario sin pasar por la zona local', () => {
    expect(addCalendarDay('2026-08-15')).toBe('2026-08-16')
    expect(addCalendarDay('2026-08-31')).toBe('2026-09-01')
    expect(addCalendarDay('2026-12-31')).toBe('2027-01-01')
    expect(addCalendarDay('no-es-fecha')).toBeNull()
  })

  it('presenta la duración en la unidad más grande exacta', () => {
    expect(ticketValidityDurationParts(90)).toEqual({ value: 90, unit: 'minutes' })
    expect(ticketValidityDurationParts(12 * 60)).toEqual({ value: 12, unit: 'hours' })
    expect(ticketValidityDurationParts(2 * 24 * 60)).toEqual({ value: 2, unit: 'days' })
    expect(ticketValidityDurationParts(0)).toBeNull()
  })

  it('un día marcado es vigencia de un día, de 00:00 al día siguiente', () => {
    const summary = summarizeTicketQrValidity({ dayIndexes: [0] }, EVENT_DAYS)

    expect(summary).toMatchObject({
      kind: 'event_days',
      mode: TICKET_ACCESS_POLICY_MODE.EVENT_DAYS,
      usage: TICKET_ACCESS_USAGE_MODE.ONCE_TOTAL,
      dayCount: 1,
      labels: ['Día 1'],
      firstDate: '2026-08-15',
      lastDate: '2026-08-15',
      untilDate: '2026-08-16',
      coversAllDays: false,
    })
  })

  it('marcar todos los días cubre el evento entero', () => {
    const summary = summarizeTicketQrValidity({ dayIndexes: [0, 1] }, EVENT_DAYS)

    expect(summary.kind).toBe('event_days')
    expect(summary.dayCount).toBe(2)
    expect(summary.coversAllDays).toBe(true)
    expect(summary.untilDate).toBe('2026-08-17')
  })

  it('sin jornadas no hay vigencia que mostrar', () => {
    expect(summarizeTicketQrValidity({ dayIndexes: [] }, EVENT_DAYS).kind).toBe('missing')
  })

  it('conserva un ingreso por jornada cuando el modo es por días', () => {
    const summary = summarizeTicketQrValidity(
      { dayIndexes: [0, 1], accessUsageMode: TICKET_ACCESS_USAGE_MODE.ONCE_PER_EVENT_DAY },
      EVENT_DAYS,
    )

    expect(summary.usage).toBe(TICKET_ACCESS_USAGE_MODE.ONCE_PER_EVENT_DAY)
  })

  it('ventana fija incompleta queda como faltante', () => {
    expect(
      summarizeTicketQrValidity(
        {
          validityMode: TICKET_ACCESS_POLICY_MODE.FIXED_WINDOW,
          validFrom: '2026-08-15T09:00',
          dayIndexes: [0],
        },
        EVENT_DAYS,
      ).kind,
    ).toBe('missing')
  })

  it('ventana fija completa expone from/until crudos', () => {
    const summary = summarizeTicketQrValidity(
      {
        validityMode: TICKET_ACCESS_POLICY_MODE.FIXED_WINDOW,
        validFrom: '2026-08-15T09:00',
        validUntil: '2026-08-15T20:00',
        dayIndexes: [0],
      },
      EVENT_DAYS,
    )

    expect(summary).toMatchObject({
      kind: 'fixed_window',
      validFrom: '2026-08-15T09:00',
      validUntil: '2026-08-15T20:00',
    })
  })

  it('duración desde pago exige minutos', () => {
    expect(
      summarizeTicketQrValidity(
        { validityMode: TICKET_ACCESS_POLICY_MODE.FROM_PAYMENT, dayIndexes: [0] },
        EVENT_DAYS,
      ).kind,
    ).toBe('missing')

    expect(
      summarizeTicketQrValidity(
        {
          validityMode: TICKET_ACCESS_POLICY_MODE.FROM_PAYMENT,
          validityDurationMinutes: 12 * 60,
          dayIndexes: [0],
        },
        EVENT_DAYS,
      ),
    ).toMatchObject({
      kind: 'from_payment',
      durationMinutes: 12 * 60,
    })
  })

  it('duración desde el primer escaneo exige minutos', () => {
    expect(
      summarizeTicketQrValidity(
        { validityMode: TICKET_ACCESS_POLICY_MODE.FROM_FIRST_SCAN, dayIndexes: [0] },
        EVENT_DAYS,
      ).kind,
    ).toBe('missing')

    expect(
      summarizeTicketQrValidity(
        {
          validityMode: TICKET_ACCESS_POLICY_MODE.FROM_FIRST_SCAN,
          validityDurationMinutes: 6 * 60,
          dayIndexes: [0],
        },
        EVENT_DAYS,
      ),
    ).toMatchObject({
      kind: 'from_first_scan',
      durationMinutes: 6 * 60,
    })
  })
})
