import { describe, expect, it } from 'vitest'
import { normalizeAuditEntry } from '../src/services/auditService.js'
import {
  formatAuditDayLabel,
  formatAuditFactValue,
  formatAuditTime,
  groupAuditEntriesByDay,
  localDayKey,
  summarizeAuditEntry,
} from '../src/lib/auditFeed.js'

// Mediodía local: el día calendario no cambia aunque el test corra en otra zona.
const NOW = new Date(2026, 9, 11, 12, 0, 0)
const at = (day, hour = 10) => new Date(2026, 9, day, hour, 0, 0).toISOString()
const entry = (id, createdAt) => ({ id, createdAt })

describe('agrupar la bitácora por día', () => {
  it('separa hoy, ayer y días anteriores sin reordenar', () => {
    const groups = groupAuditEntriesByDay(
      [entry('a', at(11, 11)), entry('b', at(11, 9)), entry('c', at(10, 20)), entry('d', at(8))],
      NOW,
    )

    expect(groups.map((group) => group.kind)).toEqual(['today', 'yesterday', 'date'])
    expect(groups[0].entries.map((item) => item.id)).toEqual(['a', 'b'])
    expect(groups[2].entries.map((item) => item.id)).toEqual(['d'])
  })

  it('junta en un grupo propio los registros sin fecha válida', () => {
    const groups = groupAuditEntriesByDay([entry('x', 'no-es-fecha'), entry('y', at(11))], NOW)

    expect(groups.map((group) => group.kind)).toEqual(['unknown', 'today'])
    expect(groups[0].date).toBeNull()
  })

  it('cuando "Cargar más" trae un día ya visto, lo suma a su grupo', () => {
    const groups = groupAuditEntriesByDay(
      [entry('a', at(10, 20)), entry('b', at(9)), entry('c', at(10, 8))],
      NOW,
    )
    expect(groups.find((group) => group.kind === 'yesterday').entries).toHaveLength(2)
  })

  it('devuelve la lista vacía sin registros', () => {
    expect(groupAuditEntriesByDay([], NOW)).toEqual([])
  })

  it('la clave de día usa la fecha local, no UTC', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(localDayKey('basura')).toBeNull()
  })
})

describe('etiqueta del día', () => {
  const labels = { today: 'Hoy', yesterday: 'Ayer', now: NOW }

  it('usa palabras para hoy y ayer', () => {
    const [today, yesterday] = groupAuditEntriesByDay([entry('a', at(11)), entry('b', at(10))], NOW)
    expect(formatAuditDayLabel(today, labels)).toBe('Hoy')
    expect(formatAuditDayLabel(yesterday, labels)).toBe('Ayer')
  })

  it('para el resto escribe el día y omite el año actual', () => {
    const [group] = groupAuditEntriesByDay([entry('a', at(8))], NOW)
    const label = formatAuditDayLabel(group, labels)

    expect(label).toMatch(/8 de octubre/)
    expect(label).not.toMatch(/2026/)
    // Empieza con mayúscula, pero la preposición queda en minúscula.
    expect(label[0]).toBe(label[0].toUpperCase())
    expect(label).not.toMatch(/ De /)
  })

  it('agrega el año si el día es de otro año', () => {
    const old = { id: 'o', createdAt: new Date(2025, 11, 30, 10).toISOString() }
    const [group] = groupAuditEntriesByDay([old], NOW)
    expect(formatAuditDayLabel(group, labels)).toMatch(/2025/)
  })
})

describe('formato de datos', () => {
  it('muestra la hora local de 24 h', () => {
    expect(formatAuditTime(new Date(2026, 9, 11, 9, 5).toISOString())).toMatch(/09:05/)
    expect(formatAuditTime('nada')).toBe('—')
  })

  it('da formato de pesos a los montos', () => {
    const text = formatAuditFactValue('amount', 75000)
    expect(text).toMatch(/75\.000/)
    expect(text).toMatch(/\$/)
  })

  it('deja intactos los datos que no son monto', () => {
    expect(formatAuditFactValue('reference', 'ORD-10428')).toBe('ORD-10428')
    expect(formatAuditFactValue('attempt', 5)).toBe('5')
  })
})

describe('resumen de un evento', () => {
  it('en una falla lidera con el motivo y recorta los datos a dos', () => {
    const row = normalizeAuditEntry({
      id: 'w',
      action: 'payment_webhook.failed',
      entity_type: 'payment_integration_event',
      entity_id: 'evt-1',
      actor_type: 'webhook',
      severity: 'danger',
      metadata: {
        attempt: 5,
        reference: 'ORD-1',
        amount: 1000,
        error:
          'Si quieres conocer los motivos del rechazo, por favor ingresá a tu cuenta de Mercado Pago.',
      },
      created_at: at(11),
    })
    const summary = summarizeAuditEntry(row)

    expect(summary.lead).toContain('Mercado Pago')
    expect(summary.facts).toHaveLength(2)
  })

  it('sin motivo muestra hasta tres datos que identifican la operación', () => {
    const row = normalizeAuditEntry({
      id: 'p',
      action: 'payment.applied',
      entity_type: 'athlete_payment_order',
      entity_id: 'o-1',
      actor_type: 'webhook',
      metadata: { reference: 'ORD-10428', amount: 75000, concept: 'membership', attempt: 1 },
      created_at: at(11),
    })
    const summary = summarizeAuditEntry(row)

    expect(summary.lead).toBeNull()
    expect(summary.facts).toHaveLength(3)
    expect(summary.facts.map((fact) => fact.field)).toContain('reference')
    expect(summary.facts.find((fact) => fact.field === 'amount').value).toMatch(/\$/)
  })

  it('un evento sin metadata no rompe: queda sin resumen', () => {
    const row = normalizeAuditEntry({
      id: 'n',
      action: 'event.upserted',
      entity_type: 'event',
      entity_id: 'e-1',
      actor_type: 'staff',
      created_at: at(11),
    })
    expect(summarizeAuditEntry(row)).toEqual({ lead: null, facts: [] })
  })
})
