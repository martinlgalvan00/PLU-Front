# Brevo — Emails transaccionales

## Objetivo

Enviar los emails transaccionales de PLU ARG vía **Brevo API** (`POST /v3/smtp/email`), con
catálogo central, idempotencia, reintentos, lista de supresión y fallback HTML propio.

Documentación completa del flujo: [`docs/EMAIL_FLOW.md`](../../docs/EMAIL_FLOW.md).

## Cuándo usarla

- Agregar o modificar un email del sistema.
- Cargar templates de Brevo y mapearlos.
- Depurar emails que no llegan, se duplican o rebotan.
- Configurar el webhook de entrega.

## Regla de oro

**Todo email sale por `emailDispatcher.send(type, input)`.** No llamar `brevoAdapter` directo
desde una ruta o un workflow: se pierde idempotencia, log, supresión y reintento. Ese fue
exactamente el problema que tenía el repo antes (cinco caminos de envío distintos, dos de ellos
sin dejar rastro en la base).

## Agregar un email nuevo

Dos archivos, nada más:

**1. `server/modules/notifications/emailCatalog.js`** — declarar la entrada:

```javascript
mi_email_nuevo: {
  category: EMAIL_CATEGORIES.event,      // account | membership | billing | event | ops
  templateEnv: 'BREVO_TEMPLATE_MI_EMAIL_NUEVO',
  subject: 'Asunto del fallback HTML',
  entityType: 'event',                    // ancla del log para auditoría
  requiredParams: ['name', 'eventTitle'], // se validan antes de llamar a Brevo
  optOutAllowed: false,                   // true = el usuario puede desuscribirse
  critical: false,                        // true = ignora la supresión por desuscripción
},
```

**2. `server/modules/notifications/emailTemplates.js`** — agregar el cuerpo en `BODIES`:

```javascript
mi_email_nuevo: (p) => ({
  title: 'Título visible',
  preheader: 'Texto de vista previa en la bandeja.',
  body: [
    paragraph(`${greeting(p.name)} cuerpo del mensaje.`),
    dataPanel([['Evento', p.eventTitle]]),
    button(p.eventUrl, 'Ver el evento'),
  ].join(''),
}),
```

**3.** Agregar `BREVO_TEMPLATE_MI_EMAIL_NUEVO=` a `.env.example` (vacío: es opcional).

El test `tests/emailInfrastructure.test.js` verifica que todo tipo del catálogo tenga fallback,
así que si falta el paso 2 la suite falla.

## Disparar el envío

```javascript
import { createEmailDispatcher } from '../modules/notifications/emailDispatcher.js'

const dispatcher = createEmailDispatcher({ repository, brevo, env })

await dispatcher.send('mi_email_nuevo', {
  to: athlete.email,
  toName: athlete.full_name,
  entityId: event.id,
  idempotencyKey: `email:mi-email:${event.id}:${athlete.id}`, // opcional, hay default
  params: { name: athlete.full_name, eventTitle: event.title },
})
```

**Siempre best-effort.** La operación de negocio se confirma primero; el envío se envuelve en
try/catch (o `Promise.allSettled` si son varios) y nunca revierte nada.

## Templates de Brevo

En Brevo Dashboard → Transactional → Templates. Los `params` se leen como `{{ params.name }}`.
Copiar el ID numérico a la variable `BREVO_TEMPLATE_*` correspondiente.

Sin template cargado el email **igual sale**, con el HTML del repo. Cargar el template lo
convierte automáticamente en la versión que se envía, sin tocar código.

Estado de cada tipo: `GET /api/emails/catalog`.

## Webhook de entrega

`POST /api/emails/webhook/brevo?token=<BREVO_WEBHOOK_TOKEN>`

Configurar en Brevo → Transactional → Settings → Webhooks. Eventos a habilitar: `delivered`,
`hard_bounce`, `soft_bounce`, `blocked`, `spam`, `invalid_email`, `unsubscribed`.

Sin webhook el sistema funciona, pero no hay visibilidad de rebotes ni supresión automática.

## Diagnóstico

| Síntoma | Dónde mirar |
|---|---|
| No llega ningún email | `GET /api/emails/catalog` → `configured: false` = falta `BREVO_API_KEY` o `BREVO_SENDER_EMAIL` |
| Un tipo no llega | `GET /api/emails/logs?type=<tipo>` → `status` |
| `status: skipped` | Brevo sin configurar, o el tipo no tiene template ni fallback |
| `status: suppressed` | El destinatario está en `email_suppressions` |
| `status: retrying` | Fallo transitorio, lo levanta `emailDispatchJob` |
| `status: failed` | Error permanente: mirar `error` y `error_code` |
| `status: bounced` | Rebotó. La dirección quedó suprimida |
| Se envía duplicado | La `idempotencyKey` está variando entre llamadas; anclarla a un ID externo estable |

## Errores comunes

| Error | Causa | Fix |
|---|---|---|
| Remitente no verificado | Dominio sin validar en Brevo | Verificar dominio en el dashboard |
| `document_not_found` | Template ID inexistente | Revisar el ID en el dashboard |
| Campos vacíos en el email | Nombres de `params` que no matchean el template | Alinear con `requiredParams` del catálogo |
| El email revierte el pago | Falta el try/catch | Envolver best-effort |
| Reintentos lentos en producción | Vercel Hobby = un cron diario | Ver la nota de limitación en `docs/EMAIL_FLOW.md` |

## Validaciones que ya están cubiertas

- Formato del destinatario y params obligatorios, antes de gastar una llamada.
- Escapado de HTML en todos los params y validación de protocolo en las URLs.
- API key solo en el servidor (`tests/env.test.js` verifica que no vuelva `VITE_BREVO_API_KEY`).
- Los tipos de cuenta no se pueden disparar desde `POST /api/emails/send`.

## Checklist de aceptación

- [ ] El tipo nuevo está en `emailCatalog.js` y tiene cuerpo en `emailTemplates.js`
- [ ] `BREVO_TEMPLATE_*` agregado a `.env.example`
- [ ] El llamador lo invoca best-effort, sin poder revertir la operación de negocio
- [ ] La `idempotencyKey` se ancla a un identificador externo estable
- [ ] `npm run lint` y la suite de tests en verde

## Referencias oficiales

- [Brevo — Send transactional email](https://developers.brevo.com/reference/sendtransacemail)
- [Brevo — Transactional webhooks](https://developers.brevo.com/docs/transactional-webhooks)
- [Brevo — Error codes](https://developers.brevo.com/docs/error-codes)
