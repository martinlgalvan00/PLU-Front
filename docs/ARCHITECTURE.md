# Arquitectura — PLU ARG / Maximal

## Stack

- **Frontend:** Vite 8 + React 19 + CSS modular
- **API:** Express 5 (scaffold en `server/`)
- **DB:** PostgreSQL 16 + Prisma
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
| Persistencia | localStorage | PostgreSQL/Supabase normalizado vía API/RPC |
| Auth | Selector de rol UI | Login + JWT/sesión |
| Pagos | Bricks embebido + persistencia Supabase | Validación sandbox y operación productiva |
| Emails | Mock console | Brevo templates |

## Infraestructura de datos v3

El modelo objetivo es multi-organización. `Organization` es la raíz operativa y
las entidades sensibles (`Event`, `Membership`, `TicketOrder`, `PaymentOrder`,
`AuditLog`, integraciones, etc.) llevan `organizationId` para consultas rápidas,
RLS y auditoría.

La escritura queda normalizada en Prisma/PostgreSQL. Para extracción eficiente en
Supabase, el frontend debe consumir vistas/RPCs de lectura como resumen de
eventos, padrón de afiliados, ventas de tickets, conciliación de pagos y
actividad de check-in.

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
| Notificaciones | `server/modules/notifications/notificationWorkflow.js` |
| Controllers | `server/routes/payments.js`, `server/routes/emails.js` |
| Contrato de DB | `prisma/schema.prisma` + `supabase/migrations/20260715000200_*` a `20260715000400_*` |

El checkout crea la orden primero. El navegador tokeniza el medio de pago con
MercadoPago.js, pero el backend vuelve a leer monto, moneda, concepto y referencia
desde la orden. El resultado inmediato se aplica de forma idempotente y el webhook
firmado actúa como confirmación canónica y mecanismo de recuperación.

Para cobros únicos se usa `Payment Brick`. Para planes mensuales o anuales
recurrentes se usa `Card Payment Brick`, que entrega el token efímero requerido
para autorizar una suscripción. PLU no almacena números de tarjeta ni tokens.
