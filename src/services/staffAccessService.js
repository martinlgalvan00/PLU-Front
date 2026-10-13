// Reglas de acceso al panel que comparten Usuarios y la ficha del atleta.
// El atleta y la cuenta del panel son identidades distintas (Supabase vs.
// Prisma); lo único que las une es el email, así que el cruce se hace ahí.

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

// Cuenta del panel que ya usa ese email, o null. Un email reservado de
// invitación abierta nunca coincide con el de una persona real.
export function findStaffAccount(users, email) {
  const target = normalizeEmail(email)
  if (!target) return null
  return (users ?? []).find((user) => normalizeEmail(user.email) === target) ?? null
}

// Del rol más alto al más bajo; los roles a medida van al final, por nombre.
// Seguridad no se asigna desde acá: se crea por evento.
export function listAssignableStaffRoles(accessRoles) {
  return (accessRoles ?? [])
    .filter((role) => role.active !== false && role.canAssign)
    .sort(
      (a, b) =>
        (a.hierarchyLevel ?? 99) - (b.hierarchyLevel ?? 99) || a.name.localeCompare(b.name),
    )
}

// Emails de atletas que ya tienen cuenta del panel, para marcarlos en Usuarios.
export function indexAthletesByEmail(athletes) {
  const index = new Map()
  for (const athlete of athletes ?? []) {
    const key = normalizeEmail(athlete.email)
    if (key && !index.has(key)) index.set(key, athlete)
  }
  return index
}
