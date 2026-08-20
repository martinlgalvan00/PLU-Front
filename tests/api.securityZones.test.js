import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { ZONE_PRESET } from '../server/routes/securityZones.js'
import {
  authHeaders,
  buildStaffUser,
  createPrismaDouble,
  loginStaff,
} from './integration/helpers/staffSession.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const EVENT = { id: 'evt-pitbull', slug: 'pitbull-classic-2026' }

/**
 * Un server por caso: `staffLimiter` comparte balde entre tests del mismo
 * archivo, así que cada caso hace pocas requests y cierra su target.
 */
async function setup({ zones = [], securityUsers = [] } = {}) {
  const staff = await buildStaffUser({ email: 'zones-admin@plu.test' })
  const users = [staff, ...securityUsers]
  const prisma = createPrismaDouble(users, { events: [EVENT], zones })
  const target = listen(
    createApp({
      prisma,
      env: { AUTH_SECRET: 'security-zones-test-secret', APP_URL: 'http://localhost:5173' },
    }),
  )
  const { cookie } = await loginStaff(target.url, { email: staff.email })
  return { cookie, prisma, target, users, zones }
}

function securityUser(overrides = {}) {
  return {
    id: 'usr-sec-1',
    email: 'camila@segur.com',
    role: 'seguridad_plu_arg',
    status: 'active',
    eventId: EVENT.id,
    eventSlug: EVENT.slug,
    securityZoneId: null,
    profile: { firstName: 'Camila', lastName: 'Vera' },
    ...overrides,
  }
}

describe('zonas de seguridad — /api/security-zones', () => {
  it('crea una zona y la devuelve en el listado del evento', async () => {
    const { cookie, target } = await setup()
    try {
      const created = await fetch(`${target.url}/api/security-zones`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Puerta principal',
          scope: 'gate_tickets',
          shiftStart: '2026-03-14T11:00:00.000Z',
          shiftEnd: '2026-03-14T17:00:00.000Z',
        }),
      })

      expect(created.status).toBe(201)
      const body = await created.json()
      expect(body.zone).toMatchObject({
        eventId: EVENT.id,
        name: 'Puerta principal',
        scope: 'gate_tickets',
        memberCount: 0,
      })
      expect(body.zones).toHaveLength(1)
    } finally {
      await target.close()
    }
  })

  it('rechaza dos zonas con el mismo nombre en el mismo evento', async () => {
    const { cookie, target } = await setup({
      zones: [
        {
          id: 'zone-1',
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Pesaje',
          scope: 'athletes_only',
          sortOrder: 0,
          shiftStart: null,
          shiftEnd: null,
        },
      ],
    })
    try {
      const response = await fetch(`${target.url}/api/security-zones`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Pesaje',
          scope: 'athletes_only',
        }),
      })

      expect(response.status).toBe(409)
    } finally {
      await target.close()
    }
  })

  it('rechaza un turno que termina antes de empezar', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/security-zones`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Plataforma',
          scope: 'staff_only',
          shiftStart: '2026-03-14T17:00:00.000Z',
          shiftEnd: '2026-03-14T11:00:00.000Z',
        }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('rechaza un alcance de escaneo que no existe', async () => {
    const { cookie, target } = await setup()
    try {
      const response = await fetch(`${target.url}/api/security-zones`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Zona rara',
          scope: 'todo',
        }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('el preset arma el meet estándar y es idempotente', async () => {
    const { cookie, target } = await setup()
    try {
      const first = await fetch(`${target.url}/api/security-zones/preset`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ eventId: EVENT.id, eventSlug: EVENT.slug }),
      })
      const firstBody = await first.json()

      expect(first.status).toBe(201)
      expect(firstBody.created).toBe(ZONE_PRESET.length)
      expect(firstBody.zones.map((zone) => zone.name)).toEqual(
        ZONE_PRESET.map((zone) => zone.name),
      )

      // Volver a apretar el botón no duplica el operativo.
      const second = await fetch(`${target.url}/api/security-zones/preset`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ eventId: EVENT.id, eventSlug: EVENT.slug }),
      })
      const secondBody = await second.json()

      expect(secondBody.created).toBe(0)
      expect(secondBody.zones).toHaveLength(ZONE_PRESET.length)
    } finally {
      await target.close()
    }
  })

  it('asigna y desasigna una cuenta de seguridad de su zona', async () => {
    const { cookie, target, users } = await setup({
      securityUsers: [securityUser()],
      zones: [
        {
          id: 'zone-1',
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Puerta principal',
          scope: 'gate_tickets',
          sortOrder: 0,
          shiftStart: null,
          shiftEnd: null,
        },
      ],
    })
    try {
      const assigned = await fetch(`${target.url}/api/security-zones/members/usr-sec-1`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ zoneId: 'zone-1' }),
      })

      expect(assigned.status).toBe(200)
      expect((await assigned.json()).zones[0].memberCount).toBe(1)
      expect(users.find((user) => user.id === 'usr-sec-1').securityZoneId).toBe('zone-1')

      const cleared = await fetch(`${target.url}/api/security-zones/members/usr-sec-1`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ zoneId: null }),
      })

      expect(cleared.status).toBe(200)
      expect(users.find((user) => user.id === 'usr-sec-1').securityZoneId).toBeNull()
    } finally {
      await target.close()
    }
  })

  it('no deja mandar una cuenta a la zona de otro evento', async () => {
    const { cookie, target } = await setup({
      securityUsers: [securityUser()],
      zones: [
        {
          id: 'zone-otro',
          eventId: 'evt-otro',
          eventSlug: 'otro-meet',
          name: 'Puerta',
          scope: 'gate_tickets',
          sortOrder: 0,
          shiftStart: null,
          shiftEnd: null,
        },
      ],
    })
    try {
      const response = await fetch(`${target.url}/api/security-zones/members/usr-sec-1`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ zoneId: 'zone-otro' }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('borrar una zona deja a su gente sin zona, no sin cuenta', async () => {
    const { cookie, target, users } = await setup({
      securityUsers: [securityUser({ securityZoneId: 'zone-1' })],
      zones: [
        {
          id: 'zone-1',
          eventId: EVENT.id,
          eventSlug: EVENT.slug,
          name: 'Puerta principal',
          scope: 'gate_tickets',
          sortOrder: 0,
          shiftStart: null,
          shiftEnd: null,
        },
      ],
    })
    try {
      const response = await fetch(`${target.url}/api/security-zones/zone-1`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(200)
      expect((await response.json()).zones).toEqual([])

      const survivor = users.find((user) => user.id === 'usr-sec-1')
      expect(survivor).toBeDefined()
      expect(survivor.securityZoneId).toBeNull()
    } finally {
      await target.close()
    }
  })

  it('exige sesión de staff', async () => {
    const { target } = await setup()
    try {
      const response = await fetch(
        `${target.url}/api/security-zones?eventId=${encodeURIComponent(EVENT.id)}`,
      )
      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })
})
