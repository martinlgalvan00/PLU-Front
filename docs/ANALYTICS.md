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

Queda pendiente del lado tuyo, y no es opcional con identidad vinculada:

- Declarar el tratamiento en la política de privacidad del sitio.
- Exponer el opt-out (`setOptedOut(true)` de `analyticsService.js`) en algún lugar visible.

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

## Embudo de afiliación

Pasos canónicos, definidos en `server/routes/analytics.js` para que el panel no pueda pedir
nombres que el tracker nunca emite:

```text
landing_view → membership_view → membership_checkout_opened → payment_submitted → payment_approved
```

Para instrumentar un paso nuevo:

```js
import { trackEvent, trackConversion } from '../services/analyticsService.js'

trackEvent('membership_checkout_opened')
trackConversion('payment_approved', { value: 75000 })
```

Si agregás un paso, sumalo también a `MEMBERSHIP_FUNNEL_STEPS` y a las etiquetas
`admin.analytics.funnelSteps.*` de ambos locales.

## Endpoints

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/analytics/collect` | Público (limiter propio) |
| GET | `/api/analytics/overview` | `admin.analytics.read` |
| GET | `/api/analytics/pages` | `admin.analytics.read` |
| GET | `/api/analytics/flows` | `admin.analytics.read` |
| GET | `/api/analytics/heatmap?path=…` | `admin.analytics.read` |
| GET | `/api/analytics/funnel` | `admin.analytics.read` |

La ingesta tiene limiter propio (`analyticsIngestLimiter`) y **nunca** comparte instancia con
endpoints de negocio: un 429 de analítica no puede dejar a nadie sin poder afiliarse ni pagar.

Todas las lecturas devuelven datos **agregados en Postgres**. El navegador no recibe eventos
individuales, que tienen identidad vinculada.

## Mapa de calor

Los clicks se guardan con coordenadas normalizadas 0..1 sobre el **documento** (no el viewport),
así el mapa es comparable entre un monitor y un teléfono. La RPC agrupa en una grilla de 40×40 y
devuelve solo las celdas con peso; el panel dibuja un SVG con esas celdas.

La intensidad se reparte por raíz cuadrada: con escala lineal, un solo punto muy caliente
aplanaba todo el resto contra el fondo y el mapa dejaba de mostrar los focos secundarios.

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
