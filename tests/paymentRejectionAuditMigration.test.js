import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260824110000_payment_rejection_audit.sql'),
  'utf8',
)

describe('auditoría de rechazo de pagos (quién y por qué)', () => {
  it('agrega rejected_by y rejection_reason a las dos tablas de órdenes', () => {
    expect(migration).toContain(
      'alter table public.athlete_payment_orders\n  add column if not exists rejected_by text,\n  add column if not exists rejection_reason text;',
    )
    expect(migration).toContain(
      'alter table public.ticket_orders\n  add column if not exists rejected_by text,\n  add column if not exists rejection_reason text;',
    )
  })

  it('el rechazo manual persiste actor y motivo en la orden, no solo en el log', () => {
    expect(migration.match(/rejected_by = coalesce\(p_actor, 'staff:desconocido'\)/g)?.length).toBe(
      2,
    )
    // La de tickets además fechaba el rechazo solo con updated_at.
    expect(migration).toContain(
      "set status = 'rechazado',\n      reservation_expires_at = null,\n      rejected_at = now()",
    )
  })

  it('el rechazo por webhook queda firmado por el proveedor con su status_detail', () => {
    expect(migration.match(/then 'mercado_pago'/g)?.length).toBe(2)
    expect(migration.match(/then coalesce\(p_status_detail, rejection_reason\)/g)?.length).toBe(2)
  })

  it('mantiene las guards de las RPC recreadas (método, idempotencia, permisos)', () => {
    expect(migration).toContain("if v_order.method <> 'manual_link' then")
    expect(migration).toContain("if v_order.provider <> 'manual' then")
    expect(migration.match(/'duplicate', true/g)?.length).toBe(2)
    expect(migration.match(/to service_role;/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('conserva la auditoría de dominio que ya existía', () => {
    expect(migration).toContain("'payment.rejected_manually'")
    expect(migration).toContain("'ticket_order.rejected'")
    expect(migration).toContain("'payment.applied'")
  })
})
