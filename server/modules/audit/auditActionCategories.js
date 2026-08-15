/**
 * auditActionCategories.js — PLU ARG
 *
 * Agrupa los nombres de accion de la bitacora en categorias estables.
 *
 * El problema que resuelve: un mismo hecho se asienta con dos nombres segun
 * quien lo escriba. La aplicacion usa `payment.webhook_failed` y el trigger de
 * `payment_integration_events` usa `payment_webhook.failed`; lo mismo con
 * `payment.applied` (16 asientos) y `payment.aprobado` (3). Quien filtraba por
 * uno no veia el otro, y como el panel arma los filtros con las acciones que
 * existen de verdad, la lista mostraba las dos variantes sin decir que eran lo
 * mismo. Buscar "que paso con los webhooks" daba un resultado incompleto y sin
 * ninguna señal de que faltaba algo.
 *
 * Se clasifica en la lectura y **no se renombra el historico**: la bitacora es
 * append-only y reescribirla para que quede prolija destruiria justamente su
 * valor probatorio. El nombre crudo se sigue mostrando; la categoria es una
 * capa de agrupacion arriba.
 *
 * Cada categoria define patrones `LIKE` de Postgres (para filtrar en la base,
 * usando el indice por `action`) y su equivalente en regex (para clasificar las
 * filas ya leidas). Las dos formas salen de la misma definicion para que no
 * puedan divergir: un filtro que trae filas que despues se muestran en otra
 * categoria seria peor que no tener categorias.
 */

/**
 * El orden importa: se asigna la primera que coincide. `webhook` y
 * `conciliacion` van antes que `cobro` porque sus acciones tambien empiezan con
 * `payment`, y la regla mas especifica tiene que ganar.
 */
const CATEGORY_DEFINITIONS = [
  {
    key: 'acceso',
    // Entradas al sistema: login de staff y de atleta, y apertura/cierre de sesion.
    patterns: ['auth.%'],
  },
  {
    key: 'cuenta',
    // Alta, baja y cambios de identidad de una persona.
    patterns: ['account.%', 'athlete.%', 'user.%', 'password.%'],
  },
  {
    key: 'webhook',
    // Las dos familias del mismo hecho: la que escribe la app y la del trigger.
    patterns: ['payment.webhook\\_%', 'payment\\_webhook.%'],
  },
  {
    key: 'conciliacion',
    // Lo que recupera un cobro que no cerro solo.
    patterns: ['payment.reconcil%', 'payment\\_reconciliation.%', 'payment.recovery\\_%'],
  },
  {
    key: 'checkout_cliente',
    // Fallas del Brick en el navegador del atleta: no son fallas del servidor.
    patterns: ['payment\\_brick.%'],
  },
  {
    key: 'cobro',
    // Todo el resto del ciclo de pago, incluidos los intentos embebidos.
    patterns: ['payment.%', 'payment\\_attempt.%', 'subscription%'],
  },
  {
    key: 'email',
    patterns: ['email.%'],
  },
  {
    key: 'membresia',
    patterns: ['membership%'],
  },
  {
    key: 'inscripcion',
    patterns: ['registration%', 'ticket%', 'checkin%', 'check\\_in%'],
  },
  {
    key: 'analitica',
    // Consultas a datos personales desde el panel. Categoria propia porque es
    // lo que se revisa ante un reclamo de privacidad, no actividad de negocio.
    patterns: ['analytics.%'],
  },
]

/** Categoria de las acciones que todavia no encajan en ninguna regla. */
export const UNCATEGORIZED = 'otro'

export const AUDIT_CATEGORY_KEYS = Object.freeze([
  ...CATEGORY_DEFINITIONS.map((definition) => definition.key),
  UNCATEGORIZED,
])

/**
 * Traduce un patron `LIKE` de Postgres al regex equivalente.
 *
 * Derivar el regex del patron —en vez de escribir los dos a mano— es lo que
 * garantiza que filtrar por una categoria y clasificar una fila den el mismo
 * resultado. `\%` y `\_` son literales escapados en LIKE; `%` y `_` son los
 * comodines.
 */
export function likeToRegExp(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '\\') {
      // Escapado en LIKE: el proximo caracter es literal.
      index += 1
      source += pattern[index]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') ?? ''
    } else if (char === '%') {
      source += '.*'
    } else if (char === '_') {
      source += '.'
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`${source}$`, 'i')
}

const COMPILED = CATEGORY_DEFINITIONS.map((definition) => ({
  ...definition,
  matchers: definition.patterns.map(likeToRegExp),
}))

/** Categoria de una accion concreta. Nunca devuelve `null`. */
export function categorizeAuditAction(action) {
  const value = String(action ?? '').trim()
  if (!value) return UNCATEGORIZED

  for (const definition of COMPILED) {
    if (definition.matchers.some((matcher) => matcher.test(value))) return definition.key
  }
  return UNCATEGORIZED
}

/**
 * Patrones `LIKE` de una categoria, para filtrar en la base.
 *
 * Devuelve `include` y **`exclude`**. El `exclude` no es un detalle: la
 * clasificacion asigna la primera categoria que coincide, y varias comparten
 * prefijo. `cobro` incluye `payment.%`, que tambien captura
 * `payment.webhook_failed` —clasificado como `webhook` por ir antes—, asi que
 * un filtro construido solo con los `include` traia filas que despues se
 * mostraban en otra categoria. Los patrones de las categorias anteriores se
 * restan para que filtrar y clasificar den siempre el mismo resultado.
 *
 * Resolverlo en la base y no descartando en memoria es lo que mantiene sana la
 * paginacion: el cursor sale de la ultima fila devuelta, y si el repositorio
 * descartara filas ya leidas, la pagina siguiente se saltearia las descartadas.
 *
 * `otro` devuelve `null`: es el complemento de todas las demas y no se puede
 * expresar como un `like`.
 */
export function auditCategoryPatterns(category) {
  const index = CATEGORY_DEFINITIONS.findIndex((item) => item.key === category)
  if (index === -1) return null

  return {
    include: CATEGORY_DEFINITIONS[index].patterns,
    exclude: CATEGORY_DEFINITIONS.slice(0, index).flatMap((item) => item.patterns),
  }
}

/** Agrega la categoria a cada fila leida, sin tocar el resto del registro. */
export function withAuditCategory(rows = []) {
  return rows.map((row) => ({ ...row, category: categorizeAuditAction(row?.action) }))
}
