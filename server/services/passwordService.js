import bcrypt from 'bcryptjs'

const PASSWORD_COST = 12

export function hashPassword(password) {
  return bcrypt.hash(password, PASSWORD_COST)
}

export function verifyPassword(password, passwordHash) {
  if (!passwordHash) return false

  return bcrypt.compare(password, passwordHash)
}
