import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { siteTeaserSchema } from '../server/routes/platformSettings.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

async function setup() {
  const staff = await buildStaffUser({ email: 'teaser-admin@plu.test' })
  const prisma = createPrismaDouble([staff])
  const state = {
    eventsEnabled: false,
    updatedBy: null,
    updatedAt: null,
  }
  const repository = {
    getTeaser: async () => ({ ...state }),
    setTeaser: async (enabled, actor) => {
      state.eventsEnabled = enabled
      state.updatedBy = actor
      state.updatedAt = '2026-12-06T12:00:00.000Z'
      return { ...state }
    },
  }
  const target = listen(
    createApp({
      prisma,
      platformSettingsRepository: repository,
      env: {
        AUTH_SECRET: 'site-teaser-test-secret',
        APP_URL: 'http://localhost:5173',
      },
    }),
  )
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { cookie, state, target }
}

describe('anuncio "Pronto habrá novedades" — /api/platform-settings/teaser', () => {
  it('nace apagado y es legible sin sesión', async () => {
    const { target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings/teaser`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ eventsEnabled: false })
    } finally {
      await target.close()
    }
  })

  it('no expone quién ni cuándo lo tocó en la lectura pública', async () => {
    const { cookie, target } = await setup()
    try {
      await fetch(`${target.url}/api/platform-settings/teaser`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({ enabled: true }),
      })

      const response = await fetch(`${target.url}/api/platform-settings/teaser`)
      const body = await response.json()
      expect(body).toEqual({ eventsEnabled: true })
      expect(JSON.stringify(body)).not.toContain('teaser-admin@plu.test')
    } finally {
      await target.close()
    }
  })

  it('prende y apaga con permiso de escritura de eventos y registra al actor', async () => {
    const { cookie, state, target } = await setup()
    try {
      const on = await fetch(`${target.url}/api/platform-settings/teaser`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({ enabled: true }),
      })
      expect(on.status).toBe(200)
      expect(await on.json()).toEqual({ eventsEnabled: true })
      expect(state.updatedBy).toContain('teaser-admin@plu.test')

      const off = await fetch(`${target.url}/api/platform-settings/teaser`, {
        method: 'PUT',
        headers: authHeaders(cookie),
        body: JSON.stringify({ enabled: false }),
      })
      expect(await off.json()).toEqual({ eventsEnabled: false })
    } finally {
      await target.close()
    }
  })

  it('rechaza escribir sin sesión', async () => {
    const { state, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/platform-settings/teaser`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ enabled: true }),
      })
      expect(response.status).toBe(401)
      expect(state.eventsEnabled).toBe(false)
    } finally {
      await target.close()
    }
  })

  it('exige un booleano y no acepta campos de más', () => {
    expect(siteTeaserSchema.safeParse({ enabled: true }).success).toBe(true)
    expect(siteTeaserSchema.safeParse({ enabled: 'si' }).success).toBe(false)
    expect(siteTeaserSchema.safeParse({}).success).toBe(false)
  })
})
