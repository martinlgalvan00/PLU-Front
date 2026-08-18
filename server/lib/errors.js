import { getRequestId, logger } from './logger.js'
import { diagnosePaymentFailure } from '../modules/payments/paymentFailureCatalog.js'

export class HttpError extends Error {
  constructor(status, message, details, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'Ruta no encontrada'))
}

// Rutas donde una falla es plata en juego: se diagnostica y se loguea con el
// detalle del catalogo aunque sea un 4xx.
const PAYMENT_PATH =
  /^\/api\/(payments|tickets)|\/(membership-orders|registrations|registration-combos|payment-orders)/

export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err.status) ? err.status : 500
  const message = status >= 500 ? 'Error interno' : err.message
  const requestId = req?.requestId ?? getRequestId()
  const body = { error: message }
  if (err.details?.code) body.code = err.details.code
  if (err.details?.code === 'PLU06') body.alreadyUsed = true
  // Campos concretos del conflicto (ej. email/documento ya usados en el alta).
  if (err.details?.fields && typeof err.details.fields === 'object') {
    body.fields = err.details.fields
  }
  // En un 5xx el mensaje es opaco a proposito. El id de correlacion es lo unico
  // que le permite a quien reporta el problema (atleta u operador) que podamos
  // encontrar el stack exacto en los logs.
  if (status >= 500 && requestId) body.requestId = requestId

  // Sin query string: ahi viajan tokens de verificacion y de acceso a ordenes.
  // El identificador del recurso ya queda en el asiento de auditoria.
  const path = req?.path ?? req?.originalUrl?.split('?')[0] ?? ''
  const isPaymentPath = PAYMENT_PATH.test(String(path))
  // El diagnostico convierte el error en algo accionable: causa probable y
  // pasos concretos. Va al log, nunca al cliente.
  const diagnosis = status >= 500 || isPaymentPath ? diagnosePaymentFailure(err) : null

  logger[status >= 500 ? 'error' : 'warn']('api.error', {
    requestId,
    method: req?.method,
    path,
    status,
    err,
    ...(diagnosis
      ? {
          diagnosis: {
            code: diagnosis.code,
            title: diagnosis.title,
            severity: diagnosis.severity,
            scope: diagnosis.scope,
            cause: diagnosis.cause,
            fix: diagnosis.fix,
          },
        }
      : {}),
  })

  res.status(status).json(body)
}
