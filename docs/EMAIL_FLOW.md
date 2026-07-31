# Flujo de emails — Brevo

## Principio

Los emails **nunca rompen el flujo principal**. Toda operación de negocio (alta, pago,
inscripción) se confirma en la base **antes** de intentar el envío, y los llamadores tratan el
email como best-effort. Si Brevo falla o no está configurado, se registra y se sigue.

## Arquitectura

```
Evento de negocio
  └─> emailDispatcher.send(type, { to, params, entityId })
        ├─ 1. valida `type` y params obligatorios contra emailCatalog.js
        ├─ 2. corta si el destinatario está en email_suppressions
        ├─ 3. beginEmail() -> idempotencia por idempotency_key
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
| `server/modules/notifications/supabaseNotificationRepository.js` | Persistencia sobre `transactional_email_logs` y `email_suppressions` |
| `server/modules/notifications/eventNotificationService.js` | Avisos de evento a una audiencia |
| `server/jobs/emailDispatchJob.js` | Vacía la cola de `retrying` |
| `server/routes/emails.js` | `/send`, `/webhook/brevo`, `/logs`, `/catalog`, `/suppressions` |

## Catálogo de tipos

Alta de un email nuevo: se declara **solo** en `emailCatalog.js` y se le agrega un cuerpo en
`emailTemplates.js`. Nada más hay que tocar.

| Tipo | Disparador | Opt-out |
|---|---|---|
| `welcome` | Registro de atleta | no |
| `email_verification` | Registro + `POST /api/athletes/me/resend-verification` | no (crítico) |
| `password_reset` | `POST /api/athletes/forgot-password` | no (crítico) |
| `security_access` | Alta de cuenta de seguridad | no (crítico) |
| `affiliation_started` | Pago de membresía acreditado | no |
| `affiliation_approved` | Aprobación manual de la orden | no |
| `membership_renewal` | Job de renovación (30/7/1/0 días) | sí |
| `payment_approved` | Pago acreditado | no |
| `payment_receipt` | Pago acreditado (comprobante) | no (crítico) |
| `payment_pending` | Pago pendiente de acreditación | no |
| `payment_rejected` | Pago rechazado | no |
| `registration_confirmed` | Inscripción confirmada | no |
| `ticket_confirmation` | Compra de entrada | no (crítico) |
| `event_announcement` | Manual, desde el panel | sí |
| `event_reminder` | Manual, desde el panel | sí |
| `admin_notification` | Alertas operativas | no |
| `export_ready` | Exportación lista | no |

`GET /api/emails/catalog` muestra, por tipo, si sale por template de Brevo o por fallback HTML.

`admin_notification` y `export_ready` existen y funcionan, pero todavía no los dispara ningún
flujo: solo salen a mano por `POST /api/emails/send`.

## Verificación de email

No bloqueante. La cuenta se usa desde el minuto cero; lo que se bloquea es **afiliarse e
inscribirse** (`assertEmailVerified` en `routes/athletes.js`), que son las dos acciones que
terminan en un pago. Un typo en la dirección ahí deja al atleta sin comprobante y sin forma de
reclamar.

- Registro → manda `welcome` + `email_verification` (dos emails: el segundo tiene una sola acción
  y se perdería mezclado en el primero).
- El link es `/?verificar=<token>`, con token HMAC de 7 días, resuelto por
  `EmailVerificationNotice.jsx`.
- Reenvío: `POST /api/athletes/me/resend-verification`.
- A diferencia del reset de contraseña, **no se persiste el hash del token**: reabrir el link
  sobre una cuenta ya verificada es idempotente y no otorga ninguna credencial. El `typ` del
  payload impide cruzar un token de reset con uno de verificación aunque compartan `AUTH_SECRET`.
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

## Idempotencia

Toda salida lleva `idempotency_key`, con índice único en `transactional_email_logs`. Un reintento
del webhook de Mercado Pago no puede generar un segundo comprobante. Las claves se anclan al
identificador externo estable, no al de la orden:

```
email:payment-receipt:<externalPaymentId>
email:membership-renewal:<notificationId>   # incluye el umbral: expires_in_30, expired
email:event_announcement:<eventId>:<athleteId>
```

## Reintentos

`brevoAdapter` clasifica cada fallo en `retryable` (429, 5xx, red) o permanente (400, 401,
`invalid_parameter`, `document_not_found`). Un fallo transitorio queda en `retrying` con
`next_retry_at`; el backoff es **2 min, 10 min, 1 h, 6 h, 24 h** y después `failed`.

`claim_retryable_emails` reserva el lote con `for update skip locked`, así que dos instancias no
mandan el mismo email. También rescata filas colgadas en `processing` hace más de 15 minutos
(instancia que murió a mitad de envío).

> **Limitación en Vercel Hobby**: los cron jobs admiten una sola corrida diaria (contrato
> verificado en `tests/deploymentConfig.test.js`), así que el backoff colapsa a un intento por
> día. El primer envío sigue siendo inmediato; solo se demora la recuperación de un fallo
> transitorio. Con proceso residente o Vercel Pro (cron horario) el backoff se respeta.

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

## Política de supresión

| Motivo | Frena |
|---|---|
| `hard_bounce`, `spam`, `blocked`, `invalid` | **Todo**, incluso los críticos. La dirección no existe o nos denunció; insistir daña la reputación del dominio. |
| `unsubscribed` | Solo los tipos con `optOutAllowed` (avisos de evento, renovación). Nadie deja de recibir su comprobante de pago por haber cortado los anuncios. |

## Seguridad

- `BREVO_API_KEY` vive **solo** en el servidor. El frontend no habla con Brevo; pide envíos a
  `/api/emails`. `tests/env.test.js` verifica que no reaparezca `VITE_BREVO_API_KEY`.
- Los tipos de cuenta (`welcome`, `password_reset`, `security_access`) **no** se pueden disparar
  desde `POST /api/emails/send`: permitir un `password_reset` a mano sería una vía de phishing
  con nuestro propio remitente verificado.
- Los params se escapan al renderizar el HTML y las URLs se validan por protocolo
  (`javascript:` y `data:` se descartan).

## Variables de entorno

Ver el bloque "Brevo" de `.env.example`. Mínimo para enviar de verdad: `BREVO_API_KEY` y
`BREVO_SENDER_EMAIL` (dominio verificado en Brevo). Todo lo demás es opcional.

## Referencias

- [Brevo — Send transactional email](https://developers.brevo.com/reference/sendtransacemail)
- [Brevo — Webhooks](https://developers.brevo.com/docs/transactional-webhooks)
- [Brevo — Error codes](https://developers.brevo.com/docs/error-codes)
