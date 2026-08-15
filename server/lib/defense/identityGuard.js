import { createHash } from 'node:crypto'
import { HttpError } from '../errors.js'

/**
 * identityGuard.js — PLU ARG
 *
 * Bloqueo de fuerza bruta **por cuenta**, complementario al limite por IP.
 *
 * Los dos controles frenan cosas distintas y ninguno cubre lo del otro:
 *
 *   - El limite por IP frena a una maquina probando muchas cuentas.
 *   - Este frena a muchas maquinas probando una cuenta.
 *
 * El segundo caso es el credential stuffing real: una lista de credenciales
 * filtradas rotando por un pool de IPs residenciales. Cada IP hace dos o tres
 * intentos, nunca toca el limite de 20 cada 15 minutos, y entre todas barren la
 * casilla del administrador sin fricción. Contra eso el contador por IP no ve
 * nada: hay que contar del lado de la cuenta.
 *
 * ── Tres propiedades que importan ─────────────────────────────────────────
 *
 * **El email nunca llega a la base.** Se guarda un SHA-256 con sal de servidor
 * (`AUTH_SECRET`). Un volcado de `identity_lockouts` no dice que casillas
 * existen ni cuales estan bajo ataque nominalmente.
 *
 * **Se consulta antes del bcrypt.** `hashPassword` usa coste 12 sobre bcryptjs,
 * que es JavaScript puro: cada verificacion son ~250 ms de un solo hilo. Sin un
 * corte previo, cada intento invalido le cuesta al servidor mucho mas que al
 * atacante -- el login se vuelve un amplificador de DoS. Chequear el bloqueo
 * primero convierte un intento rechazado en una consulta barata.
 *
 * **Falla abierto.** Si Supabase no responde, se deja pasar y decide el resto de
 * la cadena. Un incidente de la base no puede dejar al staff sin poder entrar al
 * panel en el medio de un evento; el limite por IP sigue activo de todos modos.
 */

export const IDENTITY_SCOPES = Object.freeze({
  staffLogin: 'staff_login',
  athleteLogin: 'athlete_login',
  passwordReset: 'password_reset',
  accessCode: 'access_code',
})

/**
 * Umbral por defecto. Cinco intentos es lo que tolera alguien que se equivoca de
 * contraseña de verdad -- entre un typo, una mayuscula y un gestor que autocompleta
 * mal -- y muy poco para quien esta probando una lista.
 */
const DEFAULT_THRESHOLD = 5
const DEFAULT_WINDOW_SECONDS = 900

export function hashIdentity(value, env = process.env) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null

  // La sal es el secreto de la instalacion. Sin ella el hash de un email es
  // trivialmente reversible con un diccionario de casillas.
  const salt = String(env.AUTH_SECRET ?? env.SUPABASE_SERVICE_ROLE_KEY ?? 'plu-local')
  return createHash('sha256').update(`${salt}:${normalized}`).digest('hex')
}

function client(deps) {
  const resolved = typeof deps?.getSupabaseAdmin === 'function'
    ? deps.getSupabaseAdmin()
    : deps?.supabaseAdmin
  return resolved?.rpc ? resolved : null
}

/** Error uniforme del bloqueo: mismo texto para staff y atleta. */
export function lockedOutError(retryAfterSeconds) {
  const minutes = Math.max(1, Math.ceil((retryAfterSeconds ?? 60) / 60))
  return new HttpError(
    429,
    `Demasiados intentos fallidos con esta cuenta. Volvé a probar en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
    { code: 'identity_locked', retryAfterSeconds },
  )
}

/**
 * Estado del bloqueo sin registrar nada.
 *
 * @returns {Promise<{locked: boolean, retryAfterSeconds: number}>}
 */
export async function inspectIdentityLock({ scope, identity, deps, env = process.env }) {
  const rpc = client(deps)
  const identityHash = hashIdentity(identity, env)
  if (!rpc || !identityHash) return { locked: false, retryAfterSeconds: 0 }

  try {
    const { data, error } = await rpc.rpc('inspect_identity_lock', {
      p_scope: scope,
      p_identity_hash: identityHash,
    })
    if (error) return { locked: false, retryAfterSeconds: 0 }

    return {
      locked: Boolean(data?.locked),
      retryAfterSeconds: Number(data?.retryAfterSeconds ?? 0),
    }
  } catch {
    return { locked: false, retryAfterSeconds: 0 }
  }
}

/**
 * Corta el request si la cuenta esta bloqueada. Se llama antes de verificar la
 * contraseña.
 */
export async function assertIdentityNotLocked({ scope, identity, deps, env = process.env }) {
  const state = await inspectIdentityLock({ scope, identity, deps, env })
  if (state.locked) throw lockedOutError(state.retryAfterSeconds)
}

/** Suma un fallo y devuelve el estado resultante. */
export async function registerIdentityFailure({
  scope,
  identity,
  deps,
  env = process.env,
  threshold = DEFAULT_THRESHOLD,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
}) {
  const rpc = client(deps)
  const identityHash = hashIdentity(identity, env)
  if (!rpc || !identityHash) return { locked: false }

  try {
    const { data, error } = await rpc.rpc('register_identity_failure', {
      p_scope: scope,
      p_identity_hash: identityHash,
      p_threshold: threshold,
      p_window_seconds: windowSeconds,
    })
    if (error) return { locked: false }
    return data ?? { locked: false }
  } catch {
    return { locked: false }
  }
}

/** Login correcto: se limpia el contador de fallos. */
export async function clearIdentityFailures({ scope, identity, deps, env = process.env }) {
  const rpc = client(deps)
  const identityHash = hashIdentity(identity, env)
  if (!rpc || !identityHash) return

  try {
    await rpc.rpc('clear_identity_failures', {
      p_scope: scope,
      p_identity_hash: identityHash,
    })
  } catch {
    // Limpiar es best-effort: el contador vence solo por ventana.
  }
}
