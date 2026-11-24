import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Enumera las rutas de una app Express 5 con su prefijo de montaje.
 *
 * Express no expone el prefijo de un sub-router (queda dentro de un closure del
 * matcher), así que se toma del propio `server/app.js`: cada router se monta con
 * un string `'/api/...'` en su propia línea, y se empareja probando el matcher de
 * cada capa contra ese prefijo. Si una capa no matchea ningún prefijo conocido el
 * test que la usa debe fallar en voz alta (`unmatched`), no saltearla en silencio:
 * una ruta que no se puede listar es una ruta que el contrato no está cubriendo.
 */
const APP_SOURCE = readFileSync(join(process.cwd(), 'server', 'app.js'), 'utf8')
const MOUNT_PREFIXES = [
  '/api',
  ...[...APP_SOURCE.matchAll(/^\s+'(\/api\/[^']*)',?\s*$/gm)].map((match) => match[1]),
]

function layerMatchesPrefix(layer, prefix) {
  const matcher = layer.matchers?.[0]
  if (typeof matcher !== 'function') return false
  return Boolean(matcher(`${prefix}/__probe__`)) || Boolean(matcher(prefix))
}

function walk(stack, prefix, out, unmatched, top = false) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (layer.route.methods[method]) {
          out.push({ method: method.toUpperCase(), path: `${prefix}${layer.route.path}` })
        }
      }
      continue
    }
    const inner = layer.handle?.stack
    if (!Array.isArray(inner)) continue
    if (!top) {
      walk(inner, prefix, out, unmatched)
      continue
    }
    // Router montado en la raíz (`app.use(router)`): Express lo marca con `slash`
    // en lugar de un matcher con prefijo.
    if (layer.slash === true) {
      walk(inner, '', out, unmatched)
      continue
    }
    // El prefijo más largo que matchea la capa es el suyo.
    const own = MOUNT_PREFIXES.filter((candidate) => layerMatchesPrefix(layer, candidate)).sort(
      (a, b) => b.length - a.length,
    )[0]
    if (own === undefined) {
      if (inner.some((child) => child.route)) unmatched.push(layer.name)
      continue
    }
    walk(inner, own, out, unmatched)
  }
}

export function listRoutes(app) {
  const out = []
  const unmatched = []
  const root = app.router ?? app._router
  walk(root.stack, '', out, unmatched, true)
  const seen = new Set()
  const routes = out.filter((route) => {
    const key = `${route.method} ${route.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { routes, unmatched }
}

/** `/api/events/:eventSlug/x` → `/api/events/sample/x` para poder pedirla. */
export function concretePath(path) {
  return path.replace(/:([A-Za-z0-9_]+)\??/g, (_match, name) =>
    /id$/i.test(name) ? '00000000-0000-4000-8000-000000000000' : 'sample',
  )
}
