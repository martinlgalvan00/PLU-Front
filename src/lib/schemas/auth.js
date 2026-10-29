import { z } from 'zod'
import { isEventScopedRole } from '../permissions.js'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  password: z
    .string()
    .min(8, 'Ingresá una contraseña de al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
  eventSlug: z.string().trim().min(1).optional(),
  // Default false: sin el flag la cookie es de sesión y se pierde al cerrar
  // el navegador. No persistimos la contraseña; sólo alargamos la cookie.
  remember: z.boolean().optional().default(false),
})

const eventIdsSchema = z
  .array(z.string().uuid('Cada evento tiene que ser un id válido.'))
  .max(50, 'Podés asignar hasta 50 eventos.')
  .transform((ids) => [...new Set(ids)])

// Alta de cuentas de staff del panel (no atletas, no seguridad). Se crean con
// una credencial interna aleatoria que nunca se expone y reciben por mail un
// enlace firmado para elegir su contraseña. Auth0 sigue soportado para quien ya
// tenga identidad vinculada, pero no es requisito: nunca estuvo configurado y
// las cuentas creadas por acá quedaban sin ninguna forma de entrar.
// seguridad_plu_arg queda afuera a propósito -- esas cuentas van por
// createSecurityUserSchema (atadas a un evento y con credencial de puerta).
// Nombre y email son opcionales: sin email es una invitación abierta y la
// persona los completa al abrir el enlace. Con email, el nombre es obligatorio.
// Rol Organizador: exige al menos un evento en el mismo alta (UserEventAccess).
export const createStaffUserSchema = z
  .object({
    name: z.string().trim().min(3, 'Ingresá un nombre de al menos 3 caracteres.').optional(),
    email: z.string().trim().toLowerCase().email('Ingresá un correo válido.').optional(),
    role: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z][a-z0-9_]{2,47}$/),
    eventIds: eventIdsSchema.optional().default([]),
    sendEmail: z.boolean().optional().default(true),
    // El panel pide el enlace para copiarlo y mandarlo por otro canal. Es opt-in:
    // sin el flag la respuesta nunca incluye el token.
    returnLink: z.boolean().optional().default(false),
  })
  .refine((value) => !value.email || Boolean(value.name), {
    path: ['name'],
    message: 'Ingresá un nombre de al menos 3 caracteres.',
  })
  .refine((value) => !isEventScopedRole(value.role) || value.eventIds.length > 0, {
    path: ['eventIds'],
    message: 'Asigná al menos un evento.',
  })

/** Reenvío de invitación / reseteo de la credencial de una cuenta de staff. */
export const resetStaffPasswordSchema = z.object({
  sendEmail: z.boolean().optional().default(true),
  returnLink: z.boolean().optional().default(false),
})

// Mínimo 12 caracteres, igual que el reset de atletas (routes/athletes.js).
// El máximo de 72 no es cosmético: bcrypt trunca silenciosamente ahí, así que
// aceptar más largo daría una falsa sensación de fortaleza.
const strongPassword = z
  .string()
  .min(12, 'Elegí una contraseña de al menos 12 caracteres.')
  .max(72, 'La contraseña no puede superar los 72 caracteres.')

export const acceptStaffInvitationSchema = z.object({
  token: z.string().trim().min(40).max(2000),
  password: strongPassword,
  // Sólo se usan cuando la invitación es abierta (la cuenta todavía no tiene
  // email propio); en una invitación nominal el servidor los ignora.
  name: z.string().trim().min(3, 'Ingresá tu nombre y apellido.').max(120).optional(),
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.').max(254).optional(),
})

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingresá tu contraseña actual.').max(200),
    password: strongPassword,
  })
  .refine((value) => value.currentPassword !== value.password, {
    path: ['password'],
    message: 'La contraseña nueva tiene que ser distinta de la actual.',
  })

/**
 * El cambio de email pide la contraseña actual: la sesión sola no alcanza para
 * mover la identidad de login de una cuenta con permisos de panel.
 */
export const requestEmailChangeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  currentPassword: z.string().min(1, 'Ingresá tu contraseña actual.').max(200),
})

export const confirmEmailChangeSchema = z.object({
  token: z.string().trim().min(10, 'Enlace inválido.'),
})

export const createSecurityUserSchema = z.object({
  name: z.string().trim().min(3, 'Ingresá un nombre de al menos 3 caracteres.'),
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  eventId: z.string().trim().min(1, 'Elegí un evento.'),
  sendEmail: z.boolean().optional().default(false),
})

// Alta masiva: hasta 50 accesos de una para no abusar del pool de conexiones
// ni de la cuota de Brevo en un solo request. Los emails duplicados dentro
// del mismo lote se rechazan acá (antes de tocar la DB) con un mensaje claro.
export const SECURITY_USERS_BULK_MAX = 50

const bulkEntrySchema = z.object({
  name: z.string().trim().min(3, 'Ingresá un nombre de al menos 3 caracteres.'),
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
})

export const createSecurityUsersBulkSchema = z.object({
  eventId: z.string().trim().min(1, 'Elegí un evento.'),
  sendEmail: z.boolean().optional().default(false),
  users: z
    .array(bulkEntrySchema)
    .min(1, 'Agregá al menos una cuenta.')
    .max(SECURITY_USERS_BULK_MAX, `Máximo ${SECURITY_USERS_BULK_MAX} cuentas por lote.`)
    .superRefine((entries, ctx) => {
      const seen = new Set()
      entries.forEach((entry, index) => {
        if (seen.has(entry.email)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'email'],
            message: `El correo ${entry.email} está repetido en la lista.`,
          })
          return
        }
        seen.add(entry.email)
      })
    }),
})

export const updateSecurityUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
})

/** Ciclo de vida de cuentas de staff del panel (no seguridad de evento). */
export const updateStaffUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended', 'disabled']),
})

export const deactivateAllSecurityUsersSchema = z.object({
  eventId: z.string().trim().min(1, 'Elegí un evento.'),
})

export const createSecurityAccessLinkSchema = z.object({
  sendEmail: z.boolean().optional().default(false),
  expiresAt: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), 'Vencimiento inválido.'),
})

export const securityGateSchema = z.object({
  token: z.string().trim().min(10, 'Credencial inválida.'),
})
