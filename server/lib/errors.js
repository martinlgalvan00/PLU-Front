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

  res.status(status).json({ error: message })
}
