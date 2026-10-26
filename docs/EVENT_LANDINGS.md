# Landings de evento

Cada evento tiene una página pública en `/evento/:slug`. Qué se ve ahí lo decide
`rules.landing` (se edita en el panel: **Evento → Página**).

## Qué se configura

| Concepto | Campo | Efecto |
|---|---|---|
| Plantilla | `templateId` | `meet` (ficha del calendario), `editorial` (dossier Pitbull), `submission`, `builder` (Constructor). |
| Interruptor | `publicVisible` | Apagado: el público ve el aviso **"Próximamente"** (pantalla "en construcción"). El evento sigue en el menú pero fuera de destacados y countdowns; fuera del calendario salvo que venda inscripciones, en cuyo caso el calendario y la portada lo ofrecen con "Página oficial" e "Inscribirme" (ver `REGISTRATION_SALES.md`). |
| Tema | `themeId` | Uno de 4 presets de acento (`event-landing-themes.css`). |
| Colores propios | `layout.palette` | `accent`, `action` (botón) y `background`, en `#rrggbb`. El texto se deriva del fondo (blanco o grafito). |
| Textos | `slots` | Portada, experiencia, categorías, lugar, FAQ (3 pares), SEO. Máximos en `EVENT_LANDING_SLOT_LIMITS`. |
| Bloques | `layout.blocks` | Solo el Constructor: orden, visibilidad y bloques propios. |

El copy de la portada y del cupo vive también en `publicCopy` (lo leen la ficha, Pitbull y la
inscripción). `patchDraftLanding` los mantiene sincronizados.

## "Plataforma en construcción"

- `GET /api/events/catalog` devuelve, para una landing apagada, solo `underConstructionCatalogEvent`:
  `id`, `slug`, `title` y el tema/paleta. **Nunca** fecha, sede, precios, cupos ni descripción.
- Cliente: `getPublicCatalogEvents` la excluye de listados; `getUnderConstructionEvents` la
  devuelve aparte para el menú, y `App` renderiza `EventUnderConstructionPage`.
- El staff la revisa con **Visualizar landing** (`landing/PreviewDialog.jsx`): muestra el borrador
  sin guardar, en escritorio / tablet / móvil, con las dos caras cuando el interruptor está apagado.

## Constructor (bloques)

Modelo puro: `src/lib/eventLandingLayout.js` (los colores, en `eventLandingPalette.js`). Dos familias:

- **Integrados** (uno por tipo, id = tipo): `hero` (siempre primero y visible), `facts`, `countdown`,
  `experience`, `categories`, `schedule`, `weighIns`, `location`, `tickets`, `livestream`,
  `calendar`, `faq`, `materials`. Leen datos del evento o de `slots`. No se borran, se ocultan.
- **Propios** (varios): `text`, `image`, `cta`. Contenido en `props`.

Un bloque integrado con módulo público (`surfaceKey`: grilla, FAQ, lugar…) se oculta también en
`publicSurface`, en el mismo cambio (`patchDraftLandingBlocks`): lo que no se muestra tampoco se
consulta ni se expone.

### Agregar un tipo de bloque

1. `eventLandingLayout.js`: sumarlo a `CORE_BLOCK_TYPES` (o `CUSTOM_BLOCK_TYPES` con sus props).
2. `components/events/landing-blocks/`: un componente `XBlock.jsx` y registrarlo en `index.js`.
3. `supabase/migrations`: agregar el tipo a las listas de `staff_merge_event_landing_layout`
   (el test `eventLandingLayoutMigration.test.js` avisa si se desalinea).
4. `admin.*.js`: `landingBlockType_x` y `landingBlockHint_x`.

## Seguridad

- Sin HTML libre: todo es texto plano con tope de largo.
- Links de bloques: `https://` o ruta interna (`/…`). `isSafeLandingHref` se aplica en el panel
  (marca el error), en el servidor (`layoutPayloadForMerge`, RPC) y al renderizar.
- Imágenes: solo rutas del bucket público `event-media`; la URL se resuelve al leer
  (`withLandingBlockImageUrls`) y no se guarda.
- Colores: hex estricto. El panel avisa si el acento o el botón no se distinguen del fondo (WCAG).

## Persistencia

`staff_upsert_event` reconstruye `rules`, así que la landing se guarda aparte
(`server/modules/events/eventLandingStore.js`), en este orden:

1. `staff_merge_event_landing` — tema + slots (reconstruye `rules.landing`)
2. `staff_merge_event_landing_state` — plantilla, switch, fase
3. `staff_merge_event_landing_layout` — bloques + paleta

Despliegue escalonado: si una RPC no existe todavía, el guardado cae a escritura directa
(o avisa) en vez de fallar. **Aplicar** `20261229100000_event_landing_layout.sql` antes de usar el
Constructor en producción.

Cuidado: el paso 1 descarta `publicVisible`, `phase` y `layout`, y no acepta `builder` (por eso el
store le manda `meet`/`editorial` y recién el paso 2 fija la plantilla). Nunca llamar a
`staff_merge_event_landing` fuera de `saveEventLanding`: sin los pasos 2 y 3 se pierde el layout.
La migración está verificada contra Postgres 14 (aplicación repetida, rechazos de tipo, id, link,
ruta, color y topes, y esta secuencia completa).

## Editor visual

**Página → Abrir editor visual**: la misma edición a pantalla completa, con la landing real
al lado (`landing/LandingStudio.jsx`, carga diferida).

- Edita **el mismo borrador** que el formulario: cerrar (`Listo` / Escape) no descarta nada, y
  **Guardar** es el guardado del evento (`requestSubmit` del formulario, mismas validaciones).
- Barra: "Qué ve el público" (página / en construcción), dispositivo, deshacer / rehacer
  (`useLandingHistory`: tipeo seguido = un paso; Ctrl+Z solo fuera de campos de texto).
- Constructor: clic en un bloque de la vista previa → se abre y enfoca en el panel; elegirlo en el
  panel → la vista previa va hasta él. Reordenar arrastrando la manija (o flechas sobre ella);
  un bloque nuevo se inserta debajo del elegido.
- La vista previa se dibuja al ancho real (1280 / 768 / 390) y se escala para entrar
  (`landingStudioLayout.js`).
- Guardar desmonta y vuelve a armar el editor del evento: `landingStudioSession.js` marca el
  evento y el visual se reabre solo (la marca vence a los 15 s).

## Vista previa

`PreviewFrame` renderiza la landing en un `<iframe>` vacío (portal de React) y copia los estilos
del panel (`mirrorDocumentStyles`). No carga ninguna URL, así que no depende de
`frame-ancestors` / `X-Frame-Options`. Las media queries responden al ancho del marco; las medidas
que lee JavaScript (`innerWidth`, `matchMedia`) siguen siendo las de la ventana del panel.

## Dónde está cada cosa

```
src/lib/eventLanding.js            modelo de la landing (normalizar, payload, FAQ, SEO)
src/lib/eventLandingLayout.js      bloques del Constructor (puro)
src/lib/eventLandingPalette.js     colores propios: normalizar, contraste, variables CSS (puro)
src/lib/eventLandingSections.js    secciones de las plantillas fijas
src/lib/eventPublicActions.js      ¿se puede inscribir / comprar entradas?
src/lib/schemas/landingLayoutSchema.js   Zod compartido panel + servidor
src/pages/EventBuilderLandingPage.jsx    página del Constructor
src/components/events/landing-blocks/    un componente por bloque
src/components/admin/event-editor/landing/   editor: FormatFieldset, SectionsList, BlocksEditor
                                             (BlockRow, CustomBlockFields), PaletteEditor, PreviewDialog,
                                             LandingStudio + StudioPreview (editor visual)
src/lib/landingStudioLayout.js               escala de la vista previa y destino al soltar (puro)
src/styles/pages/admin-event-landing.css     estilos del editor y del visor
tests/eventLandingStore.test.js              guardado y respaldos de despliegue escalonado
server/modules/events/eventLandingStore.js   guardado de la landing
supabase/migrations/20261229100000_event_landing_layout.sql
```
