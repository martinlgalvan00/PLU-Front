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
