/**
 * Resolución de sesión al bootstrap (cookies staff + atleta pueden coexistir).
 *
 * En landings de cuenta (`/perfil`, etc.) se prioriza el modo atleta con
 * `staffAvailable` si hay sesión staff. En el resto, si hay staff se restaura
 * el panel operativo.
 */

export const ATHLETE_BRIDGE_LANDING_VIEWS = new Set(['profile', 'membership', 'register'])

/**
 * @param {{
 *   staffUser: object | null,
 *   athleteUser: object | null,
 *   pathView: string | null,
 * }} params
 * @returns {{ session: object | null, mode: 'staff' | 'athlete' | null }}
 */
export function resolveRestoredSession({ staffUser = null, athleteUser = null, pathView = null }) {
  const preferAthleteBridge =
    Boolean(athleteUser) && (!staffUser || ATHLETE_BRIDGE_LANDING_VIEWS.has(pathView))

  if (preferAthleteBridge) {
    return {
      mode: 'athlete',
      session: {
        ...athleteUser,
        staffAvailable: Boolean(athleteUser.staffAvailable || staffUser),
      },
    }
  }

  if (staffUser) {
    return { mode: 'staff', session: staffUser }
  }

  if (athleteUser) {
    return {
      mode: 'athlete',
      session: {
        ...athleteUser,
        staffAvailable: Boolean(athleteUser.staffAvailable),
      },
    }
  }

  return { mode: null, session: null }
}
