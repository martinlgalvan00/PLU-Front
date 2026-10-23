import { describe, expect, it } from 'vitest'
import { buildPaymentReadiness } from '../src/lib/eventPaymentReadiness.js'

const OPEN_PLATFORM = {
  paymentChannels: {
    registration: {
      mercado_pago: true,
      bank_transfer: true,
      cash_pitbull: true,
      wise_transfer: true,
    },
    ticket: {
      mercado_pago: true,
      bank_transfer: true,
      cash_pitbull: true,
      wise_transfer: true,
    },
  },
}

function build(input = {}) {
  return buildPaymentReadiness({
    overrides: null,
    platform: OPEN_PLATFORM,
    platformStatus: 'ready',
    venueLabel: 'Maximal Strength Club · Buenos Aires',
    ownCashPlace: '',
    bankAlias: 'pitbull.clasico',
    mercadoPagoProfileId: '',
    mercadoPagoProfile: null,
    profilesLoading: false,
    ...input,
  })
}

const rowOf = (readiness, channel) => readiness.rows.find((row) => row.channel === channel)

describe('buildPaymentReadiness', () => {
  it('lista los cuatro medios en orden canónico y cuenta los ofrecidos', () => {
    const readiness = build()
    expect(readiness.rows.map((row) => row.channel)).toEqual([
      'mercado_pago',
      'bank_transfer',
      'cash_pitbull',
      'wise_transfer',
    ])
    expect(readiness.offeredCount).toBe(4)
  })

  it('un medio cerrado en inscripción y entradas no se ofrece', () => {
    const readiness = build({
      overrides: {
        registration: { cash_pitbull: false },
        ticket: { cash_pitbull: false },
      },
    })
    expect(rowOf(readiness, 'cash_pitbull')).toMatchObject({ offered: false, state: 'off' })
    expect(readiness.offeredCount).toBe(3)
  })

  it('un medio abierto en un solo concepto sigue ofrecido', () => {
    const readiness = build({ overrides: { registration: { cash_pitbull: false } } })
    expect(rowOf(readiness, 'cash_pitbull').offered).toBe(true)
  })

  it('transferencia lista con alias y faltante sin él', () => {
    expect(rowOf(build(), 'bank_transfer')).toMatchObject({
      state: 'ready',
      detail: { key: 'paymentReadinessTransferReady', params: { alias: 'pitbull.clasico' } },
    })
    expect(rowOf(build({ bankAlias: '  ' }), 'bank_transfer')).toMatchObject({
      state: 'missing',
      detail: { key: 'paymentReadinessTransferMissing' },
    })
  })

  it('un alias global alcanza cuando el evento no carga uno', () => {
    const readiness = build({ bankAlias: '', fallbackBankAlias: 'plu.global' })
    expect(rowOf(readiness, 'bank_transfer')).toMatchObject({
      state: 'ready',
      detail: { params: { alias: 'plu.global' } },
    })
  })

  it('el efectivo cobra en el lugar propio y, vacío, en la sede', () => {
    expect(rowOf(build({ ownCashPlace: 'Virtus Fitness' }), 'cash_pitbull')).toMatchObject({
      state: 'ready',
      detail: { key: 'paymentReadinessCashReady', params: { place: 'Virtus Fitness' } },
    })
    expect(rowOf(build(), 'cash_pitbull').detail.params.place).toBe(
      'Maximal Strength Club · Buenos Aires',
    )
  })

  it('el efectivo sin lugar ni sede es un faltante', () => {
    const readiness = build({ venueLabel: '', ownCashPlace: '' })
    expect(rowOf(readiness, 'cash_pitbull')).toMatchObject({
      state: 'missing',
      detail: { key: 'paymentReadinessCashMissing' },
    })
  })

  it('Mercado Pago sin cuenta elegida usa la cuenta general de la plataforma', () => {
    expect(rowOf(build(), 'mercado_pago')).toMatchObject({
      state: 'ready',
      detail: { key: 'paymentReadinessMpPlatform' },
    })
  })

  it('Mercado Pago con cuenta conectada nombra la cuenta', () => {
    const readiness = build({
      mercadoPagoProfileId: 'mp-1',
      mercadoPagoProfile: { id: 'mp-1', name: 'Cuenta Virtus', connectionStatus: 'connected' },
    })
    expect(rowOf(readiness, 'mercado_pago')).toMatchObject({
      state: 'ready',
      detail: { key: 'paymentReadinessMpProfile', params: { name: 'Cuenta Virtus' } },
    })
  })

  it('Mercado Pago con cuenta que pide reconexión es una advertencia', () => {
    const readiness = build({
      mercadoPagoProfileId: 'mp-1',
      mercadoPagoProfile: { id: 'mp-1', name: 'Cuenta Virtus', connectionStatus: 'needs_reconnect' },
    })
    expect(rowOf(readiness, 'mercado_pago')).toMatchObject({
      state: 'warning',
      detail: { key: 'paymentReadinessMpReconnect' },
    })
  })

  it('Mercado Pago apuntando a una cuenta que no existe es un faltante', () => {
    const readiness = build({ mercadoPagoProfileId: 'mp-borrada', mercadoPagoProfile: null })
    expect(rowOf(readiness, 'mercado_pago')).toMatchObject({
      state: 'missing',
      detail: { key: 'paymentReadinessMpMissing' },
    })
  })

  it('mientras cargan las cuentas no declara faltante una cuenta elegida', () => {
    const readiness = build({
      mercadoPagoProfileId: 'mp-1',
      mercadoPagoProfile: null,
      profilesLoading: true,
    })
    expect(rowOf(readiness, 'mercado_pago').state).toBe('loading')
  })

  it('mientras carga la plataforma marca el panel como cargando', () => {
    expect(build({ platformStatus: 'loading' }).loading).toBe(true)
    expect(build().loading).toBe(false)
  })

  it('Wise informa que lo configura la plataforma', () => {
    expect(rowOf(build(), 'wise_transfer')).toMatchObject({
      state: 'ready',
      detail: { key: 'paymentReadinessWise' },
    })
  })

  it('un medio que la plataforma cierra y el evento no abre no se ofrece', () => {
    const closedPlatform = {
      paymentChannels: {
        registration: { ...OPEN_PLATFORM.paymentChannels.registration, wise_transfer: false },
        ticket: { ...OPEN_PLATFORM.paymentChannels.ticket, wise_transfer: false },
      },
    }
    expect(rowOf(build({ platform: closedPlatform }), 'wise_transfer').offered).toBe(false)
  })

  it('hasBlockers solo cuenta faltantes de medios ofrecidos', () => {
    expect(build().hasBlockers).toBe(false)
    expect(build({ bankAlias: '' }).hasBlockers).toBe(true)
    expect(
      build({
        bankAlias: '',
        overrides: {
          registration: { bank_transfer: false },
          ticket: { bank_transfer: false },
        },
      }).hasBlockers,
    ).toBe(false)
  })
})
