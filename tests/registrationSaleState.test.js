import { describe, expect, it } from 'vitest'
import {
  registrationSalePatch,
  resolveRegistrationSale,
} from '../shared/registrationSaleState.js'

const NOW = new Date('2026-11-01T12:00:00Z')
const base = {
  status: 'inscripcion_abierta',
  published: true,
  salesIntent: 'charge',
  slots: 100,
  registered: 10,
}
const sale = (event, options = {}) =>
  resolveRegistrationSale(event, { now: NOW, registrationChannels: ['mercado_pago'], ...options })

describe('resolveRegistrationSale', () => {
  it('abierta, publicada, en fecha y con cobro: a la venta', () => {
    expect(sale(base)).toMatchObject({ state: 'on_sale', canSell: true, blockers: [] })
  })

  it('finalizado y agotado ganan a todo lo demás', () => {
    expect(sale({ ...base, status: 'finalizado', published: false }).state).toBe('ended')
    expect(sale({ ...base, status: 'agotado' }).state).toBe('sold_out')
    expect(sale({ ...base, registered: 100 }).state).toBe('sold_out')
  })

  it('cerrada por el staff, todavía sin abrir, o con la ventana vencida', () => {
    expect(sale({ ...base, status: 'cerrado' })).toMatchObject({ state: 'closed', reason: 'closedByStaff' })
    expect(sale({ ...base, status: 'proximamente' })).toMatchObject({ state: 'closed', reason: 'notOpened' })
    expect(sale({ ...base, registrationClosesAt: '2026-10-31T00:00:00Z' })).toMatchObject({
      state: 'closed',
      reason: 'windowEnded',
    })
  })

  it('programada: abre sola, y avisa desde ya lo que va a impedir cobrar', () => {
    const scheduled = sale(
      { ...base, published: false, registrationOpensAt: '2026-11-10T13:00:00Z' },
      { registrationChannels: [] },
    )
    expect(scheduled.state).toBe('scheduled')
    expect(scheduled.opensAt.toISOString()).toBe('2026-11-10T13:00:00.000Z')
    expect(scheduled.blockers).toEqual(['hidden', 'noPaymentChannel'])
    expect(scheduled.canSell).toBe(false)
  })

  it('bloqueada: oculta, solo anuncio, plataforma en pausa o sin medios de cobro', () => {
    expect(sale({ ...base, published: false })).toMatchObject({ state: 'blocked', reason: 'hidden' })
    expect(sale({ ...base, salesIntent: 'announce' })).toMatchObject({
      state: 'blocked',
      reason: 'announceOnly',
    })
    expect(sale(base, { platform: { registrationEnabled: false } }).blockers).toEqual([
      'platformPaused',
    ])
    expect(sale(base, { registrationChannels: [] }).blockers).toEqual(['noPaymentChannel'])
  })

  it('sin saber los medios de cobro (null) no inventa un bloqueo', () => {
    expect(sale(base, { registrationChannels: null }).state).toBe('on_sale')
  })

  it('"cupos limitados" cuenta como abierta', () => {
    expect(sale({ ...base, status: 'cupos_limitados' }).state).toBe('on_sale')
  })
})

describe('registrationSalePatch', () => {
  it('abrir ya borra una apertura pendiente y un cierre vencido', () => {
    expect(
      registrationSalePatch('open', {
        now: NOW,
        event: {
          registrationOpensAt: '2026-12-01T00:00:00Z',
          registrationClosesAt: '2026-10-01T00:00:00Z',
        },
      }),
    ).toEqual({
      status: 'inscripcion_abierta',
      registrationOpensAt: null,
      registrationClosesAt: null,
    })
  })

  it('abrir ya conserva un cierre futuro', () => {
    expect(
      registrationSalePatch('open', {
        now: NOW,
        event: { registrationClosesAt: '2026-12-01T00:00:00Z' },
      }),
    ).toEqual({ status: 'inscripcion_abierta' })
  })

  it('programar fija la apertura y descarta un cierre que quedaría antes', () => {
    expect(
      registrationSalePatch('scheduled', {
        now: NOW,
        opensAt: '2026-11-20T13:00:00Z',
        event: { registrationClosesAt: '2026-11-15T00:00:00Z' },
      }),
    ).toEqual({
      status: 'inscripcion_abierta',
      registrationOpensAt: '2026-11-20T13:00:00.000Z',
      registrationClosesAt: null,
    })
    expect(() => registrationSalePatch('scheduled', { opensAt: '' })).toThrow()
  })

  it('cerrar, próximamente y finalizar solo cambian el estado', () => {
    expect(registrationSalePatch('closed')).toEqual({ status: 'cerrado' })
    expect(registrationSalePatch('soon')).toEqual({ status: 'proximamente' })
    expect(registrationSalePatch('ended')).toEqual({ status: 'finalizado' })
  })

  it('lo que escribe se lee de vuelta como el estado pedido', () => {
    const event = { ...base, status: 'cerrado', registrationClosesAt: '2026-10-01T00:00:00Z' }
    const opened = { ...event, ...registrationSalePatch('open', { event, now: NOW }) }
    expect(sale(opened).state).toBe('on_sale')
    const scheduled = {
      ...event,
      ...registrationSalePatch('scheduled', { event, now: NOW, opensAt: '2026-11-05T00:00:00Z' }),
    }
    expect(sale(scheduled).state).toBe('scheduled')
  })
})
