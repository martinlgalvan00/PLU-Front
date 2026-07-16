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

export const createSecurityUserSchema = z.object({
  name: z.string().trim().min(3, 'Ingresá un nombre de al menos 3 caracteres.'),
  email: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  eventId: z.string().trim().min(1, 'Elegí un evento.'),
})
