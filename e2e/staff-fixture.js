import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../server/services/passwordService.js'
import { localPrismaDatabaseUrl, PRISMA_E2E_SCHEMA, resolveLocalSupabase } from './local-supabase.js'

export const GATE_PASSWORD = 'E2eGate-2026!'

function prismaUrl() {
  return localPrismaDatabaseUrl(resolveLocalSupabase())
}

function createPrisma() {
  return new PrismaClient({
    datasources: { db: { url: prismaUrl() } },
    log: ['error'],
  })
}

/**
 * Crea el schema `plu_e2e` y aplica las migraciones de Prisma. Idempotente.
 * Las cuentas de puerta viven acá, no en `public`.
 */
export async function ensurePrismaE2eSchema() {
  const bootstrapUrl = new URL(resolveLocalSupabase().databaseUrl)
  const bootstrap = new PrismaClient({
    datasources: { db: { url: bootstrapUrl.toString() } },
    log: ['error'],
  })
  try {
    await bootstrap.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ${PRISMA_E2E_SCHEMA}`)
  } finally {
    await bootstrap.$disconnect()
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: prismaUrl() },
  })
}

async function wipeStaleGateStaff(prisma) {
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'e2e-gate-' } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'e2e-admin-' } },
  })
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'e2e-security-ui-' } },
  })
  // Organizadores: sus eventos asignados (UserEventAccess) caen en cascada.
  await prisma.user.deleteMany({
    where: { email: { startsWith: 'e2e-org-' } },
  })
  await prisma.eventSecurityZone.deleteMany({ where: { eventSlug: { startsWith: 'e2e-' } } })
}

/**
 * Dos puestos reales del meet: puerta (entradas de público) y calentamiento
 * (credencial ENTRENADOR). Misma contraseña, distinto alcance.
 */
export async function seedSecurityStaff({ run, eventId, eventSlug }) {
  await ensurePrismaE2eSchema()
  const prisma = createPrisma()
  try {
    await wipeStaleGateStaff(prisma)
    const accessRole = await prisma.accessRole.findUnique({
      where: { key: 'seguridad_plu_arg' },
    })
    if (!accessRole) {
      throw new Error('Falta AccessRole seguridad_plu_arg en el schema plu_prisma.')
    }

    const passwordHash = await hashPassword(GATE_PASSWORD)
    const gateZone = await prisma.eventSecurityZone.create({
      data: {
        eventId,
        eventSlug,
        name: 'Puerta principal',
        scope: 'gate_tickets',
        sortOrder: 0,
      },
    })
    const warmupZone = await prisma.eventSecurityZone.create({
      data: {
        eventId,
        eventSlug,
        name: 'Entrada en calor',
        scope: 'athletes_coaches',
        sortOrder: 1,
      },
    })

    const gateEmail = `e2e-gate-${run}@pluarg.test`
    const warmupEmail = `e2e-gate-warmup-${run}@pluarg.test`

    await prisma.user.create({
      data: {
        email: gateEmail,
        passwordHash,
        role: 'seguridad_plu_arg',
        status: 'active',
        mustChangePassword: false,
        eventId,
        eventSlug,
        accessRoleId: accessRole.id,
        securityZoneId: gateZone.id,
        profile: { create: { firstName: 'E2E', lastName: 'Puerta', displayName: 'E2E Puerta' } },
      },
    })
    await prisma.user.create({
      data: {
        email: warmupEmail,
        passwordHash,
        role: 'seguridad_plu_arg',
        status: 'active',
        mustChangePassword: false,
        eventId,
        eventSlug,
        accessRoleId: accessRole.id,
        securityZoneId: warmupZone.id,
        profile: {
          create: { firstName: 'E2E', lastName: 'Calentamiento', displayName: 'E2E Calentamiento' },
        },
      },
    })

    const adminRole = await prisma.accessRole.findUnique({
      where: { key: 'admin_plu_arg' },
    })
    if (!adminRole) {
      throw new Error('Falta AccessRole admin_plu_arg en el schema plu_prisma.')
    }
    const adminEmail = `e2e-admin-${run}@pluarg.test`
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        role: 'admin_plu_arg',
        status: 'active',
        mustChangePassword: false,
        accessRoleId: adminRole.id,
        profile: { create: { firstName: 'E2E', lastName: 'Admin', displayName: 'E2E Admin' } },
      },
    })

    return {
      gateEmail,
      warmupEmail,
      gatePassword: GATE_PASSWORD,
      gateZoneName: gateZone.name,
      warmupZoneName: warmupZone.name,
      adminEmail,
      adminPassword: GATE_PASSWORD,
    }
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Un organizador con acceso SOLO a los eventos que se le pasan. El rol de sistema
 * `organizador_evento` lo crea la migración 20261218100000 (el schema de e2e la aplica
 * con `prisma migrate deploy`).
 */
export async function seedOrganizer({ run, events }) {
  const prisma = createPrisma()
  try {
    const role = await prisma.accessRole.findUnique({ where: { key: 'organizador_evento' } })
    if (!role) {
      throw new Error('Falta AccessRole organizador_evento: aplicá la migración 20261218100000.')
    }
    const email = `e2e-org-${run}@pluarg.test`
    await prisma.user.deleteMany({ where: { email } })
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(GATE_PASSWORD),
        role: 'operador_plu_arg',
        status: 'active',
        mustChangePassword: false,
        accessRoleId: role.id,
        eventAccess: {
          create: events.map(({ eventId, eventSlug }) => ({ eventId, eventSlug })),
        },
        profile: {
          create: { firstName: 'E2E', lastName: 'Organizador', displayName: 'E2E Organizador' },
        },
      },
    })
    return { organizerEmail: email, organizerPassword: GATE_PASSWORD }
  } finally {
    await prisma.$disconnect()
  }
}

export async function deleteSecurityStaff() {
  const prisma = createPrisma()
  try {
    await wipeStaleGateStaff(prisma)
  } finally {
    await prisma.$disconnect()
  }
}
