import { z } from 'zod'
import { PERMISSION_KEYS } from '../permissions.js'

const roleKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Ingresá una clave de al menos 3 caracteres.')
  .max(48, 'La clave del rol es demasiado larga.')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Usá sólo letras minúsculas, números y guiones bajos; la clave debe empezar con una letra.',
  )

const permissionKeySchema = z
  .string()
  .refine((permissionKey) => PERMISSION_KEYS.includes(permissionKey), 'El permiso no existe.')

export const createAccessRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Ingresá un nombre de al menos 3 caracteres.')
    .max(64, 'El nombre del rol es demasiado largo.'),
  description: z
    .string()
    .trim()
    .max(180, 'La descripción es demasiado larga.')
    .optional()
    .default(''),
  permissionKeys: z.array(permissionKeySchema).max(PERMISSION_KEYS.length).optional().default([]),
})

export const updateAccessRolePermissionsSchema = z.object({
  permissionKeys: z.array(permissionKeySchema).max(PERMISSION_KEYS.length),
})

export const updateAccessRoleStatusSchema = z.object({ active: z.boolean() })

export const updateUserAccessRoleSchema = z.object({
  roleKey: roleKeySchema,
})

/** Tope de cuentas por pedido: acota el trabajo de un request y su auditoría. */
export const BULK_USER_ROLE_MAX = 100

export const bulkUserAccessRoleSchema = z.object({
  userIds: z
    .array(z.string().trim().min(1, 'Falta el id de una cuenta.'))
    .min(1, 'Elegí al menos una cuenta.')
    .max(BULK_USER_ROLE_MAX, `Podés cambiar hasta ${BULK_USER_ROLE_MAX} cuentas por vez.`)
    // Un id repetido no debe auditar ni cortar sesiones dos veces.
    .transform((userIds) => [...new Set(userIds)]),
  roleKey: roleKeySchema,
})
