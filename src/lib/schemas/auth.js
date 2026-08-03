import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Ingresá un correo válido.'),
  password: z
    .string()
    .min(8, 'Ingresá una contraseña de al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
  eventSlug: z.string().trim().min(1).optional(),
})

// Alta de cuentas de staff del panel (no atletas, no seguridad). Se crean
// sin contraseña: entran por Auth0 (invitación) y resolveOAuthUser vincula la
// identidad por email en el primer login. seguridad_plu_arg queda afuera a
// propósito -- esas cuentas van por createSecurityUserSchema (atadas a un
// evento y con credencial de puerta).
export const createStaffUserSchema = z.object({
  name: z.string().trim().min(3, 'Ingresá un nombre de al menos 3 caracteres.'),
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  role: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,47}$/),
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
