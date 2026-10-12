import { apiGet, apiRequest } from '../lib/api.js'

/**
 * Anuncio "Pronto habrá novedades" de la página de Eventos.
 *
 * Es un ajuste del sitio y no un evento: no hay fecha, sede ni título que
 * viajen por acá, sólo si el anuncio está prendido. Por eso es seguro leerlo
 * sin sesión.
 *
 * El default es APAGADO. A diferencia de los interruptores de cobro —que ante
 * un dato incompleto quedan abiertos para no frenar ventas— un anuncio de hype
 * que aparece por un error de red es peor que uno que tarda en aparecer.
 */
function mapTeaser(result) {
  return { eventsEnabled: result?.eventsEnabled === true }
}

export async function fetchSiteTeaser() {
  return mapTeaser(await apiGet('/api/platform-settings/teaser'))
}

export async function saveSiteTeaser(enabled) {
  return mapTeaser(
    await apiRequest('/api/platform-settings/teaser', {
      method: 'PUT',
      body: JSON.stringify({ enabled: Boolean(enabled) }),
    }),
  )
}
