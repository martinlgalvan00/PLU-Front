export function notImplemented(res, feature) {
  return res.status(501).json({ error: `${feature} no disponible` })
}

/**
 * Cache de borde para lecturas públicas.
 *
 * Estas rutas se piden muchas veces por visitante: la pantalla de un evento
 * repregunta el cupo cada 30 s y la de entradas hace lo mismo con la
 * disponibilidad, así que en una difusión con varios cientos de personas
 * mirando la misma página cada poll era una invocación de la función y una
 * consulta a una base NANO con `max_connections` 60.
 *
 * Con `s-maxage` el CDN de Vercel responde por su cuenta y todas esas
 * peticiones colapsan en una sola al origen por ventana, sin cambiar lo que ve
 * el visitante: el dato queda a lo sumo `seconds` viejo, siempre menos que el
 * intervalo con el que el front lo repregunta.
 *
 * `max-age=0` es deliberado: el navegador revalida siempre, así el refresco al
 * recuperar el foco de la pestaña sigue trayendo el valor del momento en vez de
 * uno servido desde el disco del cliente.
 *
 * Solo para respuestas iguales para todo el mundo. Una ruta que dependa de la
 * sesión no puede pasar por acá: el borde no distingue quién pregunta y le
 * serviría a un visitante la respuesta calculada para otro.
 */
export function publicReadCache(seconds, { staleFor = seconds * 2 } = {}) {
  return `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${staleFor}`
}

/**
 * Ventanas por tipo de dato.
 *
 * `LIVE` es para contadores que el público mira mientras compra —cupos,
 * disponibilidad—: corto para que nadie decida sobre un número viejo, pero
 * suficiente para absorber un pico. `CATALOG` es para lo que cambia por una
 * acción de staff y no por el tráfico. `SETTINGS` cubre los toggles operativos:
 * cerrar un canal de pago tiene que llegar al público rápido.
 */
export const PUBLIC_CACHE_SECONDS = {
  LIVE: 10,
  CATALOG: 30,
  SETTINGS: 30,
}
