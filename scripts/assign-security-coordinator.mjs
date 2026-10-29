#!/usr/bin/env node
/**
 * assign-security-coordinator.mjs — PLU ARG
 *
 * Asigna el rol Coordinador de seguridad a una cuenta ya existente y la limita
 * a un evento (por defecto Pitbull Classic). No crea usuarios ni contraseñas:
 * si el mail no está en el panel, hay que invitarlo desde Usuarios.
 *
 * No toca Super Admin ni Administrador: bajarlos de rol es otra decisión.
 *
 * Uso:
 *   node scripts/assign-security-coordinator.mjs
 *   node scripts/assign-security-coordinator.mjs --email alguien@plu.test --event otro-slug
 */

import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch {
  // Las variables también pueden venir del entorno del proceso.
}

const { applyDeploymentEnvironmentDefaults } = await import(
  '../server/lib/deploymentEnvironment.js'
)
applyDeploymentEnvironmentDefaults(process.env)

const { getPrisma, disconnectPrisma } = await import('../server/lib/prisma.js')
const { getSupabaseAdmin } = await import('../server/lib/supabaseAdmin.js')
const { revokeSessionsForUser } = await import('../server/services/sessionService.js')

const ROLE_KEY = 'coordinador_seguridad'
const PROTECTED_ROLES = new Set(['admin_maximal', 'admin_plu_arg'])

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1 || !process.argv[index + 1]) return fallback
  return process.argv[index + 1]
}

const email = arg('email', 'agusdisanto99@gmail.com').trim().toLowerCase()
const eventSlug = arg('event', 'pitbull-classic-2026').trim()

const prisma = getPrisma()

try {
  const role = await prisma.accessRole.findUnique({ where: { key: ROLE_KEY } })
  if (!role) {
    console.error(
      `No existe el rol ${ROLE_KEY}. Aplicá las migraciones de Prisma y volvé a correr este script.`,
    )
    process.exitCode = 1
  } else {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { accessRole: true, eventAccess: true },
    })
    if (!user) {
      console.error(
        `No hay una cuenta de panel con ${email}. Un Super Admin tiene que invitarla con el rol Coordinador de seguridad y el evento ${eventSlug}.`,
      )
      process.exitCode = 1
    } else if (
      PROTECTED_ROLES.has(user.role) ||
      PROTECTED_ROLES.has(user.accessRole?.key)
    ) {
      console.error(
        `${email} es ${user.accessRole?.key ?? user.role}. Este script no baja de rol a Super Admin ni a Administrador.`,
      )
      process.exitCode = 2
    } else {
      const supabase = getSupabaseAdmin()
      if (!supabase) {
        console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para ubicar el evento.')
        process.exitCode = 1
      } else {
        const { data: event, error } = await supabase
          .from('events')
          .select('id, slug')
          .eq('slug', eventSlug)
          .maybeSingle()
        if (error || !event?.id) {
          console.error(
            error
              ? `No se pudo leer el evento ${eventSlug}: ${error.message}`
              : `No existe un evento con slug ${eventSlug}.`,
          )
          process.exitCode = 1
        } else {
          const already =
            user.accessRole?.key === ROLE_KEY &&
            user.eventAccess.length === 1 &&
            user.eventAccess[0].eventId === event.id &&
            user.eventAccess[0].eventSlug === event.slug

          await prisma.user.update({
            where: { id: user.id },
            data: {
              role: 'operador_plu_arg',
              accessRole: { connect: { id: role.id } },
              eventId: null,
              eventSlug: null,
              securityZoneId: null,
            },
          })

          await prisma.userEventAccess.deleteMany({
            where: { userId: user.id, eventId: { not: event.id } },
          })
          await prisma.userEventAccess.upsert({
            where: { userId_eventId: { userId: user.id, eventId: event.id } },
            create: { userId: user.id, eventId: event.id, eventSlug: event.slug },
            update: { eventSlug: event.slug },
          })

          if (!already) {
            const revoked = await revokeSessionsForUser({ prisma, userId: user.id })
            console.log(
              `${email} quedó como coordinador de seguridad de ${event.slug}. Sesiones cerradas: ${revoked}. Tiene que volver a entrar.`,
            )
          } else {
            console.log(`${email} ya coordinaba ${event.slug}. No cambié la sesión.`)
          }
        }
      }
    }
  }
} finally {
  await disconnectPrisma()
}
