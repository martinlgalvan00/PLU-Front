import bcrypt from 'bcryptjs'

const PASSWORD_COST = 12

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
