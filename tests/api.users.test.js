import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'

const ENV = { AUTH_SECRET: 'test-secret-alta-de-staff-plu', APP_URL: 'http://localhost:5173' }
const ADMIN_PASSWORD = 'clave-admin-123'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function authHeaders(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

// Doble de Prisma con lo justo para /api/auth/login (sesión) y /api/users.
function createPrismaDouble(seedUsers) {
  const users = [...seedUsers]
  const sessions = []
  const auditLogs = []
  let seq = users.length
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((user) => user.email === where.email) ?? null
        return users.find((user) => user.id === where.id) ?? null
      },
      findMany: async ({ where }) => {
        const roles = where?.role?.in
        return users.filter((user) => (roles ? roles.includes(user.role) : true))
      },
      create: async ({ data }) => {
        seq += 1
        const user = {
          id: `usr-${seq}`,
          email: data.email,
          role: data.role,
          status: data.status,
          passwordHash: data.passwordHash ?? null,
          mustChangePassword: data.mustChangePassword ?? false,
          passwordExpiresAt: data.passwordExpiresAt ?? null,
          eventId: data.eventId ?? null,
          eventSlug: data.eventSlug ?? null,
          profile: data.profile?.create ?? null,
        }
        users.push(user)
        return user
      },
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
      },
      delete: async ({ where }) => {
        const index = users.findIndex((item) => item.id === where.id)
        if (index === -1) throw new Error('Usuario inexistente')
        const [deleted] = users.splice(index, 1)
        return deleted
      },
    },
    session: {
      create: async ({ data }) => {
        const session = { id: `ses-${sessions.length + 1}`, ...data }
        sessions.push(session)
        return session
      },
      findUnique: async ({ where }) => {
        const session = sessions.find((item) => item.tokenHash === where.tokenHash)
        if (!session) return null
        return { ...session, user: users.find((user) => user.id === session.userId) }
      },
      updateMany: async () => ({ count: 0 }),
    },
    auditLog: {
      create: async ({ data }) => {
        const auditLog = { id: `audit-${auditLogs.length + 1}`, ...data }
        auditLogs.push(auditLog)
        return auditLog
      },
    },
  }

  prisma.$transaction = async (callback) => callback(prisma)
  prisma._state = { auditLogs, users }
  return prisma
}

async function buildAdmin(role = 'admin_plu_arg') {
  return {
    id: 'usr-admin',
    email: 'admin@pluarg.test',
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role,
    status: 'active',
    profile: { firstName: 'Admin', lastName: 'PLU' },
    eventId: null,
    eventSlug: null,
  }
}

async function loginAdmin(url) {
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email: 'admin@pluarg.test', password: ADMIN_PASSWORD }),
  })
  return response.headers.get('set-cookie')?.split(';')[0]
}

describe('alta de staff (/api/users)', () => {
  it('un admin crea una cuenta PLU invitada sin exponer credenciales', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ name: 'Equipo PLU', email: 'plu@pluarg.test', role: 'plu_arg' }),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.user).toMatchObject({
        email: 'plu@pluarg.test',
        role: 'operador_plu_arg',
        roleKey: 'plu_arg',
        status: 'invited',
        mustChangePassword: true,
      })
      expect(body).not.toHaveProperty('tempPassword')

      const created = prisma._state.users.find((user) => user.email === 'plu@pluarg.test')
      expect(created.passwordHash).toEqual(expect.any(String))
      expect(created.passwordExpiresAt).toBeInstanceOf(Date)
    } finally {
      await target.close()
    }
  })

  it('deja que un Super Admin cree otro Super Admin', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_maximal')])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          name: 'Otro Max',
          email: 'max2@pluarg.test',
          role: 'admin_maximal',
        }),
      })
      const body = await response.json()

      expect(response.status).toBe(201)
      expect(body.user).toMatchObject({ roleKey: 'admin_maximal', mustChangePassword: true })
    } finally {
      await target.close()
    }
  })

  it('impide que un Administrador cree un Super Admin o un par suyo', async () => {
    const prisma = createPrismaDouble([await buildAdmin('admin_plu_arg')])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const superAdmin = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          name: 'Otro Max',
          email: 'max2@pluarg.test',
          role: 'admin_maximal',
        }),
      })
      const peer = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          name: 'Otro Admin',
          email: 'admin2@pluarg.test',
          role: 'admin_plu_arg',
        }),
      })

      expect(superAdmin.status).toBe(403)
      expect(peer.status).toBe(403)
    } finally {
      await target.close()
    }
  })

  it('rechaza (409) un email ya existente', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({
          name: 'Admin Repetido',
          email: 'admin@pluarg.test',
          role: 'admin_plu_arg',
        }),
      })

      expect(response.status).toBe(409)
    } finally {
      await target.close()
    }
  })

  it('bloquea (401) la creación sin sesión', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const response = await fetch(`${target.url}/api/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name: 'Sin Sesion', email: 'nadie@pluarg.test', role: 'plu_arg' }),
      })

      expect(response.status).toBe(401)
    } finally {
      await target.close()
    }
  })

  it('persiste la asignación de un rol configurable permitido', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin(),
      {
        id: 'usr-plu',
        email: 'equipo@pluarg.test',
        passwordHash: null,
        role: 'operador_plu_arg',
        status: 'active',
        profile: { firstName: 'Equipo', lastName: 'PLU' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-plu/role`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ roleKey: 'plu_arg' }),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.user).toMatchObject({
        id: 'usr-plu',
        role: 'operador_plu_arg',
        roleKey: 'plu_arg',
      })
      expect(body.user.permissions).toContain('admin.events.read')
      expect(body.user.permissions).not.toContain('admin.events.write')
    } finally {
      await target.close()
    }
  })

  it('suspende un usuario de staff y corta el acceso', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin(),
      {
        id: 'usr-plu',
        email: 'equipo@pluarg.test',
        passwordHash: null,
        role: 'operador_plu_arg',
        status: 'active',
        profile: { firstName: 'Equipo', lastName: 'PLU' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-plu/status`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ status: 'suspended' }),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.user).toMatchObject({
        id: 'usr-plu',
        status: 'suspended',
      })
    } finally {
      await target.close()
    }
  })

  it('bloquea (400) cambiar el propio estado', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-admin/status`, {
        method: 'PATCH',
        headers: authHeaders(cookie),
        body: JSON.stringify({ status: 'disabled' }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('permite que Super Admin elimine una cuenta y registra auditoría', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin('admin_maximal'),
      {
        id: 'usr-test',
        email: 'test@pluarg.test',
        passwordHash: null,
        role: 'operador_plu_arg',
        status: 'disabled',
        profile: { firstName: 'Cuenta', lastName: 'Test' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-test`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.deletedUser).toEqual({ id: 'usr-test' })
      expect(prisma._state.users.some((user) => user.id === 'usr-test')).toBe(false)
      expect(prisma._state.auditLogs).toContainEqual(
        expect.objectContaining({
          action: 'user.deleted',
          entityId: 'usr-test',
          actorId: 'usr-admin',
        }),
      )
    } finally {
      await target.close()
    }
  })

  it('rechaza la eliminación para Administrador aunque gestione usuarios', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin('admin_plu_arg'),
      {
        id: 'usr-test',
        email: 'test@pluarg.test',
        passwordHash: null,
        role: 'operador_plu_arg',
        status: 'active',
        profile: { firstName: 'Cuenta', lastName: 'Test' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-test`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(response.status).toBe(403)
      expect(prisma._state.users.some((user) => user.id === 'usr-test')).toBe(true)
    } finally {
      await target.close()
    }
  })

  it('reemite la credencial de una cuenta y vuelve a exigir el cambio', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin(),
      {
        id: 'usr-plu',
        email: 'equipo@pluarg.test',
        passwordHash: await hashPassword('clave-vieja-del-equipo'),
        mustChangePassword: false,
        role: 'operador_plu_arg',
        status: 'active',
        profile: { firstName: 'Equipo', lastName: 'PLU' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-plu/reset-password`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ sendEmail: false }),
      })
      const body = await response.json()
      const target_ = prisma._state.users.find((user) => user.id === 'usr-plu')

      expect(response.status).toBe(200)
      expect(body).not.toHaveProperty('tempPassword')
      expect(body.user.mustChangePassword).toBe(true)
      expect(target_.mustChangePassword).toBe(true)
      expect(target_.passwordHash).not.toBe(await hashPassword('clave-vieja-del-equipo'))
      expect(prisma._state.auditLogs).toContainEqual(
        expect.objectContaining({ action: 'user.credential_issued', entityId: 'usr-plu' }),
      )
    } finally {
      await target.close()
    }
  })

  it('bloquea (400) resetear la propia contraseña desde Usuarios', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-admin/reset-password`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ sendEmail: false }),
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('impide que un Administrador resetee la credencial de un Super Admin', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin('admin_plu_arg'),
      {
        id: 'usr-max',
        email: 'max@pluarg.test',
        passwordHash: await hashPassword('clave-del-super-admin'),
        mustChangePassword: false,
        role: 'admin_maximal',
        status: 'active',
        profile: { firstName: 'Super', lastName: 'Admin' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const response = await fetch(`${target.url}/api/users/usr-max/reset-password`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify({ sendEmail: false }),
      })

      expect(response.status).toBe(403)
    } finally {
      await target.close()
    }
  })

  it('impide eliminar la propia cuenta o a otro Super Admin', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin('admin_maximal'),
      {
        id: 'usr-max-2',
        email: 'max2@pluarg.test',
        passwordHash: null,
        role: 'admin_maximal',
        status: 'active',
        profile: { firstName: 'Otro', lastName: 'Max' },
        eventId: null,
        eventSlug: null,
      },
    ])
    const target = listen(createApp({ prisma, env: ENV }))

    try {
      const cookie = await loginAdmin(target.url)
      const ownResponse = await fetch(`${target.url}/api/users/usr-admin`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })
      const otherMaxResponse = await fetch(`${target.url}/api/users/usr-max-2`, {
        method: 'DELETE',
        headers: authHeaders(cookie),
      })

      expect(ownResponse.status).toBe(400)
      expect(otherMaxResponse.status).toBe(403)
      expect(prisma._state.users).toHaveLength(2)
    } finally {
      await target.close()
    }
  })
})

describe('cambio de rol en lote (/api/users/bulk-role)', () => {
  const staff = (id, overrides = {}) => ({
    id,
    email: `${id}@pluarg.test`,
    passwordHash: null,
    role: 'operador_plu_arg',
    status: 'active',
    profile: { firstName: id, lastName: 'PLU' },
    eventId: null,
    eventSlug: null,
    ...overrides,
  })

  async function bulk(prisma, body, { login = true } = {}) {
    const target = listen(createApp({ prisma, env: ENV }))
    try {
      const cookie = login ? await loginAdmin(target.url) : undefined
      const response = await fetch(`${target.url}/api/users/bulk-role`, {
        method: 'POST',
        headers: authHeaders(cookie),
        body: JSON.stringify(body),
      })
      return { status: response.status, body: await response.json() }
    } finally {
      await target.close()
    }
  }

  it('cambia el rol de varias cuentas, las audita y les corta la sesión', async () => {
    const prisma = createPrismaDouble([await buildAdmin(), staff('usr-a'), staff('usr-b')])
    const revoked = []
    prisma.session.updateMany = async ({ where }) => {
      revoked.push(where.userId)
      return { count: 1 }
    }

    const { status, body } = await bulk(prisma, {
      userIds: ['usr-a', 'usr-b'],
      roleKey: 'plu_arg',
    })

    expect(status).toBe(200)
    expect(body.results.map(({ userId, status: result }) => [userId, result])).toEqual([
      ['usr-a', 'updated'],
      ['usr-b', 'updated'],
    ])
    expect(body.results[0].user).toMatchObject({ id: 'usr-a', roleKey: 'plu_arg' })
    expect(body.results[0].user.permissions).toContain('admin.events.read')
    expect(revoked.sort()).toEqual(['usr-a', 'usr-b'])
    const assigned = prisma._state.auditLogs.filter(
      ({ action }) => action === 'user.access_role_assigned',
    )
    expect(assigned.map(({ entityId }) => entityId).sort()).toEqual(['usr-a', 'usr-b'])
    expect(assigned[0].after).toEqual({ roleKey: 'plu_arg' })
  })

  it('reporta por cuenta lo que no se puede, sin frenar a las demás', async () => {
    const prisma = createPrismaDouble([
      await buildAdmin(),
      staff('usr-ok'),
      staff('usr-ya', {
        accessRole: { key: 'plu_arg', name: 'PLU', baseRole: 'operador_plu_arg' },
      }),
      staff('usr-owner', { role: 'admin_maximal' }),
      staff('usr-gate', { role: 'seguridad_plu_arg' }),
    ])
    const revoked = []
    prisma.session.updateMany = async ({ where }) => {
      revoked.push(where.userId)
      return { count: 1 }
    }

    const { status, body } = await bulk(prisma, {
      userIds: ['usr-admin', 'usr-owner', 'usr-gate', 'usr-fantasma', 'usr-ya', 'usr-ok'],
      roleKey: 'plu_arg',
    })

    expect(status).toBe(200)
    const byId = Object.fromEntries(body.results.map((item) => [item.userId, item]))
    expect(byId['usr-admin']).toMatchObject({ status: 'failed', error: /propio rol/ })
    expect(byId['usr-owner']).toMatchObject({ status: 'failed', error: /Super Admin/ })
    expect(byId['usr-gate']).toMatchObject({ status: 'failed', error: /no se administra/ })
    expect(byId['usr-fantasma']).toMatchObject({ status: 'failed', error: /no existe/ })
    expect(byId['usr-ya'].status).toBe('unchanged')
    expect(byId['usr-ok'].status).toBe('updated')
    // Sólo la que cambió pierde la sesión y queda en auditoría.
    expect(revoked).toEqual(['usr-ok'])
    expect(
      prisma._state.auditLogs.filter(({ action }) => action === 'user.access_role_assigned'),
    ).toHaveLength(1)
    expect(prisma._state.users.find(({ id }) => id === 'usr-owner').role).toBe('admin_maximal')
  })

  it('un id repetido se procesa una sola vez', async () => {
    const prisma = createPrismaDouble([await buildAdmin(), staff('usr-a')])
    const { body } = await bulk(prisma, { userIds: ['usr-a', 'usr-a'], roleKey: 'plu_arg' })

    expect(body.results).toHaveLength(1)
    expect(
      prisma._state.auditLogs.filter(({ action }) => action === 'user.access_role_assigned'),
    ).toHaveLength(1)
  })

  it('rechaza el pedido entero si el rol es Seguridad o no lo puede asignar quien pide', async () => {
    const prisma = createPrismaDouble([await buildAdmin(), staff('usr-a')])

    const security = await bulk(prisma, { userIds: ['usr-a'], roleKey: 'seguridad_plu_arg' })
    expect(security.status).toBe(400)

    // Un Administrador no puede dar el rol de otro Administrador.
    const peer = await bulk(prisma, { userIds: ['usr-a'], roleKey: 'admin_plu_arg' })
    expect(peer.status).toBe(403)

    expect(prisma._state.users.find(({ id }) => id === 'usr-a').role).toBe('operador_plu_arg')
    expect(
      prisma._state.auditLogs.filter(({ action }) => action === 'user.access_role_assigned'),
    ).toHaveLength(0)
  })

  it('valida el pedido: al menos una cuenta y un tope de 100', async () => {
    const prisma = createPrismaDouble([await buildAdmin()])

    expect((await bulk(prisma, { userIds: [], roleKey: 'plu_arg' })).status).toBe(400)
    const many = Array.from({ length: 101 }, (_, index) => `usr-${index}`)
    expect((await bulk(prisma, { userIds: many, roleKey: 'plu_arg' })).status).toBe(400)
  })

  it('exige sesión', async () => {
    const prisma = createPrismaDouble([await buildAdmin(), staff('usr-a')])
    const { status } = await bulk(
      prisma,
      { userIds: ['usr-a'], roleKey: 'plu_arg' },
      { login: false },
    )
    expect(status).toBe(401)
  })
})
