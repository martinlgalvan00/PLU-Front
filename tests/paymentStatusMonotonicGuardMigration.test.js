import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260818110000_payment_status_monotonic_guard.sql'),
  'utf8',
)

function guardFor(table) {
  return [
    'status = case',
    `      when public.${table}.status in ('aprobado', 'reembolsado')`,
    "        and excluded.status not in ('aprobado', 'reembolsado')",
    `      then public.${table}.status`,
    '      else excluded.status',
    '    end,',
  ].join('\n')
}

describe('guarda de transicion monotonica al acreditar un pago', () => {
  it('apply_mercado_pago_payment no deja que un estado tardio degrade una fila ya aprobada/reembolsada', () => {
    expect(migration).toContain('create or replace function public.apply_mercado_pago_payment(')
    expect(migration).toContain(guardFor('athlete_payments'))
  })

  it('apply_ticket_mercado_pago_payment tiene la misma guarda', () => {
    expect(migration).toContain(
      'create or replace function public.apply_ticket_mercado_pago_payment(',
    )
    expect(migration).toContain(guardFor('ticket_payments'))
  })

  it('apply_subscription_payment tiene la misma guarda', () => {
    expect(migration).toContain('create or replace function public.apply_subscription_payment(')
    // apply_subscription_payment tambien upsertea en athlete_payments.
    const occurrences = migration.split(guardFor('athlete_payments')).length - 1
    expect(occurrences).toBe(2)
  })

  it('sigue permitiendo aprobado -> reembolsado (el reembolso real tiene la ultima palabra)', () => {
    // La guarda solo bloquea si el estado entrante NO es aprobado/reembolsado;
    // un reembolso real cae en el "else excluded.status" y se aplica igual.
    expect(migration).toContain("and excluded.status not in ('aprobado', 'reembolsado')")
  })
})
