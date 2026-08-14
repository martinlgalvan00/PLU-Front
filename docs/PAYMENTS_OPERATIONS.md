# Operacion de pagos y dominios transaccionales

## Fuente de verdad

- Prisma conserva usuarios, roles y sesiones del staff.
- Supabase conserva eventos, cupos, atletas, afiliaciones, inscripciones, entradas, ordenes, pagos, webhooks y conciliaciones.
- Express es la unica frontera de escritura para el navegador. Usa `service_role` despues de validar sesion, rol, propiedad e input.
- Mercado Pago se muestra embebido con Bricks. Solamente el webhook firmado o la conciliacion server-side acreditan un pago de Mercado Pago.

## Despliegue de base

Hacer backup antes de aplicar cambios. Desde un checkout limpio:

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list
npx supabase db push --include-all --dry-run
npx supabase db push --include-all
```

`--include-all` incorpora el puente de compatibilidad anterior a v3 en proyectos que ya tengan versiones posteriores registradas. En una instalacion nueva, CI ejecuta toda la cadena con `supabase db reset`.

La migracion `20260716000000_infrastructure_hardening.sql` instala la base operativa. `20260722130000_domain_integrity_payment_hardening.sql` completa el aislamiento por organizacion, los indices de consulta/FK, la identidad global de pagos y la atomicidad del ciclo de suscripciones. `20260811140000_identity_payment_audit.sql` agrega auditoria append-only de altas, sesiones y estados finales del ledger.

Los atletas nuevos crean una contraseña de al menos 12 caracteres. Para cuentas anteriores a esta migracion, un administrador debe acordar una contraseña inicial por canal seguro usando `POST /api/athletes/admin/:athleteId/credential`; el hash vive en `athlete_credentials`, nunca en la tabla publica de perfiles.

## Variables obligatorias

```text
SUPABASE_DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
MERCADO_PAGO_ACCESS_TOKEN
VITE_MERCADO_PAGO_PUBLIC_KEY
MERCADO_PAGO_WEBHOOK_SECRET
APP_URL
# API_URL es opcional: si falta, se usa APP_URL.
PAYMENT_RECOVERY_JOB_ENABLED=true
DOMAIN_MAINTENANCE_JOB_ENABLED=true
CRON_SECRET
```

`DATABASE_URL` puede configurarse explícitamente o derivarse de
`SUPABASE_DATABASE_URL` con el schema `plu_prisma`. En producción usar
`SESSION_COOKIE_SECURE=true`. Nunca exponer `SUPABASE_SERVICE_ROLE_KEY`,
`MERCADO_PAGO_ACCESS_TOKEN`, `CRON_SECRET` ni el secreto del webhook al bundle
Vite.

`APP_URL` es la URL pública del sitio y también se usa como base del webhook
de Mercado Pago cuando `API_URL` no está definida. Configurar `API_URL` sólo
cuando la API se publique en un origen diferente.

## Webhook Mercado Pago

Configurar la URL publica HTTPS `POST /api/payments/webhook/mercadopago`.
El path corto `/api/payments/webhook` sigue aceptado como alias legacy.
El endpoint exige `data.id` en la query, valida `x-signature`, `x-request-id` y tolerancia temporal, guarda cada notificacion de forma idempotente y no acredita desde datos enviados por el navegador. Si Mercado Pago reintenta, la clave unica evita duplicar el efecto. El recovery job reclama eventos fallidos con lock, backoff y maximo de intentos; la conciliacion consulta el estado autoritativo de Mercado Pago.

### URLs DEV y PROD (copiar/pegar)

Frontend y API comparten origen en Vercel: alcanza con `APP_URL`; no hace falta
definir `API_URL`. Usar dos
aplicaciones distintas en Mercado Pago (TEST para DEV, PROD para produccion).

| Entorno | `APP_URL` | Webhook en panel MP |
|---------|------------------------|---------------------|
| DEV (preview rama `dev`) | `https://plu-git-dev-martinlgalvan00s-projects.vercel.app` | `https://plu-git-dev-martinlgalvan00s-projects.vercel.app/api/payments/webhook/mercadopago` |
| PROD | `https://www.powerliftingunited.ar` | `https://www.powerliftingunited.ar/api/payments/webhook/mercadopago` |

En el panel MP (Tu integracion → Webhooks):

1. Pegar la URL de webhook de la fila correspondiente.
2. Suscribir eventos: `payment`, `subscription_preapproval`, `subscription_authorized_payment`.
3. Copiar el secret → `MERCADO_PAGO_WEBHOOK_SECRET` en Vercel (Preview para TEST, Production para PROD).

Las `back_urls` no se cargan a mano: el backend las arma al crear preferencias
(`/registro?payment=...` para afiliacion/inscripcion, `/eventos?payment=...`
para entradas). Suscripciones usan `back_url` = `APP_URL`.

Variables por entorno Vercel:

```text
# Preview / DEV (app TEST)
PAYMENTS_MOCK=false
MERCADO_PAGO_ENV=sandbox
VITE_MERCADO_PAGO_PUBLIC_KEY=<public key TEST>
MERCADO_PAGO_ACCESS_TOKEN=<access token TEST>
MERCADO_PAGO_WEBHOOK_SECRET=<secret app TEST>
APP_URL=https://plu-git-dev-martinlgalvan00s-projects.vercel.app

# Production (app PROD)
PAYMENTS_MOCK=false
MERCADO_PAGO_ENV=production
VITE_MERCADO_PAGO_PUBLIC_KEY=<public key PROD>
MERCADO_PAGO_ACCESS_TOKEN=<access token PROD>
MERCADO_PAGO_WEBHOOK_SECRET=<secret app PROD>
APP_URL=https://www.powerliftingunited.ar
APP_PRODUCTION=true
```

Importante: si el preview DEV tiene Vercel Deployment Protection (login), Mercado
Pago no puede entregar el webhook. El `POST /api/payments/webhook/mercadopago` tiene que
quedar publico o con bypass.

Verificacion rapida:

```bash
npm run mercado-pago:urls
```

Las env de Vercel viven en el team del proyecto (`martinlgalvan00s-projects`), no
en cuentas personales sin acceso al deployment.

## Readiness y workers

- `GET /api/health`: confirma que la Function responde.
- `GET /api/ready`: devuelve 200 solamente si Prisma y Supabase responden.
- `PAYMENT_RECOVERY_JOB_ENABLED=true`: reprocesamiento de webhook y conciliacion.
- `DOMAIN_MAINTENANCE_JOB_ENABLED=true`: vence reservas de tickets y ordenes de inscripcion abandonadas.
- `MEMBERSHIP_RENEWAL_JOB_ENABLED=true`: envia avisos de renovacion. La migracion cron existente vence afiliaciones por fecha como segunda barrera.

En Vercel, un scheduler invoca por `GET` los endpoints
`/api/internal/jobs/payment-recovery`,
`/api/internal/jobs/membership-renewal` y
`/api/internal/jobs/security-user-lifecycle` con
`Authorization: Bearer <CRON_SECRET>`. El mantenimiento de reservas y órdenes
corre cada minuto en Supabase mediante la migración
`20260724000000_domain_maintenance_cron.sql`. Los RPC de claim y las
actualizaciones atómicas mantienen los reintentos idempotentes.

## Auditoria, logs y diagnostico de fallas

Todo el ciclo de cobro deja rastro en tres capas que comparten un mismo
identificador de correlacion.

### 1. `X-Request-Id`

`server/middleware/requestContext.js` asigna un id a cada request, lo devuelve
en el header `X-Request-Id` y lo propaga por `AsyncLocalStorage`. Todo lo que se
loguee durante ese request lo lleva. En un `500` el id tambien viaja en el
cuerpo (`{ "error": "Error interno", "requestId": "…" }`): es lo unico que el
atleta o el operador necesitan pasarnos para que encontremos el stack exacto.

Si el cliente ya manda un `X-Request-Id`, se reusa. En el webhook eso ata
nuestra traza al `x-request-id` que muestra el panel de Mercado Pago -- y, como
`payment_integration_events.request_id` guarda ese mismo valor, los asientos que
escriben los triggers de la base quedan correlacionados con los de la
aplicacion sin ningun trabajo extra.

### 1b. Donde falla, que paso antes y por donde entro

Tres datos convierten un stack en un diagnostico:

- **`err.origin`** — archivo, linea y funcion del primer marco de codigo propio,
  salteando `node_modules` y los internals de Node. El stack completo son 20
  lineas que arrancan en Express o en el SDK de Mercado Pago; `origin` dice
  directamente `server/modules/payments/paymentWorkflow.js:92`.
- **`trail`** — los pasos que se dieron antes de romperse, con los milisegundos
  de cada uno (`addBreadcrumb` en `server/lib/logger.js`). No emiten log propio:
  se vuelcan solo cuando algo falla. Es la diferencia entre "fallo al aplicar el
  pago" y "fallo al aplicar el pago tras reclamar el intento y recibir un
  approved de MP con un monto distinto al de la orden".
- **`entrypoint`** — por donde entro la operacion (`http:POST /api/payments/...`,
  job de recuperacion, reintento manual). El mismo error se diagnostica distinto
  segun el canal.

Los tres se guardan tambien en el asiento de auditoria, asi que sobreviven a la
rotacion de logs.

### 2. Log estructurado (`server/lib/logger.js`)

Una linea JSON por evento, con `ts`, `level`, `event`, `requestId` y contexto.
Toda falla incluye `err.stack` completo y la cadena de `cause` -- ahi vive el
detalle real del SDK de Mercado Pago, que antes se perdia. Cada error de cobro
sale ademas con su `diagnosis` (causa probable y pasos de resolucion).

Nunca se loguean secretos ni datos de tarjeta: `redact()` recorta por nombre de
clave (`token`, `secret`, `authorization`, `card`, `cvv`, …) y enmascara emails
conservando el dominio.

Variables: `LOG_LEVEL` (`debug|info|warn|error|silent`) y `LOG_PRETTY=true` para
salida legible en local.

Eventos utiles para buscar:

```text
http.request                  cada request auditado, con status y latencia
api.error                     toda respuesta de error, con stack y diagnostico
mercadopago.request           llamada al proveedor, con operacion y latencia
mercadopago.request_failed    falla del proveedor, con su codigo y descripcion
payment.*                     etapas del ciclo de cobro (ver abajo)
```

### 3. Bitacora append-only (`operational_event_logs`, `source = 'payment'`)

`server/modules/payments/paymentAuditTrail.js` asienta cada etapa. Se lee desde
Panel > Auditoria y desde `npm run payments:audit`.

```text
payment.order_created         se emitio la orden (afiliacion, inscripcion, combo)
payment.preference_created    preferencia de checkout creada en MP
payment.preference_reused     el checkout reabrio una preferencia existente
payment.attempt_claimed       el Brick tomo el lock del intento
payment.provider_submitted    el pago se envio a MP
payment.applied               el pago se acredito en el dominio
payment.duplicate_submit      reenvio sobre una orden ya aprobada
payment.webhook_received      notificacion firmada y persistida
payment.webhook_processed     notificacion aplicada al dominio
payment.webhook_failed        notificacion rechazada o fallida
payment.reconciled            conciliacion resuelta contra MP
payment.reconciliation_failed conciliacion fallida
payment.recovery_run          corrida del job de recuperacion
payment.failed                falla en cualquier etapa
```

Cada asiento fallido guarda `metadata.stage`, `metadata.requestId`,
`metadata.diagnosis` (codigo, causa y pasos) y `metadata.error.stack`. Una misma
falla se asienta una sola vez, en la capa que la vio primero.

Las altas de atleta que no se completan quedan en `source = 'identity'` como
`account.registration_failed`, con el documento y el correo como fingerprint
(nunca en claro).

### 4. Catalogo de diagnostico

`server/modules/payments/paymentFailureCatalog.js` traduce una falla a
`{ code, title, cause, fix[], severity, scope, retryable }`. La severidad
distingue lo que hay que atender de lo que es correcto:

- `blocker`: no se acredita ningun pago hasta resolverlo (config rota).
- `degraded`: el cobro funciona pero hay riesgo de plata sin acreditar.
- `expected`: caso de borde legitimo (orden ya pagada, tarjeta rechazada,
  evento sin cupo). Queda registrado y no despierta a nadie.

El panel de Pagos muestra el diagnostico en lugar del texto crudo del proveedor
y agrupa los bloqueantes con sus pasos. Si aparece
`UNCLASSIFIED_PAYMENT_FAILURE` de forma repetida, agregar el patron al catalogo.

### 5. Traza forense de un cobro

`server/modules/payments/paymentForensics.js` cruza las cinco fuentes -- orden,
intentos del Brick, notificaciones de MP, ledger y bitacora -- en una sola linea
de tiempo, con el tiempo transcurrido entre pasos y un veredicto de hasta donde
llego el cobro.

Desde el panel: boton **Ver traza del cobro** en cada orden de Finanzas. Muestra
el veredicto arriba, la secuencia debajo y, en cada falla, donde se rompio, por
donde entro, los pasos previos, el diagnostico y el stack completo. El boton
**Copiar informe** deja el JSON listo para adjuntar a un reclamo.

Por API (staff, `admin.payments.read`):

```text
GET /api/payments/audit/orders/:orderId       vida completa de una orden
GET /api/payments/audit/athletes/:athleteId   recorrido de afiliacion
GET /api/payments/audit/requests/:requestId   que paso en esa operacion
```

Por linea de comandos:

```bash
npm run payments:trace -- <orderId>            # vida completa de la orden
npm run payments:trace -- <requestId>          # que paso en esa operacion
npm run payments:trace -- <email|documento>    # recorrido de afiliacion
npm run payments:trace -- <orderId> --stack    # con los stacks completos
npm run payments:trace -- <orderId> --json
```

El veredicto distingue los casos que importan:

- `ok` — cobrado y acreditado en el dominio.
- `critical` — **el pago se acredito pero el efecto de negocio no se aplico**.
  Es la falla mas cara: el atleta pago y no tiene lo que compro.
- `blocked` — el cobro se corto por una falla que necesita accion.
- `pending` — quedo a mitad de camino; indica si hay plata en juego o no.
- `expected` / `closed` — caso de borde legitimo u orden cerrada.

El recorrido de afiliacion evalua el embudo completo (alta, correo verificado,
orden emitida, pago acreditado, afiliacion activa) y nombra el eslabon donde se
corta.

### 6. Auditoria bajo demanda

```bash
npm run payments:audit              # informe legible
npm run payments:audit -- --json    # salida para CI
npm run payments:audit -- --offline # sin llamar a la API de MP
```

Verifica credenciales y URLs, conectividad con MP, presencia de las 15 funciones
y 10 tablas del flujo, integridad del ledger, webhooks fallidos agrupados por
causa, afiliaciones cobradas sin membresia activa y las ultimas fallas con su
stack. Sale con codigo `1` si hay bloqueantes.

Complementos: `npm run mercado-pago:doctor` (credenciales),
`npm run mercado-pago:urls` (webhooks a registrar),
`npm run db:verify:payments` (maquina de estados transaccional).

## Pruebas de aceptacion

Antes de habilitar produccion verificar en sandbox:

1. Compra aprobada, pendiente y rechazada con Brick embebido.
2. Webhook duplicado, fuera de orden, con firma invalida y caida temporal de Supabase.
3. Reintento del mismo checkout con igual idempotency key sin nueva orden.
4. Dos compras simultaneas por el ultimo cupo: solo una debe confirmar la reserva.
5. Reserva abandonada: debe cancelarse y liberar cupo.
6. Transferencia: comprobante privado, acceso por token de orden y aprobacion solo por finanzas.
7. Renovacion de afiliacion activa: crea un nuevo ciclo sin acortar ni sobrescribir el vigente.
8. Inscripcion fuera de ventana, evento lleno o afiliacion vencida: debe rechazarse en DB.
9. Doble escaneo simultaneo: uno ingresa y el segundo recibe `ya utilizada`.
10. Caida de Mercado Pago despues de enviar el pago: la conciliacion debe resolver sin doble cobro.

Los comandos locales de control son:

```bash
npm run lint
npm test
npm run build
npm run payments:audit
npx prisma validate
npm audit --omit=dev
```

### Como se investiga un cobro que no acredito

Con cualquier dato que traiga quien reporta -- el correo del atleta, el id de la
orden o el `requestId` que muestra la pantalla de error -- alcanza:

```bash
npm run payments:trace -- <correo | orderId | requestId>
```

Eso responde de una: hasta donde llego el cobro, en que paso se corto, con que
error, en que archivo y linea, por donde habia entrado la operacion, que venia
pasando antes y cual es el paso siguiente. Desde el panel, el mismo informe esta
en el boton **Ver traza del cobro** de cada orden.

Si el problema no es de una orden puntual sino general:

```bash
npm run payments:audit
```

distingue si es configuracion, integridad del ledger o afiliaciones cobradas sin
activar.

Reprocesar siempre desde Panel > Pagos > Recuperar operaciones, nunca editando
estados a mano: las RPC de claim mantienen la idempotencia y una edicion manual
deja el ledger desalineado (queda registrado como drift en Integridad).
