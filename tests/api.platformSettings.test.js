import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import {
  PLATFORM_FEATURES,
  platformFeatureToggleSchema,
} from '../server/routes/platformSettings.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

/** `membership_manual` -> `membershipManualEnabled`, igual que la RPC. */
function toggleKey(feature) {
  return `${feature.replace(/_(.)/g, (_match, char) => char.toUpperCase())}Enabled`
}

const OPEN_CHANNELS = { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true }

async function setup(repositoryOverrides = {}, envOverrides = {}) {
  const staff = await buildStaffUser({ email: 'access-admin@plu.test' })
  const prisma = createPrismaDouble([staff])
  const toggles = {
    ...Object.fromEntries(PLATFORM_FEATURES.map((feature) => [toggleKey(feature), true])),
    paymentChannels: {
      membership: { ...OPEN_CHANNELS },
      registration: { ...OPEN_CHANNELS },
      ticket: { ...OPEN_CHANNELS },
    },
    updatedBy: null,
    updatedAt: null,
  }
  const repository = {
    get: async () => ({ ...toggles }),
    setToggle: async (feature, enabled, actor) => {
      toggles[toggleKey(feature)] = enabled
      toggles.updatedBy = actor
      toggles.updatedAt = '2026-08-14T12:00:00.000Z'
      return { ...toggles }
    },
    setPaymentChannel: async (concept, channel, enabled, actor) => {
      toggles.paymentChannels[concept][channel] = enabled
      toggles.updatedBy = actor
      toggles.updatedAt = '2026-08-14T12:00:00.000Z'
      return { ...toggles }
    },
    ...repositoryOverrides,
  }
  const target = listen(
    createApp({
      prisma,
      platformSettingsRepository: repository,
      env: {
        AUTH_SECRET: 'platform-settings-test-secret',
        APP_URL: 'http://localhost:5173',
        ...envOverrides,
      },
    }),
  )
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { cookie, repository, target, toggles }
}

describe('interruptores generales — /api/platform-settings', () => {
  it('devuelve el estado actual con permiso de lectura', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        checkoutEnabled: true,
        membershipEnabled: true,
        registrationEnabled: true,
      })
    } finally {
      await target.close()
    }
  })

  it('actualiza un interruptor con permiso de escritura', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({ feature: 'checkout', enabled: false }),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        checkoutEnabled: false,
        membershipEnabled: true,
        registrationEnabled: true,
        updatedBy: expect.stringContaining('access-admin@plu.test'),
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza requests anónimos', async () => {
    const { target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`)
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('expone disponibilidad publica de checkout sin datos de admin', async () => {
    const { target, toggles } = await setup()
    toggles.registrationEnabled = false
    toggles.updatedBy = 'admin-secret'

    try {
      const response = await fetch(`${target.url}/api/platform-settings/public`)
      expect(response.status).toBe(200)
      // Los toggles los pide toda pantalla de compra. Se cachean en el borde,
      // pero con ventana corta: cerrar un canal de pago tiene que llegar al
      // público sin esperar un deploy.
      expect(response.headers.get('cache-control')).toContain('s-maxage=30')
      expect(await response.json()).toEqual({
        membershipEnabled: true,
        registrationEnabled: false,
        ticketEnabled: true,
        membershipManualEnabled: true,
        registrationManualEnabled: false,
        ticketManualEnabled: true,
        // La matriz viaja ya cruzada con el maestro y el alta del concepto, así
        // que la pantalla lee la celda sin repetir la lógica.
        paymentChannels: {
          membership: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true },
          registration: {
            mercado_pago: false,
            bank_transfer: false,
            cash_pitbull: false,
            wise_transfer: false,
          },
          ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: true },
        },
      })
    } finally {
      await target.close()
    }
  })

  it('expone los tres ejes por concepto', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        headers: { Cookie: cookie },
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      // Alta, canal manual y validación para afiliación, inscripción y entradas.
      for (const feature of PLATFORM_FEATURES) {
        expect(body, feature).toHaveProperty(toggleKey(feature), true)
      }
    } finally {
      await target.close()
    }
  })

  it('apaga el canal manual sin tocar el alta ni la validación del concepto', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({ feature: 'membership_manual', enabled: false }),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        membershipManualEnabled: false,
        membershipEnabled: true,
        membershipValidationEnabled: true,
        registrationManualEnabled: true,
        ticketManualEnabled: true,
      })
    } finally {
      await target.close()
    }
  })

  it('congela la validación de entradas sin cortar su venta', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({ feature: 'ticket_validation', enabled: false }),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        ticketValidationEnabled: false,
        ticketEnabled: true,
        ticketManualEnabled: true,
        membershipValidationEnabled: true,
        registrationValidationEnabled: true,
      })
    } finally {
      await target.close()
    }
  })

  it('valida el body antes de persistir', () => {
    for (const feature of PLATFORM_FEATURES) {
      expect(
        platformFeatureToggleSchema.safeParse({ feature, enabled: false }).success,
        feature,
      ).toBe(true)
    }
    expect(
      platformFeatureToggleSchema.safeParse({ feature: 'tickets', enabled: true }).success,
    ).toBe(false)
    expect(
      platformFeatureToggleSchema.safeParse({ feature: 'membershipManual', enabled: true }).success,
    ).toBe(false)
    expect(
      platformFeatureToggleSchema.safeParse({ feature: 'checkout', enabled: 'yes' }).success,
    ).toBe(false)
  })
})

describe('matriz de canales — /api/platform-settings/channels', () => {
  it('cierra una celda sin arrastrar las otras del concepto', async () => {
    const { cookie, target, toggles } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings/channels`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          concept: 'membership',
          channel: 'mercado_pago',
          enabled: false,
        }),
      })
      expect(response.status).toBe(200)
      expect(toggles.paymentChannels.membership).toEqual({
        mercado_pago: false,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: true,
      })
      expect(toggles.paymentChannels.registration.mercado_pago).toBe(true)
    } finally {
      await target.close()
    }
  })

  it('admite wise_transfer como canal de la matriz', async () => {
    const { cookie, target, toggles } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings/channels`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          concept: 'membership',
          channel: 'wise_transfer',
          enabled: false,
        }),
      })
      expect(response.status).toBe(200)
      expect(toggles.paymentChannels.membership).toEqual({
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: true,
        wise_transfer: false,
      })
    } finally {
      await target.close()
    }
  })

  it('rechaza un concepto o un canal fuera de la lista blanca', async () => {
    const { cookie, target } = await setup()
    try {
      for (const body of [
        { concept: 'combo', channel: 'mercado_pago', enabled: false },
        { concept: 'membership', channel: 'paypal', enabled: false },
        { concept: 'membership', channel: 'mercado_pago', enabled: 'no' },
      ]) {
        const response = await fetch(`${target.url}/api/platform-settings/channels`, {
          method: 'PUT',
          headers: authHeaders(cookie),
          body: JSON.stringify(body),
        })
        expect(response.status, JSON.stringify(body)).toBe(400)
      }
    } finally {
      await target.close()
    }
  })

  it('rechaza requests anónimos', async () => {
    const { target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings/channels`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: 'membership', channel: 'mercado_pago', enabled: false }),
      })
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  // Un interruptor en ON que no tiene efecto porque una variable de entorno lo
  // frena es soporte fantasma: el panel tiene que poder decirlo.
  it('publica los frenos de entorno junto a los interruptores', async () => {
    const { cookie, target } = await setup({}, { PAID_CHECKOUT_ENABLED: 'false' })
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        headers: authHeaders(cookie),
      })
      expect(response.status).toBe(200)
      expect((await response.json()).environmentHolds).toEqual([
        { variable: 'PAID_CHECKOUT_ENABLED', scope: 'checkout' },
      ])
    } finally {
      await target.close()
    }
  })

  it('no inventa frenos cuando el entorno no opina', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings`, {
        headers: authHeaders(cookie),
      })
      expect((await response.json()).environmentHolds).toEqual([])
    } finally {
      await target.close()
    }
  })
})
