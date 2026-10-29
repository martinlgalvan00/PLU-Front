# Venta de inscripciones

Una sola regla dice si un atleta puede inscribirse y pagar un evento:
`resolveRegistrationSale` en [`shared/registrationSaleState.js`](../shared/registrationSaleState.js).
La usan el panel (control de venta), el sitio (botón "Inscribirme") y el servidor.

## Estados

| Estado | Cuándo |
|---|---|
| `ended` | `status = finalizado` |
| `sold_out` | `status = agotado` o inscriptos ≥ cupo |
| `closed` | `proximamente` / `cerrado`, o la ventana de cierre ya pasó |
| `scheduled` | abierta con `registrationOpensAt` por delante (abre sola) |
| `blocked` | abierta y en fecha, pero algo impide cobrar (ver abajo) |
| `on_sale` | se puede inscribir y pagar |

Bloqueos (`blockers`): `hidden` (evento sin publicar), `announceOnly` ("Solo anuncio"),
`platformPaused` (Acceso y habilitación), `noPaymentChannel` (ningún medio abierto para
inscripción).

## El estado no se elige a mano

Decisión de negocio (oct 2026): el staff decide **abrir ahora, programar o cerrar** y el
estado guardado + la ventana se derivan (`registrationSalePatch`). "Cupos limitados" ya no se
ofrece; si un evento lo tiene, cuenta como abierta.

- Workspace → **Resumen**: `AdminEventSaleControl` (estado, motivo, acciones, "Arreglar").
- Cabecera del evento: "Inscripciones: <estado>" (lleva al Resumen).
- Barra rápida: abrir / cerrar con el mismo parche.
- Editor completo y alta rápida: "Cuándo se puede inscribir la gente"
  (`src/lib/eventRegistrationMode.js`).

## Página oculta ("en construcción") con la venta abierta

Mostrar u ocultar la landing (Página → "Qué ve el público") y vender inscripciones son
decisiones separadas: `hiddenLandingTakesRegistrations` (mismo archivo).

| Landing | Venta | Lo que ve el público |
|---|---|---|
| Oculta | `on_sale` | Aviso "Próximamente · Estamos construyendo algo genial: la página oficial de …", fecha, sede y **Inscribirme** |
| Oculta | `scheduled` (sin bloqueos) | Aviso + "La inscripción abre el …" |
| Oculta | cualquier otra | Solo el aviso: el catálogo no entrega fecha, sede ni precio |
| Visible | — | La landing de su plantilla, con el botón según `isEventRegistrationOpen` |

El catálogo (`publicCatalogEventFor` en `server/services/publicEventCatalogService.js`) manda el
evento completo para el checkout pero sin la página en armado (slots, bloques, copy público,
portada). Mientras vende, el evento oculto **sí** se lista en el calendario de `/eventos`
(`getRegistrableCatalogEvents`) con su botón Inscribirme; con la venta cerrada vuelve a quedar
fuera. Destacados, countdowns y el menú de Competencia no lo usan. El checkout lo encuentra con
`findRegistrableEvent` (`src/lib/eventNavigation.js`).

En la portada, el carril de inscripción del hero (`getSeasonHomeActions`, que recibe los
`underConstructionEvents`) lo ofrece igual con dos acciones: **Página oficial** (abre el aviso)
e **Inscribirme** (va directo al formulario). Con la venta programada sale como "Inscripciones
próximamente". Así la venta no espera a que la landing esté terminada.

**Ocultar la landing ≠ ocultar el evento.** El ojo de la lista de eventos (y "Ocultar N" en la
selección) cambia `published`: el evento sale del sitio y la venta queda bloqueada (`hidden`).
Si el evento está vendiendo (o tiene la venta programada) la lista avisa antes y sugiere
"En construcción", que es lo que hay que usar para vender sin la página lista.

## Datos obligatorios de la inscripción

División, categoría, **modalidad**, categoría de peso y peso corporal
(`shared/registrationRequirements.js`). Sin modalidad el servidor responde 422
`MODALITY_REQUIRED` (antes la daba por Full Power).

Submission (plantilla `submission` o slug `barbell-submission*`) admite varias categorías en la
misma inscripción (`categories`, cada una suma una inscripción); el resto de los eventos, una
sola (422 `MULTIPLE_CATEGORIES_UNAVAILABLE`). El checkout manda las categorías que muestra
marcadas, y el servidor rechaza un `categories` que no incluya `category` (422
`CATEGORY_MISMATCH`) en vez de inscribir en otra categoría. Requiere la migración
`20270101100000_submission_multi_categories.sql` (RPC `_v4`) aplicada **antes** de desplegar el
servidor. El formulario además valida categoría,
división y modalidad contra lo que ofrece el evento, con la misma regla que el servidor
(`validateSelectionAgainstOffering`).

## Tests de flujo

`npm run test:e2e:flows` (`playwright.flows.config.js`, `e2e/flows/`): solo Vite, con la API
simulada en el navegador, así que corre sin Docker. Cubre las combinaciones de arriba y el POST
de la inscripción. Los rechazos del servidor los cubren `tests/api.registration*.test.js`.

## Lo que hace cumplir el servidor

- **"Solo anuncio" no cobra**: `POST /api/athletes/me/registrations` (y el combo) responden
  409 `REGISTRATION_ANNOUNCE_ONLY`.
- Estado, publicación, ventana y cupo: la RPC de creación de la orden.
- `POST /api/events/:slug/state` acepta `registrationOpensAt` / `registrationClosesAt`
  (ISO o `null`) vía `staff_set_event_registration_window` (auditada,
  `20261230100000_event_registration_window.sql`; sin la migración escribe directo).
- Publicar por esa ruta exige lo mismo que el editor: transferencia con alias y efectivo con
  lugar, si están abiertos (`server/modules/events/eventRegistrationSaleStore.js`).

## Dónde se gestiona un evento

Página del evento (`AdminEventWorkspace`): cuatro pestañas para armarlo y, aparte, las de
operación. Las secciones internas no cambiaron, solo cómo se agrupan:

| Pestaña | Secciones |
|---|---|
| Resumen | control de venta + cifras |
| Evento | capítulos Datos · Estructura |
| Venta | capítulos Módulos · Cupo · Precios · Entradas · Cobro · Vendidas (abre en Módulos) |
| Página | landing, editor visual, SEO |
| *Operación* | Inscripciones · Pagos · Zonas y seguridad |

## Módulos del evento

Venta → **Módulos** (`EventModulesBoard`) dice qué partes del evento están prendidas y cómo
cobra cada una. La regla vive en [`shared/eventModules.js`](../shared/eventModules.js) y la leen
el panel, el sitio y el servidor. Los módulos que ya tenían campo lo siguen usando: el tablero
es otra forma de tocar el mismo dato, no un segundo interruptor.

| Módulo | Campo | Apagado |
|---|---|---|
| Inscripciones | `salesIntent` | "Solo anuncio" (409 `REGISTRATION_ANNOUNCE_ONLY`) |
| Entradas de público | `pricing.ticketsEnabled` | El público no compra: `GET /api/tickets/availability` manda `ticketEnabled: false` y `POST /api/tickets/orders` responde 409 `PLU03`. El mostrador (`POST /orders/manual`) puede cargar una venta ya cobrada |
| Combo afiliación + inscripción | `rules.modules.combo` | El catálogo no publica la oferta; `POST /me/registration-combos` responde 409 `EVENT_MODULE_DISABLED` |
| Extras de entradas | `rules.modules.ticketAddons` | Solo quedan los extras incluidos en un tipo; `POST /api/tickets/orders` con `addonIds` responde 409 `EVENT_MODULE_DISABLED` |
| Cronograma público | `publicSurface.schedule` | La página no muestra la grilla |
| Puerta: check-in y zonas | `rules.modules.door` | El workspace oculta Zonas y Check-in (las entradas conservan su QR) |

Combo depende de Inscripciones y Extras de Entradas: prendidos sin su módulo no tienen efecto y
el tablero lo dice.

**Medios por módulo.** Inscripciones y Entradas abren o cierran sus medios en el mismo tablero
(la misma columna de `paymentChannelOverrides` que Cobro). Combo cobra con los de Inscripciones;
los extras, con la entrada.

**Tope de cuotas** (`rules.paymentPolicy`, `{registration|ticket: {maxInstallments}}`, sin
tope = decide Mercado Pago). Se elige por módulo cuando Mercado Pago está abierto. La orden
lleva el tope de su evento (`supabasePaymentRepository.getOrder`): el Brick no ofrece más cuotas
(`maxInstallments`), la preferencia lo limita (`payment_methods.installments`) y el pago
embebido con más cuotas responde 422 `INSTALLMENTS_NOT_ALLOWED`. Una afiliación sola no tiene
evento ni tope.

Se guardan con `staff_merge_event_modules` (migración
`20270103100000_event_modules_payment_policy.sql`) después del upsert, como `offering`. Sin la
migración el evento se guarda igual con el aviso `EVENT_MODULES_NOT_SAVED` y todo queda prendido
y sin tope. Un cliente que no manda `modules`/`paymentPolicy` conserva los guardados.

Alta (`AdminEventQuickCreate`): tres pasos — **Evento** (tipo, título, logo, fechas, sede,
cupo, acceso), **Venta** (precio de lista, cuándo abre, medios de cobro) y **Página**
(plantilla, tema, visibilidad). Cada paso valida lo suyo (`src/lib/eventQuickCreateSteps.js`).
Al crear, la pantalla «Listo» muestra el control de venta del evento nuevo y lleva a su
Resumen, al capítulo de Venta que falta, o a la lista.

En el **listado**, la columna «Inscripción» usa la misma regla: estado de venta y un dato
(medios de cobro si está a la venta, el motivo si está bloqueada, la fecha si está programada).
El estado guardado ya no tiene columna propia.

## Planilla de inscripciones (.xlsx)

Inscripciones (tabla general y panel de cada evento) → **Planilla** descarga un `.xlsx` con lo
que muestra la tabla (con sus filtros) y **Importar** lo vuelve a subir para corregir.

- Columnas: una sola definición en `shared/registrationSheet.js` (`REGISTRATION_SHEET_COLUMNS`).
  Se editan solo las marcadas con ✎: división, categoría, modalidades, categoría de peso y peso
  corporal. Segunda división (cambia el precio), estado y pago quedan de solo lectura. Una celda
  editable vacía significa "no cambiar". La hoja "Cómo editar" lista los valores válidos.
- El archivo se lee en el navegador (`read-excel-file`, carga diferida) y viaja en tandas de
  `REGISTRATION_IMPORT_BATCH_SIZE` filas a `POST /api/athletes/admin/registrations/import`
  (permiso `admin.registrations.write`). `apply: false` devuelve qué cambia por fila;
  `apply: true` aplica las válidas.
- Validación (`diffRegistrationImportRow`): mismas reglas que el checkout y la corrección de staff
  — oferta del evento (solo para el valor nuevo), categoría de peso según el sexo, modalidades
  combinables, peso 10–250, inscripción no cancelada, padrón no cerrado, división distinta de la
  segunda división. Desde un evento, una fila de otro evento se rechaza.
- Aplicación (`server/services/registrationSheetImport.js`): división/categoría/peso por la RPC
  auditada `staff_correct_registration_competition` (salta el lock de la selección), categoría de
  peso por `updateDeclaredWeightClass`, modalidades por update directo (las valida el CHECK de la
  columna). Una fila que falla no frena al resto. Un evento de auditoría `registration.sheet_import`
  resume cada aplicación.

## Checkout de inscripción

- Ruta propia: `/evento/:slug/inscripcion` (`src/lib/registrationCheckoutRoute.js`). Recargar o
  compartir el link vuelve al mismo checkout; sin cuenta de atleta pasa por el alta (o el puente de
  staff) y la retoma, igual que "Inscribirme". Un slug que no vende cae en la ficha del evento.
- Durante el alta y el checkout se ocultan los CTA de afiliación del header y del prefooter.
- Al pasar al pago, la vista y el foco van al panel de pago (en mobile, al estado de la orden con
  las instrucciones de transferencia/efectivo); al confirmarse, el foco va a "Tu lugar está
  confirmado".
- Los 4xx de negocio (cupo, solo anuncio, modalidad) no ofrecen el rescate de pago; con varios
  datos mal, el aviso sobre el botón los lista todos.
