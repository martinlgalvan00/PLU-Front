# PLU Competition Map — cartografía libre

La aplicación usa **MapLibre GL JS** como motor de render y la instancia pública de
**OpenFreeMap** como fuente de estilos y tiles vectoriales basados en OpenStreetMap.

No requiere:

- API key.
- Map ID.
- Cuenta de Google, Mapbox o MapTiler.
- Variables de entorno cartográficas.
- Extensiones o plugins del navegador.

## Arquitectura

```text
CompetitionMap
  → OpenMapCanvas (lazy)
    → MapLibre GL JS
      → OpenFreeMap vector tiles
```

`CompetitionMap` conserva la lista accesible, el evento seleccionado, las acciones externas y
todos los fallbacks. `OpenMapCanvas` sólo se importa cuando el bloque se acerca al viewport y
existe al menos un evento con coordenadas verificadas.

Los estilos base son:

- Light: `https://tiles.openfreemap.org/styles/positron`
- Dark: `https://tiles.openfreemap.org/styles/dark`

Después de cargar el estilo, `openMapService.js` aplica la paleta cartográfica PLU definida como
tokens en `competition-map.css`: grafito o marfil para territorio, celeste apagado para agua y
límites, y oro únicamente para vías principales o eventos destacados. También reduce etiquetas
decorativas, oculta aeropuertos y escudos viales, y prioriza nombres en español.

La atribución de OpenFreeMap, OpenMapTiles y OpenStreetMap debe permanecer visible.

## Marcadores de eventos

Cada evento combina tres señales para no depender solamente del color:

- Ícono operativo: trofeo para destacado, ticket para inscripción abierta, reloj para cupos
  limitados, calendario para próximos, candado para cerrados y sello para finalizados.
- Número correlativo según el orden visible del calendario.
- Etiqueta editorial con nombre, estado y fecha al seleccionar, enfocar o pasar el cursor.

En mobile la etiqueta permanente se oculta porque la ficha seleccionada ya muestra esos datos y
el espacio se reserva para la cartografía. El foco de teclado conserva el detalle accesible.

## Coordenadas verificadas

Pitbull Classic utiliza la sede publicada `La Troupe Multiespacio, Gallo 148, Banfield`.
La coordenada se verificó manualmente el 2 de agosto de 2026 contra:

- Nominatim / OpenStreetMap `place_id 17826083`.
- Resultado exacto: `148, Gallo, Banfield, Partido de Lomas de Zamora, Buenos Aires, Argentina`.

La procedencia queda registrada junto a la sede en `src/lib/events.js`. Si el backend reemplaza
el nombre de la sede, el adaptador descarta dirección, enlace y coordenadas heredadas para evitar
mostrar un marcador incorrecto.

No se geocodifican automáticamente eventos en el navegador. Cada nueva sede debe publicar
latitud y longitud verificadas.

## Producción y continuidad

OpenFreeMap declara que su instancia pública no requiere registro, key ni límites de vistas, pero
no ofrece SLA. Por eso el mapa:

- Mantiene dirección y acciones aunque el proveedor falle.
- Detecta offline y timeout.
- Puede cambiar su fuente de estilo sin modificar la UX.

### Content Security Policy

Los tiles, estilos, sprites y glifos de OpenFreeMap **no se piden directo al browser**.
MapLibre usa `transformRequest` y todo pasa por el proxy same-origin `/map-tiles`
(Vite en local, rewrite en Vercel). Así `connect-src 'self'` alcanza aunque un CSP
viejo o duplicado no liste `tiles.openfreemap.org`.

El `vercel.json` igual mantiene OpenFreeMap en el allowlist como red de seguridad.
`worker-src 'self' blob:` sigue siendo obligatorio para el worker de MapLibre.

Si el mapa falla con “violates Content Security Policy / connect-src” apuntando a
`tiles.openfreemap.org`, el proxy no está activo (deploy sin el rewrite `/map-tiles`
o Vite sin el proxy). No hace falta abrir el upstream en CSP para que el mapa funcione.

No configures un segundo CSP en Project Settings si ya vive en `vercel.json`: el browser
intersecta políticas y gana la más restrictiva.

Si el tráfico o la operación futura exige control total, se puede servir un archivo PMTiles propio
desde storage/CDN y conservar MapLibre, los estilos PLU y todos los componentes.

## Planificación de llegada

La ficha de cada sede agrega herramientas bajo demanda, sin claves ni datos inventados:

- **Calles y zoom:** forman parte del estilo vectorial de OpenFreeMap. MapLibre conserva zoom
  táctil, teclado, botones `+ / −` y restauración de la vista general.
- **Estimación desde la ubicación actual:** el navegador pide permiso explícito y consulta una
  ruta vial en OSRM. PLU no persiste la ubicación. La cifra es orientativa y no incorpora
  tránsito en tiempo real.
- **Estacionamientos cercanos:** Overpass devuelve elementos `amenity=parking` registrados en
  OpenStreetMap dentro de 1,2 km. Se excluyen accesos marcados como `private` o `no`, se muestran
  hasta doce puntos y se ordenan por distancia lineal. Los datos no equivalen a lugares libres,
  horarios o acceso garantizado.
- **Navegación externa:** Google Maps URLs y Waze Deep Links abren la sede en la aplicación
  correspondiente. Estos enlaces universales no requieren una API key.

Las consultas se ejecutan solamente después de una acción del usuario. Las respuestas de ruta se
mantienen cinco minutos en memoria y los estacionamientos quince minutos para reducir carga sobre
servicios comunitarios. Los endpoints pueden sustituirse sin cambiar componentes:

```env
VITE_OSRM_BASE_URL=https://router.project-osrm.org
VITE_OVERPASS_API_URL=https://overpass-api.de/api/interpreter
```

Las instancias públicas de OSRM y Overpass son servicios best-effort, sin SLA. Para tráfico
productivo sostenido conviene desplegar instancias propias o contratar un proveedor compatible;
la UI conserva sus fallbacks si cualquiera de ellas falla.

Referencias:

- https://maplibre.org/maplibre-gl-js/docs/
- https://openfreemap.org/
- https://openfreemap.org/quick_start/
- https://operations.osmfoundation.org/policies/tiles/
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://project-osrm.org/docs/v5.5.1/api/
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/waze/deeplinks
- https://protomaps.com/
