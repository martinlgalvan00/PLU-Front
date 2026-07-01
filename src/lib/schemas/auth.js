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
})
