import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import {
  ACCESS_ROLE_TEMPLATES,
  getDefaultPermissionsForRole,
  PERMISSION_CATALOG,
  ROLE_HIERARCHY,
} from '../src/lib/permissions.js'
import { hashPassword } from '../server/services/passwordService.js'

const ENV = { AUTH_SECRET: 'test-secret-rbac-plu', APP_URL: 'http://localhost:5173' }
const PASSWORD = 'clave-rbac-123'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function headers(cookie) {
  return {
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
    'X-PLU-Request': 'browser',
    ...(cookie ? { Cookie: cookie } : {}),
  }
}

function roleFromTemplate(roleKey) {
  const template = ACCESS_ROLE_TEMPLATES.find(({ key }) => key === roleKey)
  return {
    id: template.key,
    ...template,
    active: true,
    permissions: getDefaultPermissionsForRole(roleKey).map((permissionKey) => ({
      roleId: template.key,
      permissionKey,
      permission: PERMISSION_CATALOG.find(({ key }) => key === permissionKey),
    })),
    _count: { users: 0 },
  }
}

function createPrismaDouble({ actorRole = 'admin_maximal' } = {}) {
  const roles = ROLE_HIERARCHY.map(roleFromTemplate)
  const actorAccessRole = roles.find(({ key }) => key === actorRole)
  actorAccessRole._count.users = 1
  const users = [
    {
      id: 'usr-admin',
      email: 'admin@pluarg.test',
      passwordHash: null,
      role: actorAccessRole.baseRole,
      accessRole: actorAccessRole,
      status: 'active',
      profile: { displayName: actorAccessRole.name },
      eventId: null,
      eventSlug: null,
    },
  ]
  const sessions = []
  const auditLogs = []

  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.email) return users.find((user) => user.email === where.email) ?? null
        return users.find((user) => user.id === where.id) ?? null
      },
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
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
    accessRole: {
      findMany: async () => roles,
      findUnique: async ({ where }) =>
        roles.find((role) => role.id === where.id || role.key === where.key) ?? null,
      create: async ({ data }) => {
        const { permissions: nestedPermissions, ...roleData } = data
        const role = {
          ...roleData,
          permissions: (nestedPermissions?.create ?? []).map((grant) => {
            const permissionKey = grant.permission.connect.key
            return {
              roleId: roleData.id,
              permissionKey,
              permission: PERMISSION_CATALOG.find(({ key }) => key === permissionKey),
            }
          }),
          _count: { users: 0 },
        }
        roles.push(role)
        return role
      },
    },
    accessRolePermission: {
      deleteMany: async ({ where }) => {
        const role = roles.find((item) => item.id === where.roleId)
        role.permissions = []
        return { count: 1 }
      },
      createMany: async ({ data }) => {
        for (const grant of data) {
          const role = roles.find((item) => item.id === grant.roleId)
          role.permissions.push({
            ...grant,
            permission: PERMISSION_CATALOG.find(({ key }) => key === grant.permissionKey),
          })
        }
        return { count: data.length }
      },
    },
    auditLog: {
      create: async ({ data }) => {
        const log = {
          id: `audit-${auditLogs.length + 1}`,
          createdAt: new Date(Date.UTC(2026, 6, 26, 12, auditLogs.length)),
          ...data,
        }
        auditLogs.push(log)
        return log
      },
      findMany: async () =>
        [...auditLogs].reverse().map((log) => ({
          ...log,
          actor: users.find((user) => user.id === log.actorId) ?? null,
        })),
    },
  }
  prisma.$transaction = async (callback) => callback(prisma)

  return { prisma, users, auditLogs }
}

async function login(url, prismaState) {
  prismaState.users[0].passwordHash = await hashPassword(PASSWORD)
  const response = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email: 'admin@pluarg.test', password: PASSWORD }),
  })
  return response.headers.get('set-cookie')?.split(';')[0]
}

async function updatePermissions(url, cookie, roleKey, permissionKeys) {
  return fetch(`${url}/api/access-control/roles/${roleKey}/permissions`, {
    method: 'PATCH',
    headers: headers(cookie),
    body: JSON.stringify({ permissionKeys }),
  })
}

async function createRole(url, cookie, draft) {
  return fetch(`${url}/api/access-control/roles`, {
    method: 'POST',
    headers: headers(cookie),
    body: JSON.stringify(draft),
  })
}

describe('RBAC jerárquico (/api/access-control/roles)', () => {
  it('lista los cuatro roles base en orden jerárquico', async () => {
    const state = createPrismaDouble()
    const target = listen(createApp({ prisma: state.prisma, env: ENV }))

    try {
      const cookie = await login(target.url, state)
      const response = await fetch(`${target.url}/api/access-control/roles`, {
        headers: headers(cookie),
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.roles.map(({ key }) => key)).toEqual(ROLE_HIERARCHY)
      expect(body.roles.find(({ key }) => key === 'plu_arg').canManagePermissions).toBe(true)
      expect(body.activity).toEqual([])
    } finally {
      await target.close()
    }
  })

  it('permite crear, listar y configurar roles operativos personalizados', async () => {
    const state = createPrismaDouble({ actorRole: 'admin_plu_arg' })
    const target = listen(createApp({ prisma: state.prisma, env: ENV }))

    try {
      const cookie = await login(target.url, state)
      const createResponse = await createRole(target.url, cookie, {
        name: 'Control de plataforma',
        description: 'Opera accesos sin administrar usuarios.',
        permissionKeys: ['admin.events.read', 'admin.checkin.execute'],
      })
      const createBody = await createResponse.json()
      const created = createBody.role

      expect(createResponse.status).toBe(201)
      expect(created).toMatchObject({
        key: 'custom_control_de_plataforma',
        baseRole: 'operador_plu_arg',
        isSystem: false,
        isProtected: false,
        canAssign: true,
        canManagePermissions: true,
      })
      expect(created.permissions).toEqual(['admin.events.read', 'admin.checkin.execute'])
      expect(state.auditLogs.at(-1)).toMatchObject({
        action: 'access_role.created',
        actorId: 'usr-admin',
        entityId: created.id,
      })
      expect(createBody.activity).toMatchObject({
        action: 'access_role.created',
        roleId: created.id,
        roleName: 'Control de plataforma',
        actorName: 'Administrador',
        addedPermissions: ['admin.events.read', 'admin.checkin.execute'],
        removedPermissions: [],
      })

      const listResponse = await fetch(`${target.url}/api/access-control/roles`, {
        headers: headers(cookie),
      })
      const listBody = await listResponse.json()
      const listed = listBody.roles
      expect(listed.map(({ key }) => key)).toContain(created.key)
      expect(listBody.activity[0]).toMatchObject({
        action: 'access_role.created',
        roleId: created.id,
        actorName: 'Administrador',
      })

      const updateResponse = await updatePermissions(target.url, cookie, created.id, [
        'admin.athletes.read',
      ])
      expect(updateResponse.status).toBe(200)
      expect((await updateResponse.json()).role.permissions).toEqual(['admin.athletes.read'])
    } finally {
      await target.close()
    }
  })

  it('permite al Administrador configurar PLU y Seguridad con auditoría', async () => {
    const state = createPrismaDouble({ actorRole: 'admin_plu_arg' })
    const target = listen(createApp({ prisma: state.prisma, env: ENV }))

    try {
      const cookie = await login(target.url, state)
      const pluUpdate = await updatePermissions(target.url, cookie, 'plu_arg', [
        'admin.events.read',
        'admin.events.write',
      ])
      const securityUpdate = await updatePermissions(target.url, cookie, 'seguridad_plu_arg', [
        'admin.events.read',
        'admin.checkin.execute',
        'admin.athletes.read',
      ])

      expect(pluUpdate.status).toBe(200)
      const pluBody = await pluUpdate.json()
      expect(pluBody.role.permissions).toEqual(['admin.events.read', 'admin.events.write'])
      expect(pluBody.activity).toMatchObject({
        action: 'access_role.permissions_updated',
        roleId: 'plu_arg',
        addedPermissions: ['admin.events.write'],
      })
      expect(securityUpdate.status).toBe(200)
      expect(state.auditLogs.at(-1)).toMatchObject({
        action: 'access_role.permissions_updated',
        actorId: 'usr-admin',
        entityId: 'seguridad_plu_arg',
      })
    } finally {
      await target.close()
    }
  })

  it('protege Super Admin y Administrador frente a cambios de matriz', async () => {
    const state = createPrismaDouble()
    const target = listen(createApp({ prisma: state.prisma, env: ENV }))

    try {
      const cookie = await login(target.url, state)
      expect(
        (await updatePermissions(target.url, cookie, 'admin_maximal', ['admin.dashboard.read']))
          .status,
      ).toBe(403)
      expect(
        (await updatePermissions(target.url, cookie, 'admin_plu_arg', ['admin.dashboard.read']))
          .status,
      ).toBe(403)
    } finally {
      await target.close()
    }
  })

  it('impide delegar la administración de roles a PLU o Seguridad', async () => {
    const state = createPrismaDouble({ actorRole: 'admin_plu_arg' })
    const target = listen(createApp({ prisma: state.prisma, env: ENV }))

    try {
      const cookie = await login(target.url, state)
      const response = await updatePermissions(target.url, cookie, 'plu_arg', [
        'admin.roles.read',
        'admin.roles.write',
      ])

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })

  it('impide crear un rol personalizado con administración delegada', async () => {
    const state = createPrismaDouble({ actorRole: 'admin_plu_arg' })
    const target = listen(createApp({ prisma: state.prisma, env: ENV }))

    try {
      const cookie = await login(target.url, state)
      const response = await createRole(target.url, cookie, {
        name: 'Administrador paralelo',
        permissionKeys: ['admin.roles.read', 'admin.roles.write'],
      })

      expect(response.status).toBe(400)
    } finally {
      await target.close()
    }
  })
})
