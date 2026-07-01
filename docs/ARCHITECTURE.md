# Arquitectura — PLU ARG / Maximal

## Stack

- **Frontend:** Vite 8 + React 19 + CSS modular
- **API:** Express 5 (scaffold en `server/`)
- **DB:** PostgreSQL 16 + Prisma
- **Pagos:** Mercado Pago Checkout Pro (adaptador en `src/services/paymentService.js`)
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
| Persistencia | localStorage | PostgreSQL vía API |
| Auth | Selector de rol UI | Login + JWT/sesión |
| Pagos | Mock + simulación | MP Checkout Pro + webhook |
| Emails | Mock console | Brevo templates |

## Integraciones

Todas las integraciones externas usan adaptadores con fallback mock si faltan credenciales.

## Flujo server-side de integraciones

Las integraciones no se procesan como llamadas sueltas desde la UI. El backend
las registra como eventos idempotentes y las conecta con entidades del dominio:

```
UI / proveedor externo
  -> API route
  -> workflow de aplicacion
  -> IntegrationEvent
  -> entidad de negocio
  -> adapter externo
```

Componentes actuales:

| Capa | Archivos |
|------|----------|
| Store de eventos | `server/modules/integrations/integrationEventStore.js` |
| Pagos | `server/modules/payments/paymentWorkflow.js` |
| Notificaciones | `server/modules/notifications/notificationWorkflow.js` |
| Controllers | `server/routes/payments.js`, `server/routes/emails.js` |
| Contrato de DB | `prisma/schema.prisma` (`IntegrationEvent`, `IntegrationAttempt`) |

El store actual es en memoria para el MVP y tests. El contrato de entidades ya
esta modelado en Prisma para migrarlo a persistencia real sin cambiar la forma
en que los controllers llaman a los workflows.
