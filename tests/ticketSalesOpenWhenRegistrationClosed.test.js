import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = 'supabase/migrations'

/**
 * La definición que queda viva es la última migración que reescribe la función.
 * Un archivo viejo puede seguir mezclando `cerrado` con la venta: lo que no
 * puede pasar es que una migración posterior vuelva a instalar esa regla.
 */
function latestFunctionBody(name) {
  const marker = `create or replace function public.${name}(`
  let body = null
  let source = null
  for (const file of readdirSync(migrationsDir).filter((entry) => entry.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    const start = sql.indexOf(marker)
    if (start < 0) continue
    const end = sql.indexOf('\n$$;', start)
    body = sql.slice(start, end)
    source = file
  }
  return { body, source }
}

describe('la inscripción cerrada no cierra la venta de entradas', () => {
  it('la regla vive en una sola función y solo corta un evento finalizado', () => {
    const { body } = latestFunctionBody('event_status_blocks_ticket_sales')
    expect(body).toContain("select p_status = 'finalizado'")
    expect(body).not.toMatch(/p_status\s+in\s*\([^)]*cerrado/i)
  })

  it.each(['create_ticket_order_v2', 'create_ticket_order_v3'])(
    '%s consulta esa regla y no vuelve a mezclar la inscripción',
    (name) => {
      const { body } = latestFunctionBody(name)
      expect(body).toContain('event_status_blocks_ticket_sales(v_event.status)')
      expect(body).not.toContain("v_event.status in ('cerrado', 'finalizado')")
      expect(body).not.toMatch(/cerrado/i)
      expect(body).toContain('entre 1 y 10 asistentes')
      expect(body).toContain('La venta de entradas esta deshabilitada para este evento.')
    },
  )
})
