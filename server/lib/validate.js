import { HttpError } from './errors.js'

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      next(new HttpError(400, Object.values(errors).flat()[0] || 'Datos inválidos', errors))
      return
    }

    req.validatedBody = result.data
    next()
  }
}
