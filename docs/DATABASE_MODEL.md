# Modelo de datos - infraestructura v3

Base principal: **PostgreSQL/Supabase** con **Prisma** como contrato de schema.
El archivo canonico es [`prisma/schema.prisma`](../prisma/schema.prisma).

## Principios

- Multi-organizacion desde la base: toda entidad operativa importante tiene
  `organizationId` para consultas, RLS y auditoria.
- Escritura normalizada en 1FN, 2FN y 3FN: sin arrays en columnas consultables,
  sin precios historicos duplicados y sin estados de afiliado dentro de la
  persona global.
- Lectura eficiente por vistas/RPCs: el frontend no deberia resolver joins
  grandes para dashboards, calendario, finanzas o check-in.
- JSON queda reservado para payloads externos, snapshots y metadata flexible,
  no para campos que se filtran, agrupan o ordenan seguido.
- Pagos server-side: Mercado Pago confirma por backend/webhook; el frontend no
  acredita afiliaciones, tickets ni inscripciones.

## Raiz multi-organizacion

| Modelo | Proposito |
|--------|-----------|
| `Organization` | Tenant operativo: PLU ARG, Maximal u organizaciones futuras. |
| `OrganizationMember` | Usuario, rol y estado dentro de una organizacion. |
| `User`, `Session`, `UserIdentity`, `UserProfile` | Identidad, sesion y perfil del operador. |

`organizationId` se replica en tablas operativas aunque pueda derivarse por join.
Es una desnormalizacion controlada para que Supabase RLS y los indices compuestos
sean simples y rapidos.

## Personas, atletas y afiliaciones

| Modelo | Proposito |
|--------|-----------|
| `Person` | Persona global reutilizable entre organizaciones. |
| `PersonDocument` | Documento unico por tipo y numero. |
| `OrganizationAthlete` | Estado deportivo de una persona dentro de una organizacion. |
| `MembershipPlan` | Catalogo de planes de afiliacion. |
| `MembershipPeriod` | Precio, moneda y vigencia de un plan para un periodo/anio. |
| `Membership` | Afiliacion emitida para una persona y periodo concreto. |

Esto evita duplicar atletas cuando compiten en mas de una organizacion, pero
mantiene el estado de afiliacion aislado por organizacion.

## Eventos, inscripciones y resultados

| Modelo | Proposito |
|--------|-----------|
| `Venue` | Sede normalizada reutilizable. |
| `Event` | Evento operativo con fechas, visibilidad y ciclo de vida. |
| `EventRegistrationWindow` | Ventanas de inscripcion con precio propio. |
| `EventScheduleItem` | Cronograma: pesaje, competencia, premiacion, etc. |
| `EventDivision`, `EventCategory` | Catalogos habilitados por evento. |
| `EventCapacityRule` | Cupos por evento, dia, categoria, division o ticket. |
| `EventRegistration` | Inscripcion deportiva de una persona a un evento. |
| `LiftingResult` | Resultado importado y reconciliable con `Person`. |

## Tickets y check-in

| Modelo | Proposito |
|--------|-----------|
| `TicketType` | Tipo estable: general, VIP, staff, ambos dias, etc. |
| `TicketSaleWindow` | Precio/cupo/ventana de venta por tipo de ticket. |
| `TicketOrder` | Compra de tickets asociada a una orden de pago. |
| `Ticket` | Entrada individual con QR opaco. |
| `TicketAddon`, `TicketAddonOption` | Beneficios comprables/canjeables. |
| `TicketAddonSelection`, `TicketAddonRedemption` | Seleccion y canje trazable. |
| `CheckIn` | Ingreso unico de ticket o inscripcion. |

Los add-ons dejaron de vivir en JSON para poder consultar ventas y canjes por
beneficio, evento y organizacion.

## Pagos e integraciones

| Modelo | Proposito |
|--------|-----------|
| `PaymentOrder` | Intencion de cobro unificada. |
| `PaymentOrderItem` | Lineas de carrito: afiliacion, inscripcion, ticket, add-on. |
| `Payment` | Confirmacion del proveedor. |
| `PaymentAllocation` | Asignacion del pago a afiliacion, inscripcion o ticket order. |
| `IntegrationEvent`, `IntegrationAttempt` | Entrada idempotente de proveedores. |
| `OutboxEvent` | Efectos externos confiables: emails, webhooks, tareas. |
| `AuditLog` | Auditoria transversal por organizacion, entidad y actor. |

`PaymentOrderItem` modela el carrito real. `PaymentAllocation` conserva la
trazabilidad contable y permite combos sin duplicar campos de pago en cada
entidad de negocio.

## Indices principales

- `Event`: `@@unique([organizationId, slug])`,
  `@@index([organizationId, visibilityStatus, startsAt])`,
  `@@index([organizationId, lifecycleStatus, startsAt])`.
- `Membership`: `@@unique([organizationId, personId, membershipPeriodId])`,
  `@@index([organizationId, status, expiresAt])`.
- `EventRegistration`: `@@unique([eventId, personId])`,
  `@@index([eventId, status])`, `@@index([personId, status])`.
- `TicketType`: `@@unique([eventId, code])`.
- `Ticket`: `@@unique([organizationId, ticketCode])`, `@@unique([qrToken])`,
  `@@index([eventId, status])`, `@@index([ticketTypeId, status])`.
- `TicketOrder`: `@@index([organizationId, status, createdAt])`.
- `PaymentOrder`: `@@unique([idempotencyKey])`,
  `@@index([organizationId, status, createdAt])`.
- `Payment`: `@@unique([provider, externalPaymentId])`.
- `AuditLog`: `@@index([organizationId, entityType, entityId])`.

## Read models recomendados para Supabase

La escritura queda normalizada. Para extraccion eficiente conviene exponer:

- `public_events_view`: calendario publico por organizacion.
- `admin_event_overview`: evento, inscriptos, tickets vendidos, pagos pendientes.
- `membership_roster_view`: afiliados, vencimientos y ultimo estado de pago.
- `ticket_sales_summary`: ventas por evento, tipo y ventana.
- `payment_reconciliation_view`: ordenes, pagos, proveedor y asignaciones.
- `checkin_activity_view`: actividad por evento, puerta y horario.

Estas vistas deben construirse encima del modelo normalizado y, si el volumen lo
requiere, evolucionar a materialized views refrescadas por jobs.

## Validacion

Comandos esperados:

```powershell
npm.cmd test -- tests/prismaSchema.test.js
$env:DATABASE_URL='postgresql://plu:plu_dev@localhost:5432/plu_arg'; npx.cmd prisma validate
```
