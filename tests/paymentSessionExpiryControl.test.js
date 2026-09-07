import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDomainMaintenanceJob } from '../server/jobs/domainMaintenanceJob.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261110100000_payment_session_expiry_control.sql'),
  'utf8',
)

describe('barrido de intentos de pago abandonados — migración', () => {
  it('sólo cierra intentos que nunca llegaron al proveedor', () => {
    // Es la única garantía real de que el barrido no puede perder un cobro: un
    // intento sin id externo no tiene contraparte en Mercado Pago. Si esta
    // condición se cae, el cron pasa a poder cancelar una orden con un pago
    // acreditándose. La migración además lo verifica en runtime con un `do $$`.
    expect(migration).toContain('and a.external_payment_id is null')
    expect(migration).toContain(
      "raise exception\n      'expire_stale_payment_attempts perdió la guarda del id externo: podría cerrar un cobro real.'",
    )
  })

  it('sólo considera intentos en vuelo y pasada la gracia configurada', () => {
    expect(migration).toContain("where a.status in ('processing', 'submitted')")
    expect(migration).toContain('and a.updated_at < p_now - v_grace')
  })

  it('deja los intentos con pago en el proveedor para una persona, contados', () => {
    // No se cancelan solos: se cuentan y se publican. El job los sube a warning
    // y el panel los muestra.
    expect(migration).toContain("'blockedByProvider', coalesce(v_blocked, 0)")
    expect(migration).toContain('and a.external_payment_id is not null')
  })

  it('indexa el barrido para no recorrer la tabla entera en cada corrida', () => {
    expect(migration).toContain(
      "create index if not exists embedded_payment_attempts_stale_idx\n  on public.embedded_payment_attempts (updated_at)\n  where status in ('processing', 'submitted') and external_payment_id is null;",
    )
  })

  it('corre en el cron antes de expire_domain_orders, que depende de él', () => {
    const cron = migration.slice(migration.indexOf("cron.schedule(\n  'expire-domain-orders-sweep'"))
    expect(cron.indexOf('expire_stale_payment_attempts(now())')).toBeLessThan(
      cron.indexOf('expire_domain_orders(now())'),
    )
  })
})

describe('plazos configurables — migración', () => {
  it('el plazo manual deja de ser una constante compilada', () => {
    expect(migration).toContain(
      'create or replace function plu_private.manual_link_checkout_window()',
    )
    expect(migration).toContain("make_interval(mins => plu_private.checkout_window_minutes('manual'))")
    expect(migration).toContain(
      "raise exception 'manual_link_checkout_window volvió a ser una constante compilada.'",
    )
  })

  it('conserva el default de 5 días cuando no hay fila de configuración', () => {
    // 7200 minutos = 5 días. Sin fila, el comportamiento tiene que ser
    // exactamente el de 20261105100000, no un plazo distinto por accidente.
    expect(migration).toContain("when 'manual' then 7200")
    expect(migration).toContain('manual_checkout_window_minutes int not null default 7200')
  })

  it('impide configurar una gracia por debajo de lo que espera el checkout', () => {
    // `claim_embedded_payment_attempt` da por vencido un intento propio recién a
    // los 5 minutos: por debajo de eso el cron contradiría al checkout.
    expect(migration).toContain('check (stale_attempt_grace_minutes between 5 and 1440)')
    expect(migration).toContain('check (manual_checkout_window_minutes between 1 and 525600)')
  })

  it('asienta en la bitácora todo cambio de plazo', () => {
    expect(migration).toContain("'platform_checkout_window.updated'")
    expect(migration).toContain("'previousMinutes', v_previous")
  })
})

describe('runDomainMaintenanceJob', () => {
  afterEach(() => vi.restoreAllMocks())

  function clientWith(overrides = {}) {
    const calls = []
    const results = {
      expire_stale_payment_attempts: { athleteAttempts: 0, ticketAttempts: 0, blockedByProvider: 0 },
      expire_ticket_reservations: { reservations: 0 },
      expire_domain_orders: { orders: 0 },
      expire_financed_payment_orders: { failedOrders: 0 },
      ...overrides,
    }
    return {
      calls,
      rpc: (name, args) => {
        calls.push(name)
        return Promise.resolve({ data: results[name], error: null })
      },
    }
  }

  it('barre los intentos abandonados antes de vencer las órdenes', async () => {
    const client = clientWith()
    await runDomainMaintenanceJob({ client })
    // El orden es la razón de ser del job: liberar la orden y cancelarla en la
    // misma corrida, en vez de hacerla esperar un ciclo más.
    expect(client.calls[0]).toBe('expire_stale_payment_attempts')
    expect(client.calls).toContain('expire_domain_orders')
  })

  it('avisa cuando quedan órdenes trabadas por un pago en el proveedor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = clientWith({
      expire_stale_payment_attempts: { athleteAttempts: 2, ticketAttempts: 0, blockedByProvider: 3 },
    })
    const result = await runDomainMaintenanceJob({ client })
    expect(result.staleAttempts.athleteAttempts).toBe(2)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('3 orden(es) vencida(s) trabada(s)'))
  })

  it('no avisa cuando no hay nada trabado', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await runDomainMaintenanceJob({ client: clientWith() })
    expect(warn).not.toHaveBeenCalled()
  })

  it('sigue venciendo órdenes si todavía no está el barrido de abandono', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls = []
    const client = {
      rpc: (name) => {
        calls.push(name)
        if (name === 'expire_stale_payment_attempts') {
          return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'missing' } })
        }
        return Promise.resolve({ data: { orders: 0, reservations: 0, failedOrders: 0 }, error: null })
      },
    }
    const result = await runDomainMaintenanceJob({ client })
    expect(result.staleAttempts).toBeNull()
    expect(calls).toContain('expire_domain_orders')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('expire_stale_payment_attempts'))
  })
})
