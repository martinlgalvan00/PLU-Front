import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  password: z
    .string()
    .min(8, 'Ingresá una contraseña de al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
  eventSlug: z.string().trim().min(1).optional(),
})

// Alta de cuentas de staff del panel (no atletas, no seguridad). Se crean con
// una credencial interna aleatoria que nunca se expone y reciben por mail un
// enlace firmado para elegir su contraseña. Auth0 sigue soportado para quien ya
// tenga identidad vinculada, pero no es requisito: nunca estuvo configurado y
// las cuentas creadas por acá quedaban sin ninguna forma de entrar.
// seguridad_plu_arg queda afuera a propósito -- esas cuentas van por
// createSecurityUserSchema (atadas a un evento y con credencial de puerta).
export const createStaffUserSchema = z.object({
  name: z.string().trim().min(3, 'Ingresá un nombre de al menos 3 caracteres.'),
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  role: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{2,47}$/),
  sendEmail: z.boolean().optional().default(true),
})

/** Reenvío de invitación / reseteo de la credencial de una cuenta de staff. */
export const resetStaffPasswordSchema = z.object({
  sendEmail: z.boolean().optional().default(true),
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
})

export const securityGateSchema = z.object({
  token: z.string().trim().min(10, 'Credencial inválida.'),
})
