import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20270104100000_ticket_sales_open_when_registration_closed.sql',
  'utf8',
)

function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`)
  expect(start, name).toBeGreaterThanOrEqual(0)
  return migration.slice(start, migration.indexOf('\n$$;', start))
}

describe('la inscripción cerrada no cierra la venta de entradas', () => {
  it.each(['create_ticket_order_v2', 'create_ticket_order_v3'])(
    '%s solo corta la venta si el evento está finalizado',
    (name) => {
      const body = functionBody(name)
      expect(body).toContain("if v_event.status = 'finalizado' then")
      expect(body).not.toContain("v_event.status in ('cerrado', 'finalizado')")
      expect(body).toContain('entre 1 y 10 asistentes')
      expect(body).toContain('La venta de entradas esta deshabilitada para este evento.')
    },
  )
})
