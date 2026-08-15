# Analítica de uso del sitio

## Qué es y qué no es

Este sistema responde **qué hizo la gente en el sitio**: cuántas personas entraron, por dónde
navegaron, dónde clickearon y en qué paso del embudo abandonaron.

No reemplaza a la auditoría operativa (`/api/audit`, `operational_audit_events`), que responde
**qué hizo el sistema**: qué pago se acreditó, qué afiliación se activó, qué webhook falló. Esa
es la evidencia ante un reclamo de dinero y vive en tablas separadas a propósito: son de bajo
volumen y alta criticidad, y mezclarles millones de pageviews degradaría justo la bitácora que
sostiene los cobros.

| | Auditoría | Analítica |
|---|---|---|
| Pregunta | Qué hizo el sistema | Qué hizo la gente |
| Volumen | Bajo | Alto |
| Cada fila | Crítica y durable | Desechable |
| Retención | Perpetua | 90 días crudo + agregados perpetuos |
| Permiso | `admin.audit.read` | `admin.analytics.read` |

## Modelo de datos

- `analytics_sessions` — una fila por sesión (30 min de inactividad la cierra). Entrada, salida,
  referrer, campaña, dispositivo, duración y rebote.
  - `active_seconds` — tiempo con la **pestaña visible**, acumulado por tramos desde el tracker.
    `duration_seconds` es reloj de pared y cuenta también la pestaña en segundo plano: sobre
    tráfico real daban 5m17s de permanencia media, que no era permanencia sino pestañas abiertas.
  - `is_engaged` / `is_quality` — columnas **generadas**, no mantenidas por la aplicación.
    `is_engaged` es el corte de GA4 (10s de atención, o 2 páginas, o una conversión);
    `is_quality` es el mismo sin el término temporal, y es el único comparable contra lo
    registrado antes de que existiera `active_seconds`.
  - El rebote se deriva de `is_engaged`. La condición vieja (`page_count <= 1 and
    event_count <= 1`) daba 8% porque el tracker emite scroll y clicks por su cuenta; casi
    ninguna sesión calificaba.
- `analytics_events` — el detalle: `pageview`, `click`, `scroll`, `conversion`, eventos de
  formulario y de negocio.
- `analytics_daily_rollups` — agregados diarios por ruta. **Perpetuos** y ya anónimos: son
  conteos, sin visitante.

### Identidad

Los eventos se vinculan al atleta cuando hay sesión iniciada. Si alguien navega anónimo y se
loguea a mitad de camino, la sesión se vincula **hacia atrás** para no partir el recorrido.

Esto convierte las tablas en datos personales. Tres consecuencias implementadas en la propia
migración, no delegadas a la aplicación:

1. **La IP nunca se guarda.** Entra a un hash con sal rotativa diaria junto al user-agent y se
   descarta. Da visitantes únicos sin conservar el identificador de red, y al rotar la sal el
   histórico deja de ser recorrelacionable.
2. **Purga automática a los 90 días**, consolidando antes en los rollups para que acortar la
   retención nunca implique perder la serie histórica.
3. **Borrado en cascada real.** `athlete_id` es FK `on delete cascade`, así que `delete_athlete`
   se lleva la analítica de esa persona. Es lo que hace cumplible el derecho de supresión.

El opt-out ya está expuesto: `AnalyticsOptOut` vive en el pie del sitio y llama a `setOptedOut`.
No se renderiza si el tracker está apagado por configuración, porque ofrecer salir de algo que no
está midiendo confunde más de lo que informa.

Queda pendiente del lado tuyo, y no es opcional con identidad vinculada:

- **Declarar el tratamiento en la política de privacidad del sitio.** El sitio todavía no tiene
  esa página; es copy institucional y no se redactó acá.

## Qué se mide y qué no

Se registra el selector del elemento y, a lo sumo, el texto visible de un botón.

**Nunca se captura el `value` de un input.** Si el click cae sobre un campo, se guarda su `name`
o su `type`, jamás lo tipeado. En un sitio con DNI, email y datos de tarjeta eso no es
negociable. La querystring se descarta entera por el mismo motivo: un link de recuperación
lleva el email adentro.

Tampoco se mide el panel administrativo (`/admin`): esa actividad ya vive en la auditoría
operativa, y mezclar navegación de staff con la del público distorsiona visitantes, rebote y
embudo.

## Decisiones que toma el servidor

Dos cosas no se le delegan al navegador, porque un cliente manipulado podría falsear el informe
entero:

- **El identificador de visitante.** Se deriva en el servidor. Uno emitido por el cliente
  permite inflar las visitas de cualquier página.
- **La normalización de la ruta.** Es la clave de agregación de todo el sistema.
  `/mi-cuenta/orden/<uuid>` se agrupa en `/mi-cuenta/orden/:id`; los slugs de contenido
  (`/eventos/pitbull-classic`) se conservan porque sí interesa medirlos por separado.

El tráfico de bots se descarta antes de tocar la base.

## Mapa de integración

Dónde vive cada pieza, para no tener que buscarla:

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tracker | `src/services/analyticsService.js` | Encola y descarga eventos; opt-out |
| Puente con el router | `src/components/layout/AnalyticsTracker.jsx` | Pageview + pasos de vista del embudo |
| Pasos de pago | `src/components/ui/MercadoPagoEmbeddedCheckout.jsx` | `*_checkout_opened`, `payment_submitted`, `payment_approved` |
| Opt-out visible | `src/components/ui/AnalyticsOptOut.jsx` | Control en el pie del sitio |
| Endpoint | `server/routes/analytics.js` | Ingesta + seis lecturas + guard de identidad |
| Repositorio | `server/modules/analytics/supabaseAnalyticsRepository.js` | Única puerta a las RPC |
| Identidad de visitante | `server/modules/analytics/visitorIdentity.js` | Hash con sal rotativa; filtro de bots |
| Normalización de ruta | `server/modules/analytics/normalizePath.js` | Clave de agregación del informe |
| Esquema y RPC | `supabase/migrations/20260814130000_web_analytics.sql` | Tablas, RPC, rollup, purga, cron |
| Lectura del panel | `src/services/analyticsReportService.js` | Cliente de las seis lecturas |
| Panel | `src/pages/admin/AnalyticsSection.jsx` | Informe, mapa de calor, ranking, recorrido |

### Quién emite cada evento

Un paso declarado que nadie emite produce un embudo que miente. La cobertura está fijada por
test en `tests/analyticsAudit.test.js`: si agregás un paso a `MEMBERSHIP_FUNNEL_STEPS` sin
instrumentarlo, ese test falla.

| Evento | Lo emite |
|---|---|
| `pageview` | `AnalyticsTracker` en cada cambio de vista |
| `click` | Listener global del tracker (con coordenadas y tamaño del documento) |
| `scroll` | Listener global; se descarga al salir de la vista |
| `landing_view` | `AnalyticsTracker` en la **primera vista de cualquier página**, una vez por montaje |
| `membership_view` | `AnalyticsTracker` cuando la vista es `members` |
| `membership_checkout_opened` | `MercadoPagoEmbeddedCheckout` con orden de tipo `membership` |
| `registration_checkout_opened` | Idem con orden de tipo `competition` (fuera del embudo canónico) |
| `tickets_checkout_opened` | Idem con orden de tipo `tickets` (fuera del embudo canónico) |
| `payment_submitted` | `MercadoPagoEmbeddedCheckout` al enviar el pago (los tres flujos) |
| `membership_payment_submitted` | Idem, calificado por flujo — es el que usa el embudo |
| `registration_payment_submitted` / `tickets_payment_submitted` | Idem para los otros dos flujos |
| `payment_approved` | Idem cuando el estado vuelve aprobado (único `type: 'conversion'`) |
| `membership_payment_approved` | Idem, calificado por flujo — es el que usa el embudo |
| `payment_rejected` | Idem cuando vuelve rechazado |

`landing_view` **no depende de la portada**. Atado a `view === 'home'`, toda sesión que entrara
directo a una landing profunda nunca lo emitía, y como el embudo exige arrancar por el paso 1,
esas sesiones quedaban descartadas del embudo completo. Sobre el tráfico real eran el **39%**:
95 sesiones entrando por `/pitbull` y 51 por `/afiliacion`, en su mayoría desde Instagram, que
linkea a la página de cada cosa y no a `/`.

## Embudo de afiliación

Pasos canónicos, definidos en `server/routes/analytics.js` para que el panel no pueda pedir
nombres que el tracker nunca emite:

```text
landing_view → membership_view → membership_checkout_opened
             → membership_payment_submitted → membership_payment_approved
```

El conteo es **monotónico**: un visitante cuenta en el paso *k* solo si hizo los *k-1* anteriores
y en ese orden, comparando la primera vez de cada paso. Sin eso, quien entraba directo a
`/afiliarse` sumaba al paso 2 sin haber pasado por el 1, el embudo crecía y las tasas pasaban el
100% — un informe peor que no tener informe.

La cadena se evalúa **dentro de cada sesión** y después se cuentan visitantes distintos. Con
`min(occurred_at)` por visitante sobre la ventana entera, dos intentos de compra se pisaban:
quien paga, vuelve y reabre el checkout termina con su primer `checkout_opened` posterior a su
primer `payment_submitted`, la condición de orden falla y desaparece del embudo desde ahí.

Los dos últimos pasos van **calificados por flujo**. `payment_submitted` a secas lo emiten por
igual afiliación, inscripción y entradas: un pago de inscripción entraba al embudo de afiliación
sin haber pasado por `membership_checkout_opened`, cortaba la cadena y el paso se reportaba en
cero. El panel mostraba 0 pagos habiendo dos registrados.

Para instrumentar un paso nuevo:

```js
import { trackEvent, trackConversion } from '../services/analyticsService.js'

trackEvent('membership_checkout_opened')
trackConversion('payment_approved', { value: 75000 })
```

Si agregás un paso, sumalo también a `MEMBERSHIP_FUNNEL_STEPS`, a las etiquetas
`admin.analytics.funnelSteps.*` de ambos locales, y a quien lo emita (el test de cobertura lo
exige).

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/analytics/collect` | Público (limiter propio) |
| GET | `/api/analytics/overview` | `admin.analytics.read` |
| GET | `/api/analytics/pages` | `admin.analytics.read` |
| GET | `/api/analytics/flows` | `admin.analytics.read` |
| GET | `/api/analytics/heatmap?path=…&deviceType=…` | `admin.analytics.read` |
| GET | `/api/analytics/funnel` | `admin.analytics.read` |
| GET | `/api/analytics/elements` | `admin.analytics.read` |
| GET | `/api/analytics/live?windowMinutes=…` | `admin.analytics.read` (limiter propio) |
| GET | `/api/analytics/access` | `admin.analytics.read` |
| GET | `/api/analytics/athletes/:id/journey` | `admin.analytics.identity` |

Los permisos viven en el catálogo de `src/lib/permissions.js` pero **la autorización los lee de
la base**: agregar una clave al catálogo no la habilita hasta correr `npm run db:seed`, que hace
upsert del catálogo y suma las que falten a los roles protegidos (es aditivo: no quita ninguna).
Si el panel de analítica responde 403 con un rol que debería poder, ese seed es lo primero a
revisar.

La ingesta tiene limiter propio (`analyticsIngestLimiter`) y **nunca** comparte instancia con
endpoints de negocio: un 429 de analítica no puede dejar a nadie sin poder afiliarse ni pagar.

Todas las lecturas devuelven datos **agregados en Postgres**. El navegador no recibe eventos
individuales, que tienen identidad vinculada.

## Presencia en vivo

`GET /api/analytics/live` responde la pregunta que el informe histórico no contesta: **cuánta
gente hay en el sitio ahora**. Se deriva de `analytics_sessions.last_seen_at`, que el tracker
actualiza en cada latido; no hay tabla ni proceso nuevo.

- **Ventana**: 5 minutos por omisión, tope duro de 60 (validado en el endpoint *y* en la RPC). El
  tracker late cada 30s, así que 5 minutos tolera diez latidos perdidos antes de dar por ida a
  una persona que sigue leyendo. Es la misma ventana que usa GA en su vista de tiempo real.
- **`visitors` cuenta personas** (`visitor_id` distintos), no sesiones: alguien con dos pestañas
  es una persona.
- **`series` es concurrencia real**, no actividad por minuto: una sesión cuenta en el minuto que
  su intervalo `[started_at, last_seen_at]` cubre, aunque no haya emitido ningún evento ahí.
  Contar eventos daría una curva dentada que subestima a quien está leyendo sin tocar nada.
- **`pages` usa `exit_path`**, que la ingesta mantiene apuntando al último pageview: es *dónde
  está parada* la persona, no por dónde pasó.
- El pico del día se calcula en baldes de 5 minutos y la serie por minuto: por minuto sobre 24
  horas serían 1440 puntos cruzados contra todas las sesiones del día, un costo que no se
  justifica para un solo número.

En el panel es la franja superior de Analítica (`LivePresenceBar`), con auto-refresco de 15s que
**se detiene con la pestaña oculta** y no borra la última lectura buena si el refresco falla: una
barra vacía durante un evento se lee como "no hay nadie", que es la conclusión opuesta.

## Accesos

`GET /api/analytics/access` sale de `operational_event_logs` (bitácora de identidad), no del
tracker: un acceso es un hecho auditado, no una visita inferida.

La distinción que sostiene todo el endpoint es **personas vs. intentos**. Sobre datos reales del
sitio, 736 asientos de login exitoso son 303 personas entrando muchas veces; reportar el conteo
de eventos como si fueran personas es el error más fácil de cometer con este dato, así que las
dos cifras viajan siempre juntas y con nombre distinto (`events` / `people`).

Atletas y staff se cuentan por separado porque son poblaciones de tamaño y significado distinto.
`failureRate` se mide sobre intentos (cuánto cuesta entrar) y `blockedPeople` sobre personas: son
las que fallaron en **todos** sus intentos del período, es decir, las que siguen sin poder entrar.

## Mapa de calor

Los clicks se guardan con coordenadas normalizadas 0..1 sobre el **documento** (no el viewport),
así el mapa es comparable entre un monitor y un teléfono. La RPC agrupa en una grilla de 40×40 y
devuelve solo las celdas con peso; el panel dibuja un SVG con esas celdas.

La intensidad se reparte por raíz cuadrada: con escala lineal, un solo punto muy caliente
aplanaba todo el resto contra el fondo y el mapa dejaba de mostrar los focos secundarios.

### Forma de la página

Normalizar a 0..1 hace comparables los dispositivos, pero **pierde la forma de la página**. Por
eso cada click viaja con `documentWidth`/`documentHeight`, y la RPC devuelve `aspectRatio`: la
mediana de alto/ancho de los clicks del período. El panel usa ese valor en el `viewBox`.

Sin esas dimensiones el mapa dibujaba una grilla cuadrada estirada. Como una landing suele medir
cuatro veces más alto que ancho, todo el largo de la página quedaba comprimido en un cuadrado y
los focos no caían donde la gente había clickeado. Con datos anteriores a esta columna,
`aspectRatio` viene nulo, el panel cae a 1:1 y lo avisa en el pie del mapa.

Se usa mediana y no promedio porque un solo click en una vista muy larga (un acordeón abierto,
una tabla desplegada) corre el promedio entero.

### Filtro por dispositivo

`deviceType` no es un lujo: con coordenadas normalizadas, el mismo 0.5 vertical cae en secciones
distintas según si el documento mide dos pantallas o cuatro. Mezclar mobile y desktop en una sola
grilla promedia dos páginas que no son la misma.

## Lo más usado

`get_analytics_elements` responde la pregunta que el mapa de calor no responde: qué control usa
más la gente **sin importar en qué ruta esté**. Agrupa por selector y no por selector+ruta,
porque un mismo control (el CTA de afiliación, un link del nav) vive en varias pantallas y
partirlo por ruta esconde justamente cuánto se usa.

Devuelve `clicks` y `visitors` juntos a propósito: mil clicks de una persona no son mil personas,
y ordenando solo por clicks un carrusel cliqueado a repetición desplaza al CTA que convierte.

## Recorrido por atleta

Es la **única** lectura del informe que no viene agregada: devuelve por dónde pasó y qué tocó una
persona identificada. Sirve para reconstruir un reclamo ("no me dejaba pagar") con evidencia.

Tres cosas la separan del resto, y las tres son deliberadas:

1. **Permiso propio** (`admin.analytics.identity`). Ver métricas de producto y abrir la
   navegación de alguien con nombre y apellido no son el mismo acceso.
2. **Queda registrada.** Cada consulta escribe en `operational_event_logs` con acción
   `analytics.athlete_journey_viewed`: quién consultó, a quién y con qué ventana. Un acceso a
   datos personales que no deja rastro no es defendible ante la propia persona.
3. **El registro no bloquea.** Si la bitácora falla, se avisa por consola y la consulta responde
   igual: una falla de observabilidad no puede volverse un 500 del panel.

## Operación

Variables de entorno:

```text
# Sal del hash de visitante. Si falta se reusa AUTH_SECRET.
ANALYTICS_SALT_SECRET=<secreto largo>

# Kill switch del tracker (frontend). Ausente o distinto de 'false' = encendido.
VITE_ANALYTICS_ENABLED=true
```

Rotar `ANALYTICS_SALT_SECRET` corta la continuidad de visitantes a partir de ese momento: las
sesiones abiertas se cierran y los visitantes se recuentan. Es el efecto buscado ante una
sospecha de filtración, pero no se hace de rutina.

El rollup diario y la purga corren por `pg_cron` todas las noches a las 04:20 (job
`plu-analytics-nightly`). Para ejecutarlos a mano:

```sql
select public.rollup_analytics_daily(current_date - 1);
select public.purge_analytics_raw(90);
```

`purge_analytics_raw` tiene piso de 7 días: un parámetro accidental en 0 no puede vaciar la
tabla del día.

### Despliegue

```bash
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

Después de aplicar, verificar que la grilla llega:

```sql
select count(*) from public.analytics_events where occurred_at > now() - interval '1 hour';
```

Si da 0 con tráfico real, revisar en orden: `VITE_ANALYTICS_ENABLED`, que
`/api/analytics/collect` no esté detrás de Deployment Protection, y que el user-agent no esté
cayendo en el filtro de bots.
