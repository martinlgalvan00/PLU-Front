/**
 * loadShedder.js — PLU ARG
 *
 * Techo de operaciones caras en vuelo, por instancia.
 *
 * El rate limit cuenta requests por cliente; esto cuenta trabajo simultaneo del
 * servidor, que es una dimension distinta. Un ataque distribuido reparte los
 * requests entre miles de IPs: cada una respeta su cupo y ninguna dispara el
 * limite, pero la instancia recibe todo junto.
 *
 * Y en este proyecto "todo junto" es caro de verdad. `verifyPassword` corre
 * bcryptjs con coste 12: JavaScript puro, ~250 ms de un unico hilo, sin ceder el
 * event loop. Treinta logins concurrentes son ocho segundos durante los cuales
 * la instancia no atiende **nada** -- ni un health check, ni un webhook de
 * Mercado Pago, ni el escaneo de la puerta. El sintoma no es "el login anda
 * lento": es que se cae todo lo demas.
 *
 * Rechazar rapido con 503 + `Retry-After` es mejor que aceptar y encolar: la
 * funcion de Vercel tiene `maxDuration` de 60 s, asi que una cola larga termina
 * en timeouts que igual pierden el request, pero despues de haber gastado el
 * CPU. Es preferible decir "ahora no" en dos milisegundos.
 *
 * El limite es por instancia y a proposito: es una defensa de recurso local, no
 * un contador de negocio. Coordinarlo entre instancias costaria una ida a la
 * base justo en el momento de mayor presion.
 */

import { HttpError } from '../lib/errors.js'

/**
 * Cuantos hasheos simultaneos tolera una instancia.
 *
 * Las funciones de Vercel del plan Hobby corren con recursos acotados y bcryptjs
 * no libera el hilo, asi que el numero util es bajo: mas alla de esto no se gana
 * throughput, solo se alarga la cola. Cuatro deja pasar el pico normal de un
 * inicio de jornada y corta el barrido.
 */
const DEFAULT_MAX_IN_FLIGHT = Number(process.env.PASSWORD_HASH_CONCURRENCY ?? 4)

export function createLoadShedder({
  maxInFlight = DEFAULT_MAX_IN_FLIGHT,
  retryAfterSeconds = 2,
  message = 'El sistema está con mucha carga. Probá de nuevo en unos segundos.',
} = {}) {
  const limit = Math.max(1, maxInFlight)
  let inFlight = 0

  function middleware(req, res, next) {
    if (inFlight >= limit) {
      res.set('Retry-After', String(retryAfterSeconds))
      next(new HttpError(503, message, { code: 'server_busy', retryAfterSeconds }))
      return
    }

    inFlight += 1
    let released = false
    const release = () => {
      if (released) return
      released = true
      inFlight = Math.max(0, inFlight - 1)
    }

    // `finish` cubre la respuesta normal; `close` cubre al cliente que corta
    // antes de tiempo, que es justo lo que hace un script de fuerza bruta. Sin
    // el segundo, el contador solo sube y la instancia se auto-bloquea.
    res.on('finish', release)
    res.on('close', release)

    next()
  }

  middleware.stats = () => ({ inFlight, limit })
  return middleware
}

/**
 * Instancia compartida para las rutas que verifican contraseñas. Se exporta una
 * sola para que el techo sea de la instancia y no por endpoint: tres endpoints
 * con cuatro cupos cada uno son doce hasheos simultaneos, que es justo lo que se
 * quiere evitar.
 */
export const passwordHashShedder = createLoadShedder()
