# Flujo de emails — Brevo

## Principio

Los emails **nunca rompen el flujo principal**. Toda operación de negocio (alta, pago,
inscripción) se confirma en la base **antes** de intentar el envío, y los llamadores tratan el
email como best-effort. Si Brevo falla o no está configurado, se registra y se sigue.

## Arquitectura

```
Evento de negocio
  └─> emailDispatcher.send(type, { to, params, entityId })
        ├─ 1. beginEmail() -> outbox durable + idempotencia por idempotency_key
        ├─ 2. valida destinatario y params; todo rechazo queda auditado
        ├─ 3. consulta email_suppressions; las supresiones también quedan registradas
        ├─ 4. template de Brevo si BREVO_TEMPLATE_* está cargado,
        │     si no -> fallback HTML de emailTemplates.js
        ├─ 5. brevoAdapter.send() con timeout + backoff
        └─ 6. completeEmail() -> sent | retrying | failed | skipped

emailDispatchJob  ──> claim_retryable_emails() ──> dispatcher.retry()
webhook de Brevo  ──> record_email_delivery_event() ──> delivered | bounced + supresión
```

| Archivo | Rol |
|---|---|
| `server/modules/notifications/emailCatalog.js` | **Fuente de verdad**: tipos, template env, params obligatorios, categoría, opt-out |
| `server/modules/notifications/emailDispatcher.js` | Camino único de envío: validación, idempotencia, supresión, reintentos |
| `server/modules/notifications/brevoAdapter.js` | Cliente HTTP: timeout, backoff, clasificación de errores |
| `server/modules/notifications/emailTemplates.js` | Fallback HTML de marca cuando falta el template de Brevo |
| `docs/email-previews/` | HTML de referencia abribles (`npm run email:previews`) |
| `server/modules/notifications/supabaseNotificationRepository.js` | Persistencia sobre `transactional_email_logs` y `email_suppressions` |
| `server/modules/notifications/eventNotificationService.js` | Avisos de evento a una audiencia |
| `server/jobs/emailDispatchJob.js` | Vacía la cola de `retrying` |
| `server/routes/emails.js` | `/send`, `/webhook/brevo`, `/logs`, `/catalog`, `/suppressions` |

Cada transición de `transactional_email_logs` se copia además a
`operational_event_logs`. El historial operativo es append-only: un `delivered`, `bounced` o
`rejected` ya no pisa la evidencia del intento anterior. El panel consume la vista unificada
`operational_audit_events` y su resumen de salud detecta reintentos, fallos, pagos sin afiliación
activa y afiliaciones activas sin confirmación de entrega.

## Política de consolidación

Una misma transición de negocio genera **un solo correo por destinatario**:

- alta de atleta: bienvenida + verificación + OTP en `email_verification`;
- pago aprobado: comprobante + afiliación + inscripción o entrada en `payment_confirmation`;
- reintegro: importe reintegrado + baja de afiliación en `payment_refunded`.

Los correos que ocurren en otro momento o exigen una acción propia permanecen separados: acceso,
recuperación de contraseña, pago pendiente/rechazado, recordatorios y cambios de seguridad. Así un
combo de afiliación e inscripción baja de cuatro envíos consecutivos a uno, sin perder contenido ni
trazabilidad. El log de `payment_confirmation` guarda `membershipId` y `registrationId` en su payload
para relacionar la única entrega con todos los derechos habilitados.

## Catálogo de tipos

Alta de un email nuevo: se declara **solo** en `emailCatalog.js` y se le agrega un cuerpo en
`emailTemplates.js`. Nada más hay que tocar.

| Tipo | Disparador | Opt-out |
|---|---|---|
| `welcome` | Legacy (ya no se dispara en el alta; se mantiene el template) | no |
| `email_verification` | Registro + `POST /api/athletes/me/resend-verification` | no (crítico) |
| `password_reset` | `POST /api/athletes/forgot-password` | no (crítico) |
| `security_access` | Alta de cuenta de seguridad | no (crítico) |
| `staff_invitation` | Alta o reenvío de acceso al panel | no (crítico) |
| `staff_email_change` | Solicitud de cambio de email del staff | no (crítico) |
| `staff_email_changed` | Aviso a la casilla anterior | no (crítico) |
| `affiliation_started` | Legacy; su estado ahora se incluye en `payment_confirmation` | no |
| `affiliation_approved` | Activación administrativa directa, fuera de un pago | no |
| `affiliation_cancelled` | Cancelación administrativa o de un pago sin reintegro | no |
| `membership_renewal` | Job de renovación (30/7/0 días) | sí |
| `payment_approved` | Legacy; reemplazado por `payment_confirmation` | no |
| `payment_receipt` | Legacy; reemplazado por `payment_confirmation` | no (crítico) |
| `payment_confirmation` | Pago aprobado por Mercado Pago o aprobación manual, con todos sus derechos | no (crítico) |
| `payment_pending` | Pago pendiente de acreditación | no |
| `payment_order_reminder` | Job de vencimiento de pago manual (~2 días antes de los 5) | no |
| `payment_order_expired` | Job de vencimiento de pago manual (tras cancelarse) | no |
| `payment_rejected` | Pago rechazado | no |
| `payment_refunded` | Pago reintegrado por el proveedor, incluyendo la baja asociada | no |
| `registration_confirmed` | Legacy; la confirmación se incluye en `payment_confirmation` | no |
| `ticket_confirmation` | Legacy; la entrada se incluye en `payment_confirmation` | no (crítico) |
| `event_announcement` | Manual, desde el panel | sí |
| `event_reminder` | Manual, desde el panel | sí |
| `admin_notification` | Alertas operativas | no |
| `export_ready` | Exportación lista | no |

`GET /api/emails/catalog` muestra, por tipo, si sale por template de Brevo o por fallback HTML.

`admin_notification` y `export_ready` existen y funcionan, pero todavía no los dispara ningún
flujo: solo salen a mano por `POST /api/emails/send`.

El endpoint genérico `/api/emails/send` acepta únicamente `event_announcement`,
`event_reminder`, `admin_notification` y `export_ready`. Las confirmaciones de pagos,
afiliaciones e inscripciones sólo salen desde sus workflows; un operador no puede recrearlas a
mano y duplicar el correo que ya emitió el evento de negocio.

## Verificación de email

No bloqueante. La cuenta se usa desde el minuto cero; lo que se bloquea es **afiliarse e
inscribirse** (`assertEmailVerified` en `routes/athletes.js`), que son las dos acciones que
terminan en un pago. Un typo en la dirección ahí deja al atleta sin comprobante y sin forma de
reclamar.

- Registro → manda **un solo** `email_verification` (asunto *Bienvenido a PLU ARG: confirma tu
  correo*; título *Te damos la bienvenida a PLU Argentina* + CTA + OTP de 8 dígitos).
- El link es `/?verificar=<token>`, con token HMAC de 7 días, resuelto por
  `EmailVerificationNotice.jsx`.
- Fallback OTP: código de 8 dígitos (hash en `athletes.email_otp_*`, TTL 24 h). Se ingresa en
  Mi cuenta (`POST /api/athletes/me/verify-email-code`).
- Reenvío: `POST /api/athletes/me/resend-verification` (regenera link + OTP).
- El link HMAC sigue sin persistirse: reabrir sobre una cuenta ya verificada es idempotente.
  El OTP sí se hashea en DB y se invalida al usarlo o al emitir uno nuevo.
- La migración marca como verificadas las cuentas preexistentes: bloquearlas retroactivamente les
  cortaría la afiliación sin aviso.

## Templates: Brevo primero, fallback siempre

Cada tipo tiene una variable `BREVO_TEMPLATE_*` **opcional**:

- **Cargada** con el ID numérico del dashboard → se usa ese template y los `params` viajan como
  variables (`{{ params.name }}`).
- **Vacía** → sale el HTML de `emailTemplates.js`, con la identidad institucional.

Es decir: el sistema funciona completo sin cargar un solo template en Brevo, y cargarlos después
mejora la pieza sin tocar código.

El HTML de fallback usa hex literales espejo de `src/styles/tokens/palette.css` (los clientes de
correo no resuelven custom properties). Si cambia la paleta, hay que sincronizarlos a mano.

El encabezado es negro con el emblema Argentina croppeado y el wordmark de marca;
el título del mail va en el cuerpo blanco (`{APP_URL}/brand/plu-argentina-email.png`).
Sin `APP_URL` válida cae al wordmark tipográfico. Para revisar el diseño en el navegador:

```bash
npm run email:previews
```

Los HTML quedan en `docs/email-previews/`. Si hay `BREVO_TEMPLATE_*` cargados, el dashboard pisa
este diseño: para que los destinatarios vean el fallback, dejá esos IDs vacíos o alineá Brevo.

## Idempotencia

Toda salida lleva `idempotency_key`, con índice único en `transactional_email_logs`. Un reintento
del webhook de Mercado Pago no puede generar un segundo comprobante. Las claves se anclan al
identificador externo estable, no al de la orden:

```
email:payment-confirmation:<externalPaymentId>
email:payment-confirmation:manual:<orderId>
email:membership-renewal:<notificationId>   # incluye el umbral: expires_in_30, expired
email:payment-order-reminder:<notificationId>
email:payment-order-expired:<notificationId>
email:event_announcement:<eventId>:<athleteId>
```

## Reintentos

`brevoAdapter` clasifica cada fallo en `retryable` (429, 5xx, red) o permanente (400, 401,
`invalid_parameter`, `document_not_found`). Un fallo transitorio queda en `retrying` con
`next_retry_at`; el backoff es **2 min, 10 min, 1 h, 6 h, 24 h** y después `failed`.

`claim_retryable_emails` reserva el lote con `for update skip locked`, así que dos instancias no
mandan el mismo email. También rescata filas colgadas en `processing` hace más de 15 minutos
(instancia que murió a mitad de envío).

Los emails que contienen un enlace bearer o un código de verificación no se reintentan desde el
outbox: sus valores se redactan antes de persistir. Ante una falla se reemite una credencial nueva
desde el flujo de origen (Usuarios, recuperación o Seguridad), invalidando la anterior.

> **Limitación en Vercel Hobby**: los cron jobs admiten una sola corrida diaria (contrato
> verificado en `tests/deploymentConfig.test.js`), así que el backoff colapsa a un intento por
> día. El primer envío sigue siendo inmediato; solo se demora la recuperación de un fallo
> transitorio. Con proceso residente o Vercel Pro (cron horario) el backoff se respeta.

## Frecuencia de renovaciones

Cada ciclo de afiliación puede generar como máximo tres recordatorios: **30 días**, **7 días** y
**el día del vencimiento**. La política anterior sumaba 1 día y otro aviso posterior de
"vencida", llegando a cinco correos por ciclo. Los avisos viejos todavía pendientes quedan como
`cancelled` en `membership_renewal_notifications`: no se borran y conservan la evidencia
operativa, pero el job ya no puede enviarlos.

## El 201 de Brevo no garantiza entrega

**La trampa más importante de esta integración.** Brevo acepta el envío con `201` y puede
rechazarlo después, de forma asincrónica. Pasó en este proyecto: `BREVO_SENDER_EMAIL` apuntaba a
un remitente sin validar y el evento posterior decía

> `Sending has been rejected because the sender you used soporte@pluarg.com is not valid.
> Validate your sender or authenticate your domain`

Desde el código no hay nada que detectar: la llamada fue exitosa, el log queda en `sent`, y no se
entrega un solo mail. Por eso:

- El webhook **no es opcional**. Es el único mecanismo que convierte ese `sent` en `rejected`.
- `npm run email:doctor` valida el remitente contra la API antes de que el problema aparezca en
  producción.

Diagnóstico rápido: si `transactional_email_logs` está lleno de `sent` y ninguno pasa a
`delivered`, el webhook no está cargado o el remitente no está validado.

## Diagnóstico: `npm run email:doctor`

Chequea lo que no se ve desde el código:

1. Que la API key sea válida.
2. **Que el remitente esté validado o su dominio autenticado.**
3. Cuánta cuota diaria queda (el plan free son 300 emails/día).
4. Eventos de error recientes en la cuenta, agrupados por motivo.
5. Si hay webhook cargado.
6. Qué templates del catálogo están cargados y cuáles usan fallback.

```bash
npm run email:doctor
npm run email:doctor -- --send tu@email.com   # envía una prueba real
```

## Rendimiento

| Punto | Antes | Ahora |
|---|---|---|
| Pago aprobado | 2 a 4 emails por orden | 1 `payment_confirmation` contextual |
| Pago reintegrado con afiliación | 2 emails | 1 `payment_refunded` consolidado |
| Renovación por ciclo | Hasta 5 recordatorios | 3 hitos: 30, 7 y 0 días |
| Reserva de la fila (`beginEmail`) | SELECT + INSERT | INSERT y el conflicto 23505 como señal de duplicado |
| Supresiones en un envío masivo | 1 consulta por destinatario | 1 consulta para toda la audiencia, cacheada en memoria |
| Aviso a una audiencia | Secuencial (~100 s para 500, **excedía** el `maxDuration` de 60 s de Vercel) | 8 en paralelo, ~12 s |
| Job de reintentos | Secuencial | 8 en paralelo |

El paralelismo es acotado a propósito (`EMAIL_BROADCAST_CONCURRENCY`, `EMAIL_DISPATCH_CONCURRENCY`):
sin límite, Brevo responde 429 y se pierde el control sobre la cuota diaria.

> **Cuota**: en el plan free son 300 emails/día. Un anuncio a toda la base la agota; los
> excedentes fallan con error de cuota y quedan en `retrying`.

## Webhook de entrega

`POST /api/emails/webhook/brevo?token=<BREVO_WEBHOOK_TOKEN>`

Brevo **no firma** el payload; la protección es un token compartido comparado en tiempo constante.
La ruta siempre responde 200 (un 5xx hace que Brevo desactive el webhook).

- `delivered` → `status = delivered`
- `error` → `status = rejected`. **No** suprime: el problema es del remitente, no del destinatario
- `hard_bounce`, `blocked`, `spam`, `invalid_email`, `unsubscribed` → `status = bounced` **y** alta
  en `email_suppressions`
- `soft_bounce` → marca el log, pero **no** suprime (puede ser un buzón lleno pasajero)

Los nombres de evento se normalizan (`hardBounce` → `hard_bounce`): Brevo no es consistente entre
su API de estadísticas y algunas versiones del webhook.

Configurar en Brevo: *Transactional → Settings → Webhooks*, con la URL y los eventos de arriba.
`npm run email:doctor` devuelve error si falta el webhook, el token o una URL HTTPS pública; no
considera sana una instalación que solo puede observar el `201` inicial.

## Política de supresión

| Motivo | Frena |
|---|---|
| `hard_bounce`, `spam`, `blocked`, `invalid` | **Todo**, incluso los críticos. La dirección no existe o nos denunció; insistir daña la reputación del dominio. |
| `unsubscribed` | Solo los tipos con `optOutAllowed` (avisos de evento, renovación). Nadie deja de recibir su comprobante de pago por haber cortado los anuncios. |

## Seguridad

- `BREVO_API_KEY` vive **solo** en el servidor. El frontend no habla con Brevo; pide envíos a
  `/api/emails`. `tests/env.test.js` verifica que no reaparezca `VITE_BREVO_API_KEY`.
- Cuenta, pagos, afiliaciones e inscripciones **no** se pueden disparar desde
  `POST /api/emails/send`: los tipos sensibles abrirían una vía de phishing y los estados de
  negocio permitirían duplicar confirmaciones desde el panel.
- Los params se escapan al renderizar el HTML y las URLs se validan por protocolo
  (`javascript:` y `data:` se descartan).
- Contraseñas, OTP y URLs firmadas se usan solamente en memoria. En
  `transactional_email_logs.payload` quedan como `[REDACTED]`; las claves de idempotencia usan
  huellas SHA-256 y nunca fragmentos del secreto.

## Variables de entorno

Ver el bloque "Brevo" de `.env.example`. Mínimo para enviar de verdad: `BREVO_API_KEY` y
`BREVO_SENDER_EMAIL` (dominio verificado en Brevo). Todo lo demás es opcional.

## Referencias

- [Brevo — Send transactional email](https://developers.brevo.com/reference/sendtransacemail)
- [Brevo — Webhooks](https://developers.brevo.com/docs/transactional-webhooks)
- [Brevo — Error codes](https://developers.brevo.com/docs/error-codes)
