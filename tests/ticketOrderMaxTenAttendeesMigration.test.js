import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261231110000_ticket_order_max_ten_attendees.sql',
  'utf8',
)
const checkout = readFileSync('src/components/ui/TicketPurchaseSection.jsx', 'utf8')
const counter = readFileSync('src/components/admin/ManualTicketSaleDialog.jsx', 'utf8')
const routes = readFileSync('server/routes/tickets.js', 'utf8')

/** Cuerpo de una función de la migración, de su `create or replace` al `$$;`. */
function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}(`)
  expect(start, name).toBeGreaterThanOrEqual(0)
  return migration.slice(start, migration.indexOf('\n$$;', start))
}

describe('tope de 10 asistentes por compra de entradas', () => {
  it.each(['create_ticket_order_v2', 'create_ticket_order_v3'])(
    '%s corta en 10, no en 8',
    (name) => {
      const body = functionBody(name)
      expect(body).toContain('jsonb_array_length(p_attendees) > 10 then')
      expect(body).toContain('entre 1 y 10 asistentes')
      expect(body).not.toMatch(/> 8 then|entre 1 y 8/)
      expect(body).toMatch(/security definer\s+set search_path = public/)
    },
  )

  it('mantiene los permisos: solo service_role ejecuta', () => {
    for (const signature of [
      'create_ticket_order_v2(text, jsonb, jsonb, text, text)',
      'create_ticket_order_v3(text, jsonb, jsonb, text, text, text)',
    ]) {
      expect(migration).toContain(
        `revoke all on function public.${signature}\n  from public, anon, authenticated;`,
      )
      expect(migration).toContain(
        `grant execute on function public.${signature}\n  to service_role;`,
      )
    }
  })

  it('checkout, mostrador y API usan el mismo tope', () => {
    expect(checkout).toContain('const MAX_TICKETS = 10')
    expect(counter).toContain('const MAX_ATTENDEES = 10')
    expect(routes).toContain('const MAX_ATTENDEES_PER_ORDER = 10')
    expect(routes).not.toMatch(/attendees: z\.array\(attendeeSchema\)\.min\(1\)\.max\(8\)/)
  })
})
