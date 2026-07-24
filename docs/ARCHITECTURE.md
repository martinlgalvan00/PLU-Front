# Arquitectura — PLU ARG / Maximal

## Stack

- **Frontend:** Vite 8 + React 19 + CSS modular
- **API:** Express 5 en una única Vercel Function (`api/index.js`)
- **DB:** Supabase PostgreSQL: `plu_prisma` para identidad staff y `public` para dominios transaccionales
- **Pagos:** Mercado Pago Checkout Bricks (`Payment Brick` y `Card Payment Brick`) + Suscripciones
- **Emails:** Brevo API (adaptador en `src/services/emailService.js`)
- **Tests:** Vitest

## Capas

```
┌─────────────────────────────────────┐
│  pages/ + components/  (UI pura)    │
├─────────────────────────────────────┤
│  hooks/  (estado React)             │
├─────────────────────────────────────┤
│  services/  (negocio + adaptadores)│
├─────────────────────────────────────┤
│  lib/  (constantes, roles, utils)   │
└─────────────────────────────────────┘
         │                    │
         ▼                    ▼
   localStorage          server/ API
   (MVP demo)           + PostgreSQL
```

## Regla de oro

**La lógica de negocio vive en `services/`, no en componentes React.**

Los componentes solo renderizan y delegan eventos.

## MVP actual vs. target

| Capa | MVP actual | Target |
|------|------------|--------|
| Persistencia | Supabase detrás de Express | Multi-organización completa |
| Auth | Cookie HTTP-only staff/atleta + Auth0 opcional | SSO institucional completo |
| Pagos | Bricks embebido + persistencia Supabase | Validación sandbox y operación productiva |
| Emails | Mock console | Brevo templates |

## Infraestructura de datos v3

El modelo objetivo es multi-organización. `Organization` es la raíz operativa y
las entidades sensibles (`Event`, `Membership`, `TicketOrder`, `PaymentOrder`,
`AuditLog`, integraciones, etc.) llevan `organizationId` para consultas rápidas,
RLS y auditoría.

El navegador no escribe tablas ni RPC sensibles. Express valida la sesión y el
rol, y usa `service_role` para ejecutar RPCs atómicas en Supabase. Prisma queda
acotado a usuarios, roles y sesiones del staff dentro del schema `plu_prisma`
de la misma base alojada. Las verificaciones QR públicas
exponen una proyección mínima sin DNI ni datos de pago.

## Runtime y entornos

Vite y Express se publican juntos. El frontend consume rutas relativas `/api`,
por lo que no necesita una URL de backend distinta ni CORS entre servicios.
Vercel concentra todo Express en una sola Function y conserva una URL estable
por rama:

- `main`: Production, dominio oficial y Supabase PROD.
- `dev`: Preview de rama, URL estable de aceptación y Supabase DEV.

El código es el mismo en ambos entornos; los datos y secretos no se comparten.
Las variables del sistema de Vercel resuelven automáticamente `APP_URL` y
`API_URL`. `SUPABASE_DATABASE_URL` se transforma en el datasource Prisma del
schema `plu_prisma` en runtime.

Las tareas que sólo modifican PostgreSQL (vencimiento de afiliaciones, reservas
y órdenes) corren con `pg_cron` dentro de Supabase. Las tareas que llaman
servicios externos se exponen como endpoints internos protegidos por
`CRON_SECRET`; no usan `setInterval` en la Function serverless.

## Integraciones

Todas las integraciones externas usan adaptadores inyectables. En producción, si faltan
credenciales la API falla de forma explícita; los mocks se reservan para tests y demo aislada.

## Flujo server-side de integraciones

Las integraciones no se procesan como llamadas sueltas desde la UI. El backend
las registra como eventos idempotentes y las conecta con entidades del dominio:

```
UI / proveedor externo
  -> API route
  -> workflow de aplicacion
  -> intento/evento idempotente persistido
  -> entidad de negocio
  -> adapter externo
```

Componentes actuales:

| Capa | Archivos |
|------|----------|
| Store de eventos | `payment_integration_events`, `embedded_payment_attempts` (Supabase) |
| Pagos | `server/modules/payments/paymentWorkflow.js`, `embeddedPaymentWorkflow.js` |
| Suscripciones | `server/modules/subscriptions/subscriptionWorkflow.js` |
| Recuperación | `server/modules/payments/paymentRecoveryWorkflow.js`, `server/jobs/paymentRecoveryJob.js` |
| Notificaciones | `server/modules/notifications/notificationWorkflow.js` |
| Controllers | `server/routes/payments.js`, `server/routes/emails.js` |
| Contrato de DB | `prisma/schema.prisma` + migraciones versionadas en `supabase/migrations/` hasta `20260724000000_*` |

El checkout crea la orden primero. El navegador tokeniza el medio de pago con
MercadoPago.js, pero el backend vuelve a leer monto, moneda, concepto y referencia
desde la orden. El resultado inmediato se aplica de forma idempotente y el webhook
firmado actúa como confirmación canónica y mecanismo de recuperación.

Para cobros únicos se usa `Payment Brick`. Para planes mensuales o anuales
recurrentes se usa `Card Payment Brick`, que entrega el token efímero requerido
para autorizar una suscripción. PLU no almacena números de tarjeta ni tokens.

## Recuperación y operación de pagos

El webhook se guarda primero como inbox durable y después se reclama con lock.
Si Mercado Pago, Supabase o la API fallan, el evento pasa a `failed` con backoff
exponencial. `paymentRecoveryJob` recupera eventos vencidos y reconcilia contra
el recurso canónico de Mercado Pago. `FOR UPDATE SKIP LOCKED` permite ejecutar
varias instancias sin procesar dos veces el mismo trabajo.

Los intentos del Brick distinguen pagos de suscripciones. Sólo los pagos se
reconcilian con `/v1/payments/{id}`; las suscripciones se recuperan mediante sus
eventos `subscription_preapproval` y `subscription_authorized_payment`.

El panel Finanzas consume endpoints protegidos por rol para mostrar fallas,
reintentos, conciliaciones pendientes y suscripciones en mora. Un operador
autorizado puede ejecutar una recuperación general o reintentar un evento
puntual sin modificar directamente estados de negocio.

El estado de una orden se deriva del ledger completo de intentos y no del orden
de llegada de los webhooks. Las RPC de aplicación bloquean la orden, validan
monto, moneda y referencia, rechazan la reutilización cross-order del payment ID
y aplican en la misma transacción el pago y el derecho asociado.

La identidad externa de un pago se registra además en
`payment_provider_registry`, única para ambos ledgers (`athlete_payments` y
`ticket_payments`). Las suscripciones guardan un snapshot económico inmutable
del plan y se preparan con una RPC atómica que bloquea orden, plan, afiliación y
suscripción. El primer cobro recurrente consume la orden y el ciclo reservados;
los siguientes crean una orden por ciclo, sin duplicar vigencia.
