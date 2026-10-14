import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'
import { resetSessionCaches } from '../server/lib/sessionCache.js'
import { hashToken } from '../server/services/sessionService.js'
import { ACCESS_ROLE_TEMPLATES, getDefaultPermissionsForRole } from '../src/lib/permissions.js'
import { listen } from './integration/helpers/supabaseTestClient.js'

const mutationHeaders = {
  Origin: 'http://localhost:5173',
  'Content-Type': 'application/json',
  'X-PLU-Request': 'browser',
}

describe('POST /api/launch-interest', () => {
  it('persiste un email nuevo y es idempotente en reintentos', async () => {
    const upsertInterest = vi
      .fn()
      .mockResolvedValueOnce({ created: true, email: 'agus@example.com' })
      .mockResolvedValueOnce({ created: false, email: 'agus@example.com' })

    const target = listen(
      createApp({
        launchInterestRepository: { upsertInterest },
      }),
    )
    try {
      const first = await fetch(`${target.url}/api/launch-interest`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          email: 'agus@example.com',
          source: 'home',
          eventSlug: 'pitbull-classic-2026',
        }),
      })
      const second = await fetch(`${target.url}/api/launch-interest`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({
          email: 'agus@example.com',
          source: 'home',
        }),
      })

      expect(first.status).toBe(201)
      expect(await first.json()).toMatchObject({
        ok: true,
        created: true,
        email: 'agus@example.com',
      })
      expect(second.status).toBe(200)
      expect(await second.json()).toMatchObject({ ok: true, created: false })
      expect(upsertInterest).toHaveBeenCalledTimes(2)
    } finally {
      await target.close()
    }
  })

  it('rechaza email invalido', async () => {
    const upsertInterest = vi.fn()
    const target = listen(
      createApp({
        launchInterestRepository: { upsertInterest },
      }),
    )
    try {
      const response = await fetch(`${target.url}/api/launch-interest`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify({ email: 'no-es-mail' }),
      })
      expect(response.status).toBe(400)
      expect(upsertInterest).not.toHaveBeenCalled()
    } finally {
      await target.close()
    }
  })
})

describe('rutas de staff de /api/launch-interest', () => {
  // Una sesión por rol, resuelta por una base falsa: lo que se prueba es la
  // guarda, no el login. Regresión: la guarda anterior pedía los roles `ops` y
  // `admin` (inexistentes) y dejaba al Administrador con 403.
  function prismaFor(roleKey) {
    const template = ACCESS_ROLE_TEMPLATES.find(({ key }) => key === roleKey)
    const accessRole = {
      id: roleKey,
      ...template,
      active: true,
      permissions: getDefaultPermissionsForRole(roleKey).map((permissionKey) => ({
        permissionKey,
        permission: { key: permissionKey },
      })),
    }
    const now = Date.now()
    return {
      session: {
        findUnique: async ({ where }) =>
          where.tokenHash === hashToken('token-de-prueba')
            ? {
                id: 'ses-1',
                userId: 'usr-1',
                tokenHash: where.tokenHash,
                revokedAt: null,
                createdAt: new Date(now),
                expiresAt: new Date(now + 8 * 60 * 60 * 1000),
                user: {
                  id: 'usr-1',
                  email: 'staff@pluarg.test',
                  role: template.baseRole,
                  accessRole,
                  status: 'active',
                  mustChangePassword: false,
                  profile: { displayName: template.name },
                },
              }
            : null,
        update: async () => ({}),
      },
    }
  }

  async function call(roleKey, path, init = {}) {
    resetSessionCaches()
    const notifySource = vi.fn().mockResolvedValue({ count: 3 })
    const target = listen(
      createApp({
        prisma: prismaFor(roleKey),
        launchInterestRepository: {
          getSummary: async () => ({ total: 7 }),
          notifySource,
        },
      }),
    )
    try {
      const response = await fetch(`${target.url}/api/launch-interest${path}`, {
        ...init,
        headers: { ...mutationHeaders, Cookie: 'plu_session=token-de-prueba' },
      })
      return { status: response.status, notifySource }
    } finally {
      await target.close()
    }
  }

  const notify = { method: 'POST', body: JSON.stringify({ source: 'launch_teaser' }) }

  it('el Administrador ve el resumen y notifica', async () => {
    expect((await call('admin_plu_arg', '/summary')).status).toBe(200)
    const sent = await call('admin_plu_arg', '/notify', notify)
    expect(sent.status).toBe(200)
    expect(sent.notifySource).toHaveBeenCalledTimes(1)
  })

  it('el Super Admin sigue pasando', async () => {
    expect((await call('admin_maximal', '/summary')).status).toBe(200)
    expect((await call('admin_maximal', '/notify', notify)).status).toBe(200)
  })

  it('PLU ve el resumen pero no puede mandar mails masivos', async () => {
    expect((await call('plu_arg', '/summary')).status).toBe(200)
    const denied = await call('plu_arg', '/notify', notify)
    expect(denied.status).toBe(403)
    expect(denied.notifySource).not.toHaveBeenCalled()
  })

  it('Seguridad no entra a ninguna de las dos', async () => {
    expect((await call('seguridad_plu_arg', '/summary')).status).toBe(403)
    expect((await call('seguridad_plu_arg', '/notify', notify)).status).toBe(403)
  })
})
