import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../server/services/passwordService.js'

const prisma = new PrismaClient()

const allowedRoles = new Set([
  'admin_maximal',
  'admin_plu_arg',
  'operador_plu_arg',
  'viewer_plu_usa',
])

function readSeedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD
  const role = process.env.SEED_ADMIN_ROLE?.trim() || 'admin_plu_arg'
  const firstName = process.env.SEED_ADMIN_FIRST_NAME?.trim() || 'Admin'
  const lastName = process.env.SEED_ADMIN_LAST_NAME?.trim() || 'PLU'

  if (!email && !password) return null
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD deben configurarse juntos.')
  }
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 8 caracteres.')
  }
  if (!allowedRoles.has(role)) {
    throw new Error(`SEED_ADMIN_ROLE invalido: ${role}`)
  }

  return { email, password, role, firstName, lastName }
}

async function main() {
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
      role: seedAdmin.role,
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
      role: seedAdmin.role,
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

  console.info(`Admin seed listo: ${seedAdmin.email} (${seedAdmin.role})`)
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
