# Modelo de datos — PLU ARG / Maximal

Base principal: **PostgreSQL** con **Prisma ORM**.  
Metadata flexible en campos **Json** (equivalente JSONB).

## Principios

- Relaciones explícitas entre usuarios, atletas, afiliaciones, eventos, inscripciones y pagos.
- Transacciones para activación post-pago.
- Auditoría append-only en `AuditLog`.
- Nunca confirmar pagos desde frontend.

## Entidades (target)

| Modelo | Propósito |
|--------|-----------|
| `User` | Operadores admin, auth, RBAC |
| `Athlete` | Base central de miembros/atletas |
| `Membership` | Afiliación anual con vencimiento |
| `Event` | Calendario competitivo |
| `EventRegistration` | Inscripción a meet |
| `PaymentOrder` | Orden interna previa a MP |
| `Payment` | Confirmación de cobro |
| `LiftingResult` | Resultados importados/publicados |
| `Export` | Jobs de exportación CSV/XLSX |
| `EmailLog` | Trazabilidad Brevo |
| `AuditLog` | Cambios sensibles |

## Estados de negocio

### Membership

`pendiente_pago` → `activa` → `vencida` | `cancelada` | `reembolsada`

### EventRegistration

`borrador` → `pendiente_pago` → `pagada` → `confirmada` | `observada` | `cancelada`

### Payment

`creado` → `pendiente` → `aprobado` | `rechazado` | `cancelado` | `reembolsado`

### Event (público)

`draft` → `published` → `registration_open` → `registration_closed` → `finished` | `cancelled`

## JSONB / Json (metadata)

Usar en:

- `PaymentOrder.metadata` — preferencia MP, concepto, idempotency
- `Payment` — payload crudo webhook
- `LiftingResult.rawData` — fila LiftingCast original
- `Export.filters` — filtros de reporte
- `EmailLog.params` — variables de template

## Implementación actual

Schema en [`prisma/schema.prisma`](../prisma/schema.prisma).  
**Gap vs target:** falta migración aplicada, campos extendidos de `LiftingResult`, `PaymentOrder.type`, relación membership en registration, y seed.

## Próxima migración sugerida

1. Agregar `PaymentOrderType` enum y `orderType` en `PaymentOrder`.
2. Extender `LiftingResult` con lifts individuales y `athleteId`.
3. Agregar `membershipId` en `EventRegistration`.
4. Agregar `EventStatus` enum.
5. `User.status` y normalizar roles a `ADMIN | OPERATOR | PLU_USA_READONLY` (mapear capa API).

Ver skill `agent-skills/database-modeling/SKILL.md`.
