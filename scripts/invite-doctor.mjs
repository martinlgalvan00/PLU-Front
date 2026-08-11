#!/usr/bin/env node
/**
 * invite-doctor.mjs — PLU ARG
 *
 * Diagnóstico del flujo de invitación de staff: dar de alta a alguien con un
 * rol y que reciba por mail una credencial que le abra la aplicación.
 *
 * `email:doctor` valida la infraestructura de Brevo en general. Este valida la
 * cadena puntual de la invitación, que tiene tres eslabones propios que fallan
 * en silencio:
 *
 *   1. La columna `User.mustChangePassword`. Sin la migración aplicada, el
 *      alta revienta con un error de Prisma y nadie sabe por qué.
 *   2. El catálogo de `AccessRole` en la base. `resolveAssignableRole` resuelve
 *      contra esas filas: sin seed, todo rol se rechaza con "no existe".
 *   3. `APP_URL`. Sin esto el mail sale con el botón "Entrar al panel" vacío:
 *      la persona recibe la contraseña pero no sabe a dónde ir.
 *
 * Uso:
 *   npm run invite:doctor
 *   npm run invite:doctor -- --send tu@email.com   (manda la invitación real)
 */

import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch {
  // Las variables también pueden venir del entorno del proceso.
}

// Prisma lee DATABASE_URL al construir el cliente, y el repo configura
// SUPABASE_DATABASE_URL. Se normaliza igual que en el arranque del server, y
// antes de importar prisma.js -- si no, el cliente se arma sin URL.
const { applyDeploymentEnvironmentDefaults } = await import(
  '../server/lib/deploymentEnvironment.js'
)
applyDeploymentEnvironmentDefaults(process.env)

const { getPrisma, disconnectPrisma } = await import('../server/lib/prisma.js')
const { createBrevoAdapter } = await import('../server/modules/notifications/brevoAdapter.js')
const { createStaffAccountNotificationService } = await import(
  '../server/modules/notifications/staffAccountNotificationService.js'
)
const { resolveTemplateId } = await import('../server/modules/notifications/emailCatalog.js')
const { generateTempPassword } = await import('../server/services/passwordService.js')
const { ROLE_HIERARCHY } = await import('../src/lib/permissions.js')

const OK = '[32mOK[0m'
const WARN = '[33mAVISO[0m'
const FAIL = '[31mFALLA[0m'

let problems = 0
const fail = (msg, hint) => {
  problems += 1
  console.log(`  ${FAIL}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}
const warn = (msg, hint) => {
  console.log(`  ${WARN}  ${msg}`)
  if (hint) console.log(`         ${hint}`)
}
const ok = (msg) => console.log(`  ${OK}    ${msg}`)

console.log('\n=== Diagnóstico del flujo de invitación · PLU ARG ===\n')

// ------------------------------------------------------------------ 1. config
console.log('Configuración')

const appUrl = (process.env.APP_URL ?? process.env.VITE_APP_URL ?? '').trim()
const isLocalUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(appUrl)

if (!appUrl) {
  fail(
    'APP_URL no está definida.',
    'El mail sale con el botón "Entrar al panel" vacío: reciben la clave sin saber a dónde ir.',
  )
} else if (isLocalUrl) {
  // El mail se entrega igual, pero con un link que sólo funciona en la máquina
  // de quien invita. Es el error más fácil de cometer: probar el flujo en local
  // e invitar gente de verdad desde ahí.
  warn(
    `APP_URL apunta a local (${appUrl}).`,
    'Sirve para probar, pero una invitación real llegaría con un link que el invitado no puede abrir. Para invitar de verdad, usá la URL pública.',
  )
} else {
  ok(`APP_URL = ${appUrl}`)
}

if (!process.env.AUTH_SECRET?.trim()) {
  fail(
    'AUTH_SECRET no está definida.',
    'Sin esto no se firman los tokens de cambio de email (503 al pedirlo).',
  )
} else {
  ok('AUTH_SECRET presente.')
}

// --------------------------------------------------------------- 2. esquema
console.log('\nEsquema de la base')

let prisma
let schemaReady = false
try {
  prisma = getPrisma()
  // Se consulta la columna directamente: si la migración no corrió, Prisma
  // falla acá y no en medio de un alta real hecha por un admin.
  await prisma.$queryRaw`SELECT "mustChangePassword" FROM "User" LIMIT 1`
  ok('Columna User.mustChangePassword presente (migración aplicada).')
  schemaReady = true
} catch (error) {
  const message = error?.message ?? String(error)
  if (/mustChangePassword/i.test(message)) {
    fail(
      'Falta la columna User.mustChangePassword.',
      'Corré la migración: npm run db:migrate (o prisma migrate deploy).',
    )
  } else if (/EMAXCONNSESSION|max clients reached|too many connections/i.test(message)) {
    // No es un problema del flujo: el pooler está lleno. Decirlo evita mandar
    // a alguien a revisar una URL que está bien.
    warn(
      'El pooler de Supabase está sin conexiones libres.',
      'No es un problema del flujo. Cerrá el server de dev o esperá unos segundos y repetí.',
    )
  } else {
    fail(`No se pudo consultar la base: ${message.split('\n')[0]}`, 'Revisá SUPABASE_DATABASE_URL.')
  }
}

// ----------------------------------------------------------------- 3. roles
console.log('\nCatálogo de roles')

if (schemaReady) {
  try {
    const roles = await prisma.accessRole.findMany({
      where: { active: true },
      select: { key: true, name: true },
    })
    const keys = roles.map((role) => role.key)
    const faltantes = ROLE_HIERARCHY.filter((key) => !keys.includes(key))

    if (roles.length === 0) {
      fail(
        'No hay ningún AccessRole activo en la base.',
        'Sin esto toda invitación se rechaza con "El rol seleccionado no existe". Corré: npm run db:seed',
      )
    } else if (faltantes.length > 0) {
      fail(
        `Faltan roles del sistema: ${faltantes.join(', ')}.`,
        'Corré el seed: npm run db:seed',
      )
    } else {
      ok(`${roles.length} rol(es) activo(s): ${keys.join(', ')}`)
    }
  } catch (error) {
    fail(`No se pudo leer AccessRole: ${(error?.message ?? '').split('\n')[0]}`)
  }

  // Alguien tiene que poder invitar. Sin Super Admin no hay quien cree otros
  // administradores.
  try {
    const superAdmins = await prisma.user.count({
      where: { role: 'admin_maximal', status: 'active' },
    })
    if (superAdmins === 0) {
      fail(
        'No hay ninguna cuenta Super Admin activa.',
        'Es el único rol que puede crear otros administradores. Corré: npm run db:seed',
      )
    } else {
      ok(`${superAdmins} cuenta(s) Super Admin activa(s).`)
    }
  } catch (error) {
    fail(`No se pudo contar Super Admins: ${(error?.message ?? '').split('\n')[0]}`)
  }
} else {
  warn('Se omite: el esquema no está listo.')
}

// ------------------------------------------------------------------ 4. envío
console.log('\nEntrega del mail de invitación')

const brevo = createBrevoAdapter({})
if (!brevo.configured) {
  warn(
    'Brevo no está configurado (BREVO_API_KEY / BREVO_SENDER_EMAIL).',
    'El alta va a funcionar igual, pero sin mandar mail: la credencial sólo se ve en pantalla.',
  )
} else {
  ok('Brevo configurado.')
  const templateId = resolveTemplateId('staff_invitation', process.env)
  if (templateId) {
    ok(`Template de Brevo cargado para staff_invitation (id ${templateId}).`)
  } else {
    warn(
      'Sin BREVO_TEMPLATE_STAFF_INVITATION: se usa el fallback HTML del repo.',
      'Es válido — el mail sale con la identidad institucional.',
    )
  }
  console.log('         Para validar remitente, cuota y rebotes: npm run email:doctor')
}

// -------------------------------------------------------- 5. invitación real
const sendIndex = process.argv.indexOf('--send')
if (sendIndex !== -1) {
  const to = process.argv[sendIndex + 1]
  console.log(`\nInvitación real a ${to}`)

  if (!to?.includes('@')) {
    fail('Falta la dirección: npm run invite:doctor -- --send tu@email.com')
  } else if (!brevo.configured) {
    fail('No se puede enviar sin Brevo configurado.')
  } else {
    // Se manda el mail real, con el mismo servicio y template que usa el alta,
    // pero SIN crear la cuenta: esto valida la entrega, no el alta. El alta de
    // verdad se hace desde el panel.
    const tempPassword = generateTempPassword()
    const notifications = createStaffAccountNotificationService({ brevo, env: process.env })

    try {
      const result = await notifications.notifyStaffInvitation({
        user: { id: `doctor-${Date.now()}`, email: to, name: 'Prueba de invitación' },
        tempPassword,
        roleName: 'Administrador',
      })

      if (result?.status === 'sent') {
        ok(`Aceptado por Brevo · contraseña de la prueba: ${tempPassword}`)
        warn(
          'Ojo: esta contraseña NO corresponde a ninguna cuenta.',
          'El mail valida la entrega y el contenido, no crea usuario. Las altas van por el panel.',
        )
      } else {
        fail(`El envío no se confirmó (status ${result?.status ?? '?'}).`)
      }
    } catch (error) {
      fail(`No se pudo enviar: ${error?.message ?? error}`)
    }
  }
}

await disconnectPrisma().catch(() => {})

console.log(
  problems === 0
    ? '\n=== Flujo de invitación listo para usarse ===\n'
    : `\n=== ${problems} problema(s) bloqueante(s) ===\n`,
)
process.exit(problems === 0 ? 0 : 1)
