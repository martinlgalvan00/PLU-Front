import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * infra.apiSurface.test.js — PLU ARG
 *
 * Reglas de la superficie HTTP entera, no de un endpoint puntual.
 *
 * Los tests de API que ya existen prueban el comportamiento de la ruta que les
 * interesa. Ninguno mira el conjunto, y el riesgo real es de conjunto: la ruta
 * numero 169 que alguien agregue apurado y se olvide el guard de permiso o el
 * limitador no rompe ningun test, porque todavia no existe el test que la
 * cubre. Este archivo audita las 168 de una y falla cuando aparece una que se
 * sale del patron.
 */

const ROUTES_DIR = resolve('server/routes')
const ROUTE_FILES = readdirSync(ROUTES_DIR).filter((file) => file.endsWith('.js'))
const APP = readFileSync(resolve('server/app.js'), 'utf8')

const ROUTE_RE = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g

/**
 * Cadena de middlewares declarada entre el path y el handler.
 *
 * Cortar en el primer `)` —que es lo obvio— da falsos positivos: en una
 * declaracion multilinea el primer parentesis que cierra es el de
 * `requirePermission(...)`, asi que el limitador que viene despues queda fuera
 * de la ventana y la ruta parece sin proteger. Se corta donde arranca el
 * handler, que es lo que realmente separa la firma del cuerpo.
 */
function middlewareChain(source, fromIndex) {
  const window = source.slice(fromIndex, fromIndex + 600)
  const handler = window.search(/async\s*\(|\(\s*_?req\b|function\s*\(/)
  return handler === -1 ? window : window.slice(0, handler)
}

const MUTATING = ['post', 'put', 'patch', 'delete']

/**
 * Cierre de sesion: no toma cuerpo, es idempotente y solo borra la cookie de
 * quien la trae. Limitarlo no protege nada y puede dejar a alguien sin poder
 * salir de su cuenta.
 */
const MUTANTES_SIN_LIMITE_ACEPTADAS = new Set([
  'athletes.js POST /logout',
  'auth.js POST /logout',
])

function routes() {
  const found = []
  for (const file of ROUTE_FILES) {
    const source = readFileSync(resolve(ROUTES_DIR, file), 'utf8')
    for (const match of source.matchAll(ROUTE_RE)) {
      const [full, method, , path] = match
      found.push({
        file,
        method: method.toLowerCase(),
        path,
        middleware: middlewareChain(source, match.index + full.length),
        id: `${file} ${method.toUpperCase()} ${path}`,
      })
    }
  }
  return found
}

const ROUTES = routes()

describe('superficie de la API', () => {
  it('encuentra todas las rutas declaradas', () => {
    // Si el parser deja de matchear, todo lo de abajo pasaria sobre una lista
    // vacia y el archivo entero se volveria decorativo.
    expect(ROUTES.length).toBeGreaterThan(150)
    expect(new Set(ROUTES.map((route) => route.file)).size).toBe(ROUTE_FILES.length)
  })

  it('toda ruta de administracion exige permiso', () => {
    // El panel no es la frontera: cualquiera puede pegarle a /api directo. El
    // guard en la firma de la ruta es lo unico que separa una orden aprobada
    // de un curl.
    const sinGuard = ROUTES.filter(
      (route) =>
        (route.path.includes('/admin') || route.path.includes('internal')) &&
        !/Guard|requirePermission|requireAuth|requireRole|requireInternal/.test(route.middleware),
    ).map((route) => route.id)

    expect(sinGuard).toEqual([])
  })

  it('toda ruta que escribe pasa por un limitador', () => {
    const sinLimite = ROUTES.filter(
      (route) =>
        MUTATING.includes(route.method) &&
        !/[Ll]imiter/.test(route.middleware) &&
        !MUTANTES_SIN_LIMITE_ACEPTADAS.has(route.id),
    ).map((route) => route.id)

    expect(sinLimite).toEqual([])
  })

  it('cada archivo de rutas esta montado en la aplicacion', () => {
    // Un router que nadie monta es peor que uno que falta: parece cubierto,
    // tiene tests que pasan y no responde en produccion.
    const sinMontar = ROUTE_FILES.filter((file) => {
      const nombre = file.replace(/\.js$/, '')
      return !new RegExp(`routes/${nombre}\\.js`).test(APP)
    })

    expect(sinMontar).toEqual([])
  })

  it('las operaciones que mueven plata exigen el permiso de aprobacion', () => {
    // Regresion puntual y deliberada: acreditar, corregir o revalidar un cobro
    // no puede quedar detras del permiso de solo lectura de finanzas.
    const payments = readFileSync(resolve(ROUTES_DIR, 'payments.js'), 'utf8')
    const athletes = readFileSync(resolve(ROUTES_DIR, 'athletes.js'), 'utf8')

    expect(payments).toContain("requirePermission('admin.payments.approve'")
    for (const path of [
      '/orders/:orderId/revalidate',
      '/operations/revalidate',
      '/operations/recover',
      '/subscriptions/:subscriptionId/cancel',
    ]) {
      const declaracion = payments.match(new RegExp(`router\\.post\\('${path.replace(/[/:]/g, '\\$&')}'[^)]*`))
      expect(declaracion?.[0], `${path} sin guard de escritura`).toMatch(/financeWriteGuard/)
    }

    const forceSettle = athletes.match(/router\.post\('\/admin\/payment-orders\/:orderId\/force-settle'[^)]*/)
    expect(forceSettle?.[0]).toMatch(/financeGuard/)
  })

  it('el webhook de Mercado Pago valida cuerpo y firma antes de tocar nada', () => {
    const payments = readFileSync(resolve(ROUTES_DIR, 'payments.js'), 'utf8')
    // Los dos paths registrados en el panel de MP (canonico y alias legacy)
    // tienen que compartir handler: uno sin verificar seria una puerta abierta.
    const handlers = [...payments.matchAll(/router\.post\('\/webhook(?:\/mercadopago)?',([^\n]*)\n/g)]
    expect(handlers).toHaveLength(2)
    for (const [, middleware] of handlers) {
      expect(middleware).toMatch(/webhookLimiter/)
      expect(middleware).toMatch(/validateBody\(webhookSchema\)/)
      expect(middleware).toMatch(/handleMercadoPagoWebhook/)
    }
    expect(payments).toContain('MERCADO_PAGO_WEBHOOK_SECRET')
  })

  it('el checkout publico no expone acciones de staff', () => {
    // Cualquier ruta con `staff`/`admin` en el path tiene que estar en un
    // router con guard; ninguna puede colgar de los limitadores publicos.
    const publicas = ROUTES.filter((route) => /publicReadLimiter|publicWriteLimiter|checkoutLimiter/.test(route.middleware))
    const sospechosas = publicas
      .filter((route) => /admin|staff/.test(route.path))
      .map((route) => route.id)

    expect(sospechosas).toEqual([])
  })
})
