import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { platformFeatureToggleSchema } from '../server/routes/platformSettings.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

async function setup(repositoryOverrides = {}) {
  const staff = await buildStaffUser({ email: 'access-admin@plu.test' })
  const prisma = createPrismaDouble([staff])
  const toggles = {
    checkoutEnabled: true,
    membershipEnabled: true,
    registrationEnabled: true,
    updatedBy: null,
    updatedAt: null,
  }
  const repository = {
    get: async () => ({ ...toggles }),
    setToggle: async (feature, enabled, actor) => {
      toggles[`${feature}Enabled`] = enabled
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

  it('valida el body antes de persistir', () => {
    expect(platformFeatureToggleSchema.safeParse({ feature: 'checkout', enabled: true }).success).toBe(true)
    expect(platformFeatureToggleSchema.safeParse({ feature: 'membership', enabled: false }).success).toBe(true)
    expect(platformFeatureToggleSchema.safeParse({ feature: 'tickets', enabled: true }).success).toBe(false)
    expect(platformFeatureToggleSchema.safeParse({ feature: 'checkout', enabled: 'yes' }).success).toBe(false)
  })
})
