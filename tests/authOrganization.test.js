import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireOrganizationRole } from '../server/middleware/auth.js'
import { readSessionFromRequest } from '../server/services/sessionService.js'

vi.mock('../server/services/sessionService.js', () => ({
  readSessionFromRequest: vi.fn(),
}))

async function runMiddlewareStack(stack, req = {}) {
  const response = {}
  let index = 0

  return new Promise((resolve) => {
    const next = (error) => {
      if (error) {
        resolve(error)
        return
      }

      const middleware = stack[index]
      index += 1

      if (!middleware) {
        resolve(null)
        return
      }

      middleware(req, response, next)
    }

    next()
  })
}

function createPrismaDouble(memberships) {
  return {
    organizationMember: {
      findFirst: vi.fn(async ({ where }) => {
        return (
          memberships.find((membership) => {
            return (
              membership.organizationId === where.organizationId &&
              membership.userId === where.userId &&
              membership.status === where.status &&
              where.role.in.includes(membership.role)
            )
          }) ?? null
        )
      }),
    },
  }
}

describe('organization RBAC middleware', () => {
  beforeEach(() => {
    readSessionFromRequest.mockReset()
  })

  it('permite la accion cuando el usuario tiene rol activo en la organizacion', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: { id: 'usr-1', role: 'operador_plu_arg' },
    })
    const prisma = createPrismaDouble([
      { organizationId: 'org-1', userId: 'usr-1', role: 'operator', status: 'active' },
    ])
    const stack = requireOrganizationRole(['admin', 'operator'], { prisma })
    const req = { params: { organizationId: 'org-1' }, headers: {}, cookies: {} }

    const error = await runMiddlewareStack(stack, req)

    expect(error).toBeNull()
    expect(req.organizationRole).toEqual({
      organizationId: 'org-1',
      role: 'operator',
    })
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'usr-1',
        status: 'active',
        role: { in: ['admin', 'operator'] },
      },
      select: { role: true },
    })
  })

  it('rechaza usuarios sin membresia activa en esa organizacion', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: { id: 'usr-1', role: 'operador_plu_arg' },
    })
    const prisma = createPrismaDouble([
      { organizationId: 'org-2', userId: 'usr-1', role: 'operator', status: 'active' },
    ])
    const stack = requireOrganizationRole(['admin', 'operator'], { prisma })
    const req = { params: { organizationId: 'org-1' }, headers: {}, cookies: {} }

    const error = await runMiddlewareStack(stack, req)

    expect(error.status).toBe(403)
    expect(error.message).toBe('No tenes permisos para esta organizacion.')
  })

  it('rechaza requests sin organizationId validado en params', async () => {
    readSessionFromRequest.mockResolvedValue({
      user: { id: 'usr-1', role: 'operador_plu_arg' },
    })
    const prisma = createPrismaDouble([])
    const stack = requireOrganizationRole(['admin'], { prisma })
    const req = { params: {}, headers: {}, cookies: {} }

    const error = await runMiddlewareStack(stack, req)

    expect(error.status).toBe(400)
    expect(error.message).toBe('Falta organizationId.')
  })
})
