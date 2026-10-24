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
| Oculta | `on_sale` | Aviso "Estamos construyendo la página oficial de …", fecha, sede y **Inscribirme** |
| Oculta | `scheduled` (sin bloqueos) | Aviso + "La inscripción abre el …" |
| Oculta | cualquier otra | Solo el aviso: el catálogo no entrega fecha, sede ni precio |
| Visible | — | La landing de su plantilla, con el botón según `isEventRegistrationOpen` |

El catálogo (`publicCatalogEventFor` en `server/services/publicEventCatalogService.js`) manda el
evento completo para el checkout pero sin la página en armado (slots, bloques, copy público,
portada). El evento oculto sigue fuera del calendario y de destacados; el checkout lo encuentra
con `findRegistrableEvent` (`src/lib/eventNavigation.js`).

## Datos obligatorios de la inscripción

División, categoría, **modalidad**, categoría de peso y peso corporal
(`shared/registrationRequirements.js`). Sin modalidad el servidor responde 422
`MODALITY_REQUIRED` (antes la daba por Full Power). El formulario además valida categoría,
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
| Venta | capítulos Cupo · Precios · Entradas · Cobro · Vendidas |
| Página | landing, editor visual, SEO |
| *Operación* | Inscripciones · Pagos · Zonas y seguridad |

Alta (`AdminEventQuickCreate`): tres pasos — **Evento** (tipo, título, logo, fechas, sede,
cupo, acceso), **Venta** (precio de lista, cuándo abre, medios de cobro) y **Página**
(plantilla, tema, visibilidad). Cada paso valida lo suyo (`src/lib/eventQuickCreateSteps.js`).
Al crear, la pantalla «Listo» muestra el control de venta del evento nuevo y lleva a su
Resumen, al capítulo de Venta que falta, o a la lista.

En el **listado**, la columna «Inscripción» usa la misma regla: estado de venta y un dato
(medios de cobro si está a la venta, el motivo si está bloqueada, la fecha si está programada).
El estado guardado ya no tiene columna propia.
