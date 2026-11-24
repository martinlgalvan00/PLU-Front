import es from './es.js'
import admin from './admin.es.js'

/**
 * Español completo (sitio + panel) para código del panel que traduce sin el
 * proveedor (auditoría). Vive en el chunk del panel: el sitio público usa
 * `es.js`, sin los ~300 KB de `admin.es.js`.
 */
export default { ...es, admin }
