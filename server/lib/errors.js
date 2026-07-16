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
  if (status < 500 && err.details?.code) body.code = err.details.code
  if (err.details?.code === 'PLU06') body.alreadyUsed = true
  res.status(status).json(body)
}
