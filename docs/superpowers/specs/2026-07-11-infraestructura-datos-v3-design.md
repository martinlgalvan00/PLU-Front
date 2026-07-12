# Infraestructura de datos v3 - Diseno

## Objetivo

Modelar PLU Front como una plataforma multi-organizacion, normalizada y eficiente
para Supabase/PostgreSQL. El modelo debe cubrir afiliaciones, eventos,
inscripciones, tickets, pagos, check-in, integraciones y auditoria sin depender
de `localStorage` como fuente de verdad.

## Decision principal

Usamos `Organization` como raiz operativa. Las tablas sensibles llevan
`organizationId` para que Supabase pueda aplicar RLS y resolver consultas por
indices compuestos sin joins innecesarios dentro de cada policy.

## Escritura normalizada

La escritura queda en tablas 1FN/2FN/3FN:

- `Person` guarda identidad humana global.
- `OrganizationAthlete` guarda el estado de esa persona dentro de una
  organizacion.
- `MembershipPlan`, `MembershipPeriod` y `Membership` separan catalogo, precio
  historico y afiliacion emitida.
- `Event`, `Venue`, `EventRegistrationWindow`, `EventScheduleItem`,
  `EventDivision`, `EventCategory` y `EventCapacityRule` separan datos propios
  del evento de sus reglas repetibles.
- `TicketType`, `TicketSaleWindow`, `TicketOrder` y `Ticket` separan catalogo,
  precio/cupo, compra y entrada emitida.
- `PaymentOrder`, `PaymentOrderItem`, `Payment` y `PaymentAllocation` unifican
  afiliaciones, inscripciones, tickets y combos.

## Lectura eficiente

El frontend no debe armar dashboards con joins grandes sobre todas las tablas.
Supabase debe exponer vistas/RPCs:

- calendario publico,
- resumen administrativo de evento,
- padron de afiliados,
- resumen de ventas,
- conciliacion de pagos,
- actividad de check-in.

Si el volumen crece, esas vistas pueden pasar a materialized views sin cambiar
el modelo de escritura.

## Seguridad

Las policies deben basarse en `OrganizationMember` activo. Las mutaciones
sensibles como acreditar pagos, emitir tickets, activar afiliaciones y registrar
check-in deben pasar por backend o RPC transaccional, nunca por actualizaciones
directas desde componentes React.

## Migracion

La migracion debe hacerse por fases:

1. Crear tablas nuevas multi-organizacion.
2. Seedear `Organization` inicial para PLU ARG/Maximal.
3. Migrar atletas a `Person` + `OrganizationAthlete`.
4. Migrar afiliaciones a `MembershipPlan` + `MembershipPeriod` + `Membership`.
5. Migrar eventos/tickets a los catalogos nuevos.
6. Conectar pagos a `PaymentOrderItem` y `PaymentAllocation`.
7. Activar vistas/RPCs/RLS.

No se debe borrar informacion historica sin backfill verificable.
