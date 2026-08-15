import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260823140000_expiry_cron_every_three_minutes.sql'),
  'utf8',
)

/**
 * `expire_ticket_reservations` era la consulta con más tiempo total acumulado
 * de toda la base por correr 1.440 veces por día sin encontrar casi nada que
 * expirar. El barrido pasa a cada 3 minutos: un tercio del trabajo, contra un
 * retraso máximo de 3 minutos sobre una ventana de reserva de 20.
 */
describe('migración del barrido de vencimientos', () => {
  it('reprograma el barrido cada 3 minutos', () => {
    // Se afirma sobre la llamada, no sobre el archivo: el comentario cita el
    // schedule anterior para dejar dicho cómo se revierte.
    const schedule = migration.match(
      /cron\.schedule\(\s*'expire-domain-orders-sweep',\s*'([^']+)'/,
    )

    expect(schedule?.[1]).toBe('*/3 * * * *')
  })

  it('desprograma el job anterior para no dejar los dos corriendo', () => {
    expect(migration).toContain('cron.unschedule(jobid)')
    expect(migration).toContain('expire-domain-orders-minute')
    expect(migration).toMatch(/where jobname in \([^)]*'expire-domain-orders-sweep'/s)
  })

  it('conserva las dos funciones del barrido sin tocar su lógica', () => {
    expect(migration).toContain('select public.expire_ticket_reservations(now());')
    expect(migration).toContain('select public.expire_domain_orders(now());')
  })
})
