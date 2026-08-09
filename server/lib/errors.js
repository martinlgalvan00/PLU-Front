export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'Ruta no encontrada'))
}

export function errorHandler(err, _req, res, _next) {
  const status = Number.isInteger(err.status) ? err.status : 500
  const message = status >= 500 ? 'Error interno' : err.message
  const body = { error: message }
  if (err.details?.code) body.code = err.details.code
  if (err.details?.code === 'PLU06') body.alreadyUsed = true
  // Campos concretos del conflicto (ej. email/documento ya usados en el alta).
  if (err.details?.fields && typeof err.details.fields === 'object') {
    body.fields = err.details.fields
  }
  if (status >= 500) {
    console.error(`[api] ${status} ${err.message}`, err.details?.code ?? '')
  }
  res.status(status).json(body)
}
