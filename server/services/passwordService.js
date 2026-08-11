import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

const PASSWORD_COST = 12

/**
 * Contraseña temporal para un alta de staff o de seguridad. 9 bytes de
 * entropía real (72 bits) en base64url: alcanza de sobra para una credencial
 * de un solo uso y entra cómoda en un mail o dictada por teléfono.
 *
 * Vive acá y no en `routes/auth.js` porque la usan tres altas distintas
 * (seguridad individual, seguridad masiva y staff del panel).
 */
export function generateTempPassword() {
  return randomBytes(9).toString('base64url')
}

/**
 * Vigencia de una credencial temporal de staff. Siete días: cubre a alguien
 * que vuelve de un fin de semana largo sin dejar la invitación viva para
 * siempre. Vencida, el admin reemite desde Usuarios.
 */
export const TEMP_PASSWORD_TTL_DAYS = 7
const TEMP_PASSWORD_TTL_MS = TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000

export function tempPasswordExpiry(now = new Date()) {
  return new Date(now.getTime() + TEMP_PASSWORD_TTL_MS)
}

/**
 * Sólo aplica a credenciales temporales: una contraseña elegida por el usuario
 * no caduca (`passwordExpiresAt` queda en null al cambiarla).
 */
export function isTempPasswordExpired(user, now = new Date()) {
  if (!user?.mustChangePassword || !user?.passwordExpiresAt) return false
  return new Date(user.passwordExpiresAt).getTime() <= now.getTime()
}

/**
 * Hash fijo, de una contraseña aleatoria que nadie conoce, usado solo para
 * gastar el mismo tiempo de CPU cuando la cuenta no existe o no tiene
 * credencial. Sin esto el login respondía en microsegundos para un email
 * inexistente y en ~250 ms para uno real: la diferencia alcanza para enumerar
 * el padrón sin fallar un solo intento. Tiene que ser del mismo coste (12) que
 * los hashes reales, o la comparación de tiempos vuelve a delatar.
 */
const TIMING_EQUALIZER_HASH = '$2b$12$qt651GoXFvloG5/E4WAJmeUoq4phxytd5uRbKZCl.U27p2B3GgAwG'

export function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_COST)
}

export async function verifyPassword(password, passwordHash) {
  if (!passwordHash) {
    await bcrypt.compare(String(password ?? ''), TIMING_EQUALIZER_HASH)
    return false
  }

  return bcrypt.compare(password, passwordHash)
}
