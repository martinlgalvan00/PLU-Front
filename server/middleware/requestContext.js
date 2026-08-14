import { logger, newRequestId, runWithRequestContext } from '../lib/logger.js'

/**
 * requestContext.js — PLU ARG
 *
 * Da a cada request un identificador de correlacion y lo propaga por
 * AsyncLocalStorage, para que cualquier log emitido durante ese request --
 * incluido el stack de una falla de cobro tres capas mas abajo -- se pueda
 * atar al pedido que lo origino.
 *
 * El id se devuelve en `X-Request-Id`. Es el dato que el atleta o el operador
 * puede pasarnos cuando reporta "no me acredito el pago": con ese id sale
 * entera la traza en los logs y en `operational_event_logs`.
 *
 * Si el cliente ya trae un `X-Request-Id` se reusa. En el webhook de Mercado
 * Pago eso vale doble: MP manda su propio request id y asi la traza local
 * queda pegada a la notificacion que se ve en su panel.
 */

const SAFE_ID = /^[A-Za-z0-9._:-]{8,120}$/
// Rutas de alto valor operativo: se loguean siempre, con latencia. El resto
// solo cuando falla o en debug, para no inflar la salida con health checks.
const AUDITED_PREFIXES = ['/api/payments', '/api/athletes', '/api/tickets']

function inboundRequestId(req) {
  const header = req.get?.('x-request-id')
  return SAFE_ID.test(String(header ?? '')) ? String(header) : newRequestId()
}

function isAudited(path) {
  return AUDITED_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export function requestContext(req, res, next) {
  const requestId = inboundRequestId(req)
  const startedAt = process.hrtime.bigint()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  // Por donde entro la operacion. Un mismo cobro puede llegar por el checkout
  // del atleta, por el webhook de MP, por el job de recuperacion o por un
  // reintento manual del panel, y el diagnostico cambia segun cual sea.
  const entrypoint = `http:${req.method} ${req.path}`

  runWithRequestContext({ requestId, entrypoint, method: req.method, path: req.path }, () => {
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
      if (level === 'info' && !isAudited(req.path)) return
      logger[level]('http.request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      })
    })
    next()
  })
}
