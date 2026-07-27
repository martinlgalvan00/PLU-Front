import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../server/services/passwordService.js'
import {
  ACCESS_ROLE_TEMPLATES,
  getDefaultPermissionsForRole,
  PERMISSION_CATALOG,
} from '../src/lib/permissions.js'

const prisma = new PrismaClient()

const allowedRoles = new Set(ACCESS_ROLE_TEMPLATES.map(({ key }) => key))

function readSeedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  const roleKey = process.env.SEED_ADMIN_ROLE?.trim() || 'admin_plu_arg'
  const firstName = process.env.SEED_ADMIN_FIRST_NAME?.trim() || 'Admin'
  const lastName = process.env.SEED_ADMIN_LAST_NAME?.trim() || 'PLU'

  if (!email && !password) return null
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben configurarse juntos.')
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres.')
  }
  if (!allowedRoles.has(roleKey)) {
    throw new Error(`SEED_ADMIN_ROLE invalido: ${roleKey}`)
  }

  const accessRole = ACCESS_ROLE_TEMPLATES.find(({ key }) => key === roleKey)
  return {
    email,
    password,
    roleKey,
    baseRole: accessRole.baseRole,
    firstName,
    lastName,
  }
}

async function ensureAccessControlCatalog() {
  const activeRoleKeys = ACCESS_ROLE_TEMPLATES.map(({ key }) => key)

  for (const permission of PERMISSION_CATALOG) {
    await prisma.accessPermission.upsert({
      where: { key: permission.key },
      create: {
        key: permission.key,
        module: permission.module,
        action: permission.action,
        label: permission.actionLabel,
        description: permission.description,
        sortOrder: permission.sortOrder,
      },
      update: {
        module: permission.module,
        action: permission.action,
        label: permission.actionLabel,
        description: permission.description,
        sortOrder: permission.sortOrder,
      },
    })
  }

  for (const template of ACCESS_ROLE_TEMPLATES) {
    const existing = await prisma.accessRole.findUnique({ where: { key: template.key } })
    // hierarchyLevel vive en el catálogo JS; AccessRole no tiene esa columna.
    const { hierarchyLevel: _hierarchyLevel, ...roleFields } = template
    await prisma.accessRole.upsert({
      where: { key: template.key },
      create: {
        id: template.key,
        ...roleFields,
        permissions: {
          create: getDefaultPermissionsForRole(template.key).map((permissionKey) => ({
            permission: { connect: { key: permissionKey } },
          })),
        },
      },
      update: {
        name: template.name,
        description: template.description,
        baseRole: template.baseRole,
        isSystem: template.isSystem,
        isProtected: template.isProtected,
        assignableByAdmin: template.assignableByAdmin,
        active: true,
      },
    })

    if (!existing) {
      console.info(`Rol inicial creado: ${template.name}`)
    }

    if (template.isProtected) {
      await prisma.accessRolePermission.createMany({
        data: getDefaultPermissionsForRole(template.key).map((permissionKey) => ({
          roleId: template.key,
          permissionKey,
        })),
        skipDuplicates: true,
      })
    }
  }

  await prisma.accessRole.updateMany({
    where: { isSystem: true, key: { notIn: activeRoleKeys } },
    data: { active: false },
  })
}

async function main() {
  await ensureAccessControlCatalog()
  const seedAdmin = readSeedAdmin()

  if (!seedAdmin) {
    console.info(
      'Seed omitido: configura SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crear un admin.',
    )
    return
  }

  const passwordHash = await hashPassword(seedAdmin.password)

  await prisma.user.upsert({
    where: { email: seedAdmin.email },
    create: {
      email: seedAdmin.email,
      passwordHash,
      role: seedAdmin.baseRole,
      accessRole: { connect: { key: seedAdmin.roleKey } },
      status: 'active',
      profile: {
        create: {
          firstName: seedAdmin.firstName,
          lastName: seedAdmin.lastName,
          displayName: `${seedAdmin.firstName} ${seedAdmin.lastName}`,
        },
      },
    },
    update: {
      passwordHash,
      role: seedAdmin.baseRole,
      accessRole: { connect: { key: seedAdmin.roleKey } },
      status: 'active',
      profile: {
        upsert: {
          create: {
            firstName: seedAdmin.firstName,
            lastName: seedAdmin.lastName,
            displayName: `${seedAdmin.firstName} ${seedAdmin.lastName}`,
          },
          update: {
            firstName: seedAdmin.firstName,
            lastName: seedAdmin.lastName,
            displayName: `${seedAdmin.firstName} ${seedAdmin.lastName}`,
          },
        },
      },
    },
  })

  console.info(`Admin seed listo: ${seedAdmin.email} (${seedAdmin.roleKey})`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
