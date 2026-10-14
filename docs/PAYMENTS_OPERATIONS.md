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
MERCADO_PAGO_COLLECTOR_ID
APP_URL
# API_URL es opcional: si falta, se usa APP_URL.
# false en local y Vercel; true solo en un unico worker persistente por entorno.
PAYMENT_RECOVERY_JOB_ENABLED=false
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

Ademas del backoff en minutos de la cola durable, las llamadas al proveedor
reintentan in-process las fallas transitorias cortas
(`server/modules/payments/providerRetry.js`): las lecturas idempotentes
(`GET /v1/payments/:id`, search por `external_reference`, `/users/me`)
reintentan red, timeout, 5xx y 429 con backoff `~500/1500/3500 ms` + jitter;
las escrituras (crear preferencia/pago/suscripcion) reintentan **solo** 429 —la
unica falla donde el proveedor garantiza que no proceso nada— respetando
`Retry-After` con techo de 10 s. Un timeout o 5xx sobre un POST de cobro nunca
se repite a ciegas: cae al camino de reconciliacion por `external_reference`,
que pregunta que paso antes de crear otra operacion.

### URLs DEV y PROD (copiar/pegar)

Frontend y API comparten origen en Vercel: alcanza con `APP_URL`; no hace falta
definir `API_URL`. Usar dos
aplicaciones distintas en Mercado Pago (TEST para DEV, PROD para produccion).

| Entorno | `APP_URL` | Webhook en panel MP |
|---------|------------------------|---------------------|
| DEV (preview rama `dev`) | `https://plu-git-dev-martinlgalvan00s-projects.vercel.app` | `https://plu-git-dev-martinlgalvan00s-projects.vercel.app/api/payments/webhook/mercadopago` |
| PROD | `https://www.powerliftingunited.ar` | `https://www.powerliftingunited.ar/api/payments/webhook/mercadopago` |

> **Siempre con `www`.** El apex `powerliftingunited.ar` no sirve la aplicacion: responde `308
> Permanent Redirect` hacia `www`. Un navegador lo sigue y no se nota, pero Mercado Pago exige
> 200/201 en la `notification_url` y **no sigue redirects**, asi que toda notificacion se da por
> fallida. Eso tuvo `payment_integration_events` en cero durante toda la vida del sistema con
> pagos reales acreditados: los cobros con tarjeta seguian funcionando porque el checkout
> embebido acredita contra la respuesta del Brick, y la falla solo aparecia en lo que depende del
> webhook (acreditacion diferida, contracargos, reembolsos).
>
> El backend promueve el apex a `www` por su cuenta (`normalizeOfficialHost`), asi que una
> variable mal cargada ya no reintroduce el problema. Verificacion rapida:
> `curl -i -X POST <notification_url>` tiene que responder **400 o 401**, nunca `3xx`.
> `npm run mercado-pago:urls` lo chequea y marca cualquier redirect como bloqueante.

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
MERCADO_PAGO_COLLECTOR_ID=<id de GET /users/me para token TEST>
APP_URL=https://plu-git-dev-martinlgalvan00s-projects.vercel.app

# Production (app PROD)
PAYMENTS_MOCK=false
MERCADO_PAGO_ENV=production
VITE_MERCADO_PAGO_PUBLIC_KEY=<public key PROD>
MERCADO_PAGO_ACCESS_TOKEN=<access token PROD>
MERCADO_PAGO_WEBHOOK_SECRET=<secret app PROD>
MERCADO_PAGO_COLLECTOR_ID=<id de GET /users/me para token PROD>
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

## Perfil de cobro por evento (Fase A + B1)

La matriz `platform_payment_channels` es el **valor por defecto**, no el techo.
Cada evento decide por su cuenta qué medios recibe en inscripción y en entradas:
puede **cerrar** un canal que la plataforma tiene abierto y **abrir** uno que la
plataforma tiene cerrado (por ejemplo transferencia o efectivo solo para ese
meet). También define o reutiliza datos bancarios.

| Pieza | Semántica |
|-------|-----------|
| `events.payment_channel_overrides` | JSONB opcional `{registration:{canal:v}, ticket:{canal:v}}`. `NULL` = heredar plataforma. `v`: `false` cierra, `'open'` abre, sin clave hereda. El `true` heredado del panel anterior significa «sin opinión» (no abre nada). |
| `events.bank_transfer_*` | Fallback Fase A (alias/CBU/titular en la fila del evento). |
| `payment_profiles` | Catálogo reutilizable. `bank_transfer` (B1) y `mercado_pago` (B3). |
| `events.bank_transfer_profile_id` | FK al perfil bancario. Si está set, manda sobre las columnas del evento. |
| `events.mercado_pago_profile_id` | FK al perfil MP. `NULL` = cuenta global `MERCADO_PAGO_*` / `VITE_MERCADO_PAGO_PUBLIC_KEY`. |
| `payment_profiles.secrets_ciphertext` | AES-256-GCM (`PAYMENT_PROFILE_SECRETS_KEY`). Solo access token + webhook secret. La public key va en `config`. |

Resolución de alias en checkout:

```text
perfil.config.alias ?? event.bank_transfer_alias ?? env VITE_PAYMENT_TRANSFER_*
```

Resolución Mercado Pago (B3):

```text
preferencia / Brick / embedded → access token + public key del perfil del evento
                                 (o env global si mercado_pago_profile_id es NULL)
webhook → prueba firmas contra env + todos los perfiles MP activos;
          si matchea un perfil, GET /payments usa ese access token
recovery diferido → GET /payments contra cada cuenta conocida hasta encontrar el pago
```

Canales: `abierto = override[concepto][canal]` si el evento decidió (`false` /
`'open'`), si no `plataforma[concepto][canal]`. El panel guarda solo lo que
*difiere* de la plataforma, así una celda sin tocar sigue lo que Finanzas cambie
después. Lo que **no** abre un evento: el maestro de cobros (`checkout`), el alta
del concepto (`registration` / `ticket`) y las pausas de validación; tampoco el
plazo de 72 h de los canales manuales de entradas. Ese plazo cierra solo
transferencia y Wise (esperan comprobante y aprobación); el efectivo en el lugar
(`cash_pitbull`) se cobra en la sede y se acredita en el momento, así que sigue
abierto hasta el cierre de la venta, igual que Mercado Pago
(`MANUAL_TICKET_DEADLINE_CHANNELS` en `src/lib/eventPaymentChannels.js`). Dónde se
paga el efectivo se carga por evento en Ventas → Cobro (`cash_payment_place` /
`cash_payment_notes`); vacío, es la sede del evento. Un canal que el evento cierra
no se reabre con un cupón. Membership no se personaliza por evento (sigue usando
la cuenta global).

Antes de publicar, el panel avisa (sin bloquear) si el evento quedaría sin ningún
medio de pago, con la transferencia abierta y sin alias/perfil propio, o con
entradas habilitadas sin tipo vendible (`src/lib/eventPublishChecks.js`).

API admin: `GET/POST /api/payment-profiles`, `PATCH /api/payment-profiles/:id`
(`kind=bank_transfer|mercado_pago`). Crear MP exige `config.publicKey` +
`secrets.accessToken` + `secrets.webhookSecret` y `PAYMENT_PROFILE_SECRETS_KEY`.
Editor: pestaña Ventas → perfil bancario y/o perfil MP.
Checkout: requirements y tickets availability devuelven `bankTransfer` y
`mercadoPagoPublicKey` ya resueltos.

**Fuera de alcance:** comisión de la plataforma (`marketplace_fee`), eventos
gratis (`price = 0`).

### Cuentas de Mercado Pago vinculadas por OAuth (B4)

El staff vincula una cuenta con un clic desde **Acceso y habilitación → Cuentas
de cobro** o desde el editor del evento (Ventas → Cobro → «Conectar cuenta de
Mercado Pago»). Inicia sesión en MP con la cuenta que va a cobrar, autoriza la
app de PLU y la cuenta queda como `payment_profiles` `kind=mercado_pago` con
`config.connection='oauth'`. Los pagos creados con ese token se acreditan en esa
cuenta; PLU no cobra comisión.

Configuración (una vez por entorno, app TEST en DEV y app PROD en producción):

1. `MERCADO_PAGO_CLIENT_ID` y `MERCADO_PAGO_CLIENT_SECRET` de la app (Tus
   integraciones → Credenciales). Requiere `PAYMENT_PROFILE_SECRETS_KEY`.
2. En la app de MP, «URLs de redireccionamiento»: dar de alta, idéntica y en
   HTTPS, `https://www.powerliftingunited.ar/api/payment-profiles/mercado-pago/oauth/callback`
   (o el valor de `MERCADO_PAGO_OAUTH_REDIRECT_URI`). Con el apex sin `www` MP
   recibe un 308 y la vinculación falla.
3. Si la app tiene PKCE activado: `MERCADO_PAGO_OAUTH_PKCE=true`.
4. El webhook de los pagos de cuentas vinculadas lo firma **la app de PLU**: su
   secreto tiene que estar en `MERCADO_PAGO_WEBHOOK_SECRET` (acepta lista
   separada por comas si la app OAuth no es la misma que la cuenta global).

| Pieza | Semántica |
|-------|-----------|
| `POST /api/payment-profiles/mercado-pago/oauth/start` | Devuelve la URL de autorización. `profileId` reconecta esa cuenta. Permiso `admin.events.write`. |
| `GET /api/payment-profiles/mercado-pago/oauth/callback` | Vuelta de MP, sin sesión: la autoriza el `state` (cifrado con `PAYMENT_PROFILE_SECRETS_KEY`, vence a los 20 min). Canjea el `code`, guarda la cuenta y redirige a `/admin/mercado-pago/vinculacion?status=…`. |
| `POST /api/payment-profiles/:id/refresh` | Renovación manual del token. |
| `DELETE /api/payment-profiles/:id` | Baja definitiva solo sin referencias (eventos, tienda, órdenes fijadas); si no, 409 `PAYMENT_PROFILE_IN_USE` y se archiva. No revoca la autorización en MP (no hay API): el titular la quita desde su cuenta. |
| `PATCH … {active:false}` | Archivar. 409 `PAYMENT_PROFILE_IN_USE_LIVE_EVENTS` si un evento no terminado la usa. |
| `GET /api/payment-profiles?includeUsage=true` | Suma `usage: {events, shop, pinnedOrders}` por cuenta. |
| Índice `payment_profiles_mp_oauth_collector_key` | Una cuenta OAuth por usuario de MP: reconectar la misma cuenta renueva su perfil, no lo duplica. Reconectar un perfil con **otra** cuenta de MP se rechaza (`MP_OAUTH_ACCOUNT_MISMATCH`). |

Tokens: duran 180 días y el refresh token **rota** en cada renovación. El job
`mercado-pago-oauth-refresh` (cron diario 04:00 UTC + loop residente cada 12 h)
renueva las cuentas que vencen en ≤30 días con escritura condicional al
ciphertext leído, para que dos renovaciones concurrentes no dejen guardado un
refresh token ya invalidado. `invalid_grant` deja la cuenta en
`config.status='needs_reconnect'` y el panel pide reconectarla.

Webhook: el `user_id` del body es el vendedor. `resolveMercadoPagoNotificationCredentials`
elige con él la cuenta vinculada aunque la firma matchee el secreto global; sin
`user_id` (o sin cuenta que coincida) manda la credencial que firmó, como antes.
El recovery diferido prueba también las cuentas OAuth (`listMercadoPagoAccountCredentials`).

### Cuenta fija por orden

`athlete_payment_orders` y `ticket_orders` guardan `mercado_pago_profile_id` +
`mercado_pago_account_pinned_at` la primera vez que se abre el cobro (preferencia
o pago embebido). Desde ahí el retorno y los reintentos de esa orden usan esa
cuenta aunque el staff le cambie la cuenta al evento. `pinned_at` con perfil
`NULL` = fijada a la cuenta global; `pinned_at NULL` = sin fijar (sigue la cuenta
actual del evento). FK `on delete restrict`: una cuenta con órdenes fijadas no se
borra, se archiva.

## Tienda (pedidos y cobro)

La tienda (`/tienda`) vende ropa, accesorios, exclusivas de torneo y cursos con un motor propio y
chico, **separado** de las órdenes de atletas y de entradas: no comparte estados, expiración ni
conciliación con ellas. Migración `20261203100000_shop_orders.sql`; prueba de flujo en
`supabase/tests/shop_orders_flow.sql` (correr contra la base local de Docker, no contra la real).

**Medios de pago** (configurables en Admin → Tienda → Cobro; el interruptor general de cobros de la
plataforma los cierra a todos):

- `mercado_pago`: Checkout Pro (redirección). Se acredita **solo** desde el backend, con lo que
  responde la API de Mercado Pago, validando referencia externa, monto y moneda contra el pedido.
- `bank_transfer`: alias/CBU/titular del perfil bancario elegido para la tienda (o del entorno,
  como las entradas). El comprador sube el comprobante (bucket privado `shop-payment-proofs`) y el
  staff acredita.
- `cash_on_site`: se reserva el pedido y se cobra al retirar; el staff acredita.

**Webhook propio.** Las preferencias de la tienda llevan `notification_url` =
`/api/shop/webhook/mercadopago` (verificación HMAC multi-cuenta, IPN sin firma aceptada porque el id
solo sirve para consultar la API). Está exento del chequeo de origen en `server/lib/security.js`.
Si en el panel de Mercado Pago hay una URL de notificaciones a nivel cuenta apuntando a
`/api/payments/webhook`, la preferencia tiene prioridad; un pago de la tienda que llegara igual al
webhook de entradas queda como evento fallido (no encuentra la orden) sin afectar a nadie.
Las URLs de retorno usan `?pedido=<id>&pago=<resultado>` a propósito: App.jsx concilia cualquier
URL con `payment=` + `order=` contra el motor de atletas.

**Stock.** Se descuenta al crear el pedido y se devuelve al cancelarlo o vencer; los cupos de un
curso se cuentan sobre pedidos vivos (pendientes + aprobados). El precio sale siempre de
`shop_products`. Reserva: Mercado Pago 2 h, transferencia 48 h, efectivo 72 h. `expire_shop_orders()`
corre antes de cada pedido nuevo, cada 10 min si el proceso es residente
(`SHOP_ORDER_EXPIRY_JOB_ENABLED=false` lo apaga) y diario por cron (`/api/internal/jobs/shop-order-expiry`).
Un pedido de Mercado Pago con un pago en proceso (p. ej. cupón en efectivo) espera 3 días más.

**Pagos que llegan fuera de término.** Un pago aprobado sobre un pedido vencido o cancelado intenta
recuperar el stock; si no alcanza queda `needs_refund = true` y el panel de Pedidos lo marca en
alerta hasta que alguien lo devuelva y use "Marcar devolución hecha". Un segundo pago aprobado
contra un pedido ya acreditado también queda marcado. Un reembolso/contracargo en Mercado Pago
cancela el pedido y devuelve el stock. El staff no puede cancelar a mano un pago acreditado por
Mercado Pago (se devuelve desde Mercado Pago).

**Permisos.** `admin.shop.read` ve pedidos y configuración; `admin.shop.write` acredita, entrega,
cancela y configura el cobro. Cada acción queda en `domain_audit_logs` (`shop.*`).

**Comprobantes.** Los ve el staff con una URL firmada de 2 minutos. No entran a la política de
retención ni al ZIP de Cobros (otro bucket, otro vocabulario de estados), pero sí al registro de
archivos y a la papelera: un comprobante reemplazado o huérfano pasa por ahí y se purga tras el período
de gracia (ver "Retencion de comprobantes").

## Wise (pagos del exterior)

Canal manual para quien no puede pagar con Mercado Pago (medios locales, ARS).
No es una integración con la API de Wise: es el mismo circuito de transferencia
bancaria —comprobante del pagador + aprobación de Finanzas— apuntado a una
cuenta Wise y cobrado en USD en vez de ARS. Cubre afiliación, inscripción,
combo y entradas Pitbull.

**Cómo se modela** (`supabase/migrations/20260827120000_wise_transfer_channel.sql`):

- `manual_payment_channel = 'wise_transfer'` en `athlete_payment_orders` /
  `ticket_orders`, con el mismo `method='manual_link'` (lado atleta) y
  `provider='manual'` (lado entradas) que la transferencia local y "Efectivo en
  Pitbull". Lo único que cambia es el canal.
- **No tiene un interruptor propio**: es la cuarta celda de la matriz concepto ×
  canal (`platform_payment_channels`), así que hereda interruptor por concepto,
  getter, setter (`staff_set_payment_channel`) y disponibilidad pública. Se abre
  Wise para afiliación sin reabrir la transferencia local en ARS, y viceversa.
- Nace **cerrado en los tres conceptos** y no hereda el estado de ningún toggle
  anterior (`defaultChannelState` en `server/services/platformFeatureToggleService.js`).
  Es la única excepción al "default abierto": si la lectura de la matriz llega
  incompleta, el resto de los canales se asumen abiertos y Wise cerrado (ver
  `channelOpen` en `src/lib/paymentChannels.js`).
- Precio fijo en USD por `WISE_PRICE_MEMBERSHIP_USD` / `WISE_PRICE_REGISTRATION_USD`
  / `WISE_PRICE_COMBO_USD` / `WISE_PRICE_TICKET_USD`. Monto **entero, sin
  centavos**: las columnas `amount` son `int` y un decimal rompe el cast en la
  RPC de entradas. Sin configurar —o con un placeholder tipo `replace`/`changeme`—
  la API responde `503` en vez de adivinar un monto (`wisePriceFor` en
  `server/modules/pricing/checkoutPricePolicy.js`).
- Entradas cobra un monto plano **multiplicado por cantidad**: no hay catálogo en
  USD por tipo de entrada ni por addon.
- No admite cupones ni la promo ARS de preventa. El precio se resuelve con un
  branch de salida temprana en `plu_private.settle_manual_checkout_pricing`,
  antes de tocar `resolve_channel_price`/cupones;
  `plu_private.configure_atomic_checkout_pricing` no se modifica. La moneda viaja
  como `p_currency` en las tres RPC `_checkout` y sólo se aplica cuando el canal
  es `wise_transfer`.
- En el frontend, `money()` formatea con la moneda real de la orden: ARS sin
  centavos, USD con dos decimales.

**Antes de abrir la celda en producción:**

1. Cargar los cuatro `VITE_PAYMENT_WISE_*` (datos de la cuenta que ve el pagador)
   y los cuatro `WISE_PRICE_*_USD`. Sin los primeros el modal de pago muestra
   "Solicitar a administración"; sin los segundos el checkout corta con 503.
2. Confirmar con `npm run payments:trace -- <orderId>` que una orden de prueba en
   `wise_transfer` queda con `currency=USD` y el monto esperado.
3. Recién entonces abrir la celda de Wise, por concepto, en Administración >
   Acceso y habilitación. Entradas no ofrece "Efectivo en el lugar" pero sí Wise.

**Aprobación:** misma cola que la transferencia local
(`AthletePaymentOrdersSection` / `TicketOrdersSection`). Por defecto el
comprobante es obligatorio — `approve_athlete_payment_order` solo exceptúa
`cash_pitbull` sin archivo. Finanzas puede acreditar transferencia/Wise sin
adjunto con `p_override_reason` (mín. 8 caracteres); la bitácora marca
`overrideWithoutProof`. Acá no hay webhook ni conciliación automática: el
comprobante del pagador (o el override auditado) es la fuente de verdad.
`npm run payments:trace -- <orderId | correo>` reconstruye el mismo informe
que para Mercado Pago.

## Readiness y workers

- `GET /api/health`: confirma que la Function responde.
- `GET /api/ready`: devuelve 200 solamente si Prisma y Supabase responden.
- `PAYMENT_RECOVERY_JOB_ENABLED=true`: inicia un loop residente de recuperacion;
  usarlo solamente en un unico worker persistente por entorno. En local y
  Vercel queda `false`: el cron autenticado ejecuta la recuperacion bajo demanda.
- `PAYMENT_REVALIDATION_JOB_ENABLED=true`: mismo criterio, pero para el barrido
  que corrige ordenes de Mercado Pago mal etiquetadas (`cancelado`/`rechazado`
  local cuando el proveedor ya tiene un pago `approved`) releyendo el estado
  real contra la API de MP — es el mismo camino que el boton "Revalidar" del
  panel (`server/modules/payments/paymentRevalidationWorkflow.js`), corrido
  con `apply: true` sobre las ultimas `PAYMENT_REVALIDATION_SINCE_DAYS` (3 por
  defecto) ordenes no aprobadas. En Vercel queda `false`: el cron diario
  autenticado lo ejecuta bajo demanda. El staff tambien puede dispararlo a
  mano desde el panel.
- `DOMAIN_MAINTENANCE_JOB_ENABLED=true`: vence reservas de tickets y ordenes de inscripcion abandonadas.
- `MEMBERSHIP_RENEWAL_JOB_ENABLED=true`: envia avisos de renovacion. La migracion cron existente vence afiliaciones por fecha como segunda barrera.
- `PAYMENT_ORDER_EXPIRY_JOB_ENABLED` (default on, `=false` lo apaga): reclama
  y envia el recordatorio (~2 dias antes) y el aviso final de vencimiento de
  ordenes de pago manual (transferencia/efectivo, plazo de 5 dias desde
  `plu_private.manual_link_checkout_window()`). A diferencia de
  `membership-renewal` (opt-in), este es opt-out: es puramente DB + dispatcher
  idempotente, sin riesgo de doble-cobro contra un proveedor externo. Cron
  `/api/internal/jobs/payment-order-expiry`, diario en Vercel: alcanza de
  sobra frente a una ventana de días (recordatorio ~2 días antes, aviso final
  a los 5), así que ya no hace falta un workflow externo que lo complemente
  cada hora.
- Retencion de comprobantes: la politica la define el staff en **Cobros >
  Comprobantes** (`payment_proof_settings`), no una variable de entorno. Por
  defecto se **conserva todo**. Modos: `keep` (conservar), `after_export`
  (a la papelera N dias despues de que el staff lo descargo a su equipo) y
  `after_days` (a la papelera N dias despues de aprobar/rechazar, se haya
  descargado o no). Nunca toca ordenes pendientes.
  **Borrado logico en dos etapas.** Ningun modo borra de Storage directamente:
  el comprobante pasa primero a la **papelera** (`payment_proof_files.deleted_at`,
  restaurable desde Cobros) y recien pasado el **periodo de la papelera**
  (`payment_proof_settings.trash_grace_days`, 30 dias por defecto, 1-3650) el job
  borra el objeto del bucket y marca `purged_at`. Esa segunda etapa no tiene
  vuelta atras. Llegan a la papelera: lo que vence la politica, la baja manual
  (`POST /api/payment-proofs/orders/:source/:orderId/trash`, solo ordenes ya
  resueltas; en el panel, "Mover a la papelera" en el dialogo del comprobante de
  Finanzas y de Entradas, con confirmacion, y solo con `admin.payments.approve`),
  el comprobante que reemplaza otro subido despues, los de un atleta
  eliminado y los archivos huerfanos (objetos del bucket que ninguna orden
  conoce, con mas de 24 h). `payment_proof_files` es el registro de cada archivo
  subido (atletas, entradas **y tienda**); un trigger lo mantiene solo.
  La tienda (`shop-payment-proofs`) entra a la papelera y a su purga, pero no a
  la politica de retencion ni al ZIP.
  Una corrida del job (cron diario 03:30, `/api/internal/jobs/payment-proof-retention`)
  hace tres etapas independientes: vencidos -> papelera (`proof_retention_trash`),
  papelera -> purga fisica y huerfanos -> papelera. La purga y el barrido corren
  **tambien con `keep`**: la papelera se alimenta de mas cosas que la politica.
  Si falla una etapa las otras siguen, y cada corrida con movimiento deja un
  asiento `payment_proofs.retention_run` en `operational_event_logs`.
  `PAYMENT_PROOF_RETENTION_JOB_ENABLED=false` es un interruptor de emergencia:
  apaga el job entero aunque el panel pida mover o purgar.
  Un archivo cuyo periodo ya vencio no se puede restaurar (`proof_restore`
  responde 409): es candidato a la purga y restaurarlo abriria una carrera con el
  job. Se puede seguir viendo y descargando hasta que se elimina.
  Papelera en el panel: `GET /api/payment-proofs/trash`, ver el archivo
  (`/trash/:id/file`), restaurar (`POST /trash/:id/restore`), eliminar ahora
  (`DELETE /trash/:id`) y vaciar (`POST /trash/empty` con `{"confirm": true}`).
  Ver y listar piden `admin.payments.read`; restaurar, eliminar, vaciar y la baja
  manual piden `admin.payments.approve`, y cada una queda auditada
  (`payment_proofs.restored|purged|trash_emptied|trashed`).
  La orden conserva `payment_proof_uploaded_at`, `payment_proof_exported_at`,
  `payment_proof_trashed_at` y `payment_proof_purged_at` como registro; mientras
  el comprobante esta en la papelera `payment_proof_path` es `null`.
  La retencion y el respaldo cubren las dos tablas con comprobantes: atletas
  (`athlete_payment_orders`) y entradas (`ticket_orders`). El ZIP de descarga
  (hasta 100 archivos o 120 MB por tanda) trae `comprobantes/atletas/`,
  `comprobantes/entradas/` y un `indice.csv`, y marca como descargado solo lo
  que entro. El indice CSV (`/api/payment-proofs/index.csv`) lee todas las
  transferencias, sin tope de filas.
  Aviso previo: `GET /api/payment-proofs/summary` calcula en una sola consulta a
  la base (`payment_proof_overview`) el resumen, un `forecast` con lo que va a la
  papelera en los proximos 7 dias y cuanto de eso no tiene copia
  (`notDownloaded`), y el estado de la `trash`; `GET /api/payment-proofs/forecast?mode=&days=`
  calcula lo mismo para una politica todavia sin guardar. Al guardar una politica
  que mueve archivos, la auditoria (`payment_proofs.retention_updated`) registra
  en `atStake` cuantos comprobantes quedaban en juego.
  Un comprobante nuevo nace sin marca de descargado, accedido ni purgado
  (trigger `reset_proof_state_on_new_file`): el reemplazo no hereda el "ya lo
  descargue" del archivo anterior.
  Migraciones (en orden): `20261213100000_payment_proof_archive`,
  `20261214100000_payment_proof_integrity`, `20261214110000_payment_proof_files`.
  Sin ellas `/summary` responde 500 (funcion o columna ausente), a proposito:
  indica una migracion sin aplicar. `20261214100000` ya se habia aplicado cuando se
  sumaron `payment_proof_trashed_at` y el bypass de restauracion del trigger, asi
  que ese complemento vive al principio de `20261214110000` (idempotente) y no en
  la primera: una migracion aplicada no se edita.
  Antes de este cambio la purga corria sola a las 24 h: las transferencias
  aprobadas hasta entonces ya no tienen archivo y no se pueden recuperar.

En Vercel, un scheduler invoca por `GET` los endpoints
`/api/internal/jobs/payment-recovery`,
`/api/internal/jobs/payment-revalidation`,
`/api/internal/jobs/payment-order-expiry`,
`/api/internal/jobs/payment-proof-retention`,
`/api/internal/jobs/membership-renewal` y
`/api/internal/jobs/security-user-lifecycle` con
`Authorization: Bearer <CRON_SECRET>`. El mantenimiento de reservas y órdenes
corre cada minuto en Supabase mediante la migración
`20260724000000_domain_maintenance_cron.sql`. Los RPC de claim y las
actualizaciones atómicas mantienen los reintentos idempotentes.

Nota sobre `payment-revalidation`: a diferencia de `payment-recovery` (que
drena colas de eventos que sí llegaron), este job existe para el caso donde
ninguna entrada llegó — la notificación de Mercado Pago se perdió, el atleta
cerró la pestaña antes de volver del checkout, y el cron de expiración
(`expire_domain_orders`, cada 3 minutos) canceló la orden mientras tanto. Sin
este job, esa orden queda `cancelado` hasta que alguien del staff la revalida
a mano desde el panel.

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

#### Dos convenciones para el mismo hecho

La lista de arriba es la que escribe la aplicacion. Los triggers de
`payment_integration_events` y `embedded_payment_attempts` asientan **los mismos hechos con otra
convencion**: `payment_webhook.<status>`, `payment_attempt.<status>`,
`payment_reconciliation.<status>`. Tambien conviven `payment.applied` y `payment.aprobado`.

No se unificaron los nombres a proposito: la bitacora es append-only y reescribir el historico
para que quede prolijo destruiria su valor probatorio. En su lugar, la lectura agrupa las
acciones en **categorias** (`server/modules/audit/auditActionCategories.js`), que es lo que usa
el filtro del panel:

| Categoria | Agrupa |
|---|---|
| `webhook` | `payment.webhook_*` **y** `payment_webhook.*` |
| `conciliacion` | `payment.reconcil*`, `payment_reconciliation.*`, `payment.recovery_*` |
| `checkout_cliente` | `payment_brick.*` (falla en el navegador del atleta, no del servidor) |
| `cobro` | el resto del ciclo, incluidos `payment_attempt.*` |

Filtrar por categoria en Panel > Auditoria trae las dos convenciones juntas; el filtro de accion
exacta sigue disponible para cuando ya se sabe que se busca.

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

## Que verifica el CI del cobro

Automatizado, en cada PR y en cada push a `main`:

| Compuerta | Donde | Que prueba |
|---|---|---|
| `tests/paymentRevalidation.test.js` | job `application` | seleccion del pago canonico, revalidacion y barrido con dobles |
| `tests/infra.apiSurface.test.js` | job `application` | que acreditar, corregir y revalidar sigan detras de `admin.payments.approve`, y que los dos paths del webhook verifiquen firma |
| `tests/infra.httpHardening.test.js` | job `application` | la app levantada: 401 sin sesion en las rutas de plata, webhook sin firma rechazado |
| `tests/integration/mercadoPagoWebhook.integration.test.js` | job `supabase-integration` | webhook firmado end-to-end contra Postgres: acredita, activa la afiliacion, no duplica, y rechaza monto que no coincide |
| `tests/integration/paymentRevalidation.integration.test.js` | job `supabase-integration` | una orden cancelada vuelve a `aprobado` con el pago del proveedor, activa la membresia y queda asentada |
| `npm run db:verify:payments` | job `supabase-integration` | smoke transaccional de la maquina de estados |
| `npm run db:verify:schema` | job `supabase-integration` | las RPC de cobro existen y no las puede ejecutar el navegador |
| `npm run mercado-pago:doctor` | job `integrations-live` | el token real responde (solo con secrets cargados) |
| `deployment-smoke.yml` | post-deploy | health, readiness, ruta privada cerrada y webhook sin firma rechazado en la instancia publicada |

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

### La orden figura cancelada o rechazada pero la plata entro

Ese es el unico caso que **no** resuelve Recuperar operaciones. Recuperar drena
dos colas: notificaciones que llegaron (`payment_integration_events`) e intentos
embebidos que quedaron sin conciliar (`embedded_payment_attempts`). Si el cobro
se hizo por el checkout redirigido y la notificacion nunca llego --URL mal
configurada, redirect en el camino, notificacion perdida-- y ademas el atleta no
volvio al sitio, no hay ninguna fila en esas dos colas: la orden se queda con el
ultimo estado conocido y nadie vuelve a preguntarle al proveedor.

El orden de resolucion es:

1. **Revalidar contra Mercado Pago** -- Panel > Pagos, boton `Revalidar con
   Mercado Pago` de la fila (o el barrido `Revalidar con Mercado Pago` de la
   franja de operaciones, que lista todas las divergencias de los ultimos 30
   dias antes de tocar nada). Relee los pagos que el proveedor tiene contra esa
   orden por `external_reference` y aplica el mismo camino canonico del webhook,
   con sus validaciones de monto, moneda y pertenencia. Es la via correcta
   siempre que el cobro exista en Mercado Pago: el estado queda respaldado por
   el proveedor, no por la firma de un operador.

   ```
   POST /api/payments/orders/:orderId/revalidate   { "apply": true }
   POST /api/payments/operations/revalidate        { "sinceDays": 30, "limit": 50, "apply": false }
   ```

   Permiso: `admin.payments.approve`. Deja asiento `payment.revalidated` /
   `payment.revalidation_mismatch` en la bitacora (categoria `conciliacion`).

2. **Acreditar a mano** (`Acreditar a mano`, `staff_force_settle_payment_order`)
   solo si Mercado Pago **no** tiene el pago: transferencia acreditada por fuera
   del checkout, cobro resuelto por otro canal. Exige comprobante adjunto y
   motivo, y queda asentado como `payment.force_settled` con severidad
   `warning`.

Si la revalidacion devuelve `amount_mismatch`, el cobro existe pero por otro
importe (cambio de tarifa entre el alta de la orden y el pago, cupon aplicado
despues). No se aplica solo: hay que decidir a mano si se acredita, se ajusta la
orden o se reintegra.
