# Modelo de datos - PLU ARG / Maximal

Base principal: **PostgreSQL** con **Prisma ORM**. El schema canonico vive en
[`prisma/schema.prisma`](../prisma/schema.prisma).

## Objetivo

Dejar una base normalizada, segura y consultable para crecer sin duplicar datos
sensibles ni mezclar preferencias de usuario con el core transaccional.

## Principios

- Tablas transaccionales normalizadas: usuarios, atletas, afiliaciones, eventos,
  inscripciones, ordenes de pago, pagos, resultados, exports, emails y auditoria.
- Identidad separada de perfil: `User`, `UserIdentity` y `UserProfile` permiten
  auth local, Auth0 u otros proveedores sin duplicar usuarios.
- Datos personales de atletas separados de documentos: `AthleteDocument` evita
  acoplar DNI/pasaporte al registro principal y permite nuevos tipos.
- Pagos modelados en dos etapas: `PaymentOrder` representa la intencion de cobro
  y `Payment` la confirmacion del proveedor. `PaymentAllocation` permite asignar
  un pago a afiliacion, inscripcion o ambos.
- Preferencias de usuario aisladas: `UserPreference`, `UserSavedView`,
  `UserTablePreference`, `UserNotificationPreference` y `UserRecentEntity` no
  contaminan las tablas operativas.
- Auditoria append-only en `AuditLog` para operaciones sensibles.
- Nunca confirmar pagos desde frontend. La confirmacion debe entrar por backend,
  webhook o proceso administrativo autorizado.

## Entidades principales

| Modelo | Proposito |
|--------|-----------|
| `User` | Cuenta interna, RBAC y estado operativo. |
| `UserIdentity` | Identidad externa/local por proveedor, por ejemplo Auth0. |
| `UserProfile` | Datos editables del operador/admin. |
| `Session` | Sesiones server-side con `tokenHash`, expiracion y revocacion. |
| `Athlete` | Persona competidora o afiliada. |
| `AthleteDocument` | Documento normalizado y unico por tipo/numero. |
| `Membership` | Afiliacion anual por atleta. |
| `Event` | Competencia, meet o actividad. |
| `EventRegistration` | Inscripcion del atleta a un evento. |
| `PaymentOrder` | Orden interna previa a Mercado Pago/manual/mock. |
| `Payment` | Cobro confirmado o rechazado por proveedor. |
| `PaymentAllocation` | Asignacion contable del pago a afiliacion/inscripcion. |
| `LiftingResult` | Resultados importados desde LiftingCast u otra fuente. |
| `IntegrationEvent` | Evento externo idempotente recibido o emitido. |
| `IntegrationAttempt` | Intento de procesamiento/envio asociado a un evento externo. |
| `ExportJob` | Jobs de exportacion CSV/XLSX. |
| `EmailLog` | Trazabilidad de emails transaccionales. |
| `AuditLog` | Cambios sensibles con actor y entidad afectada. |

## Personalizacion

La personalizacion queda por usuario y fuera del modelo transaccional:

| Modelo | Uso |
|--------|-----|
| `UserPreference` | Locale, timezone, tema, densidad y settings generales. |
| `UserSavedView` | Filtros y ordenamientos guardados por scope. |
| `UserTablePreference` | Columnas visibles, orden, paginacion y sort por tabla. |
| `UserNotificationPreference` | Canales y topics habilitados/deshabilitados. |
| `UserRecentEntity` | Entidades vistas recientemente para acceso rapido. |

Esto permite una UI eficiente sin agregar columnas de preferencias en atletas,
eventos, pagos o inscripciones.

## Normalizacion clave

- `Athlete` no guarda documento principal como string plano; lo delega a
  `AthleteDocument` con `@@unique([documentType, documentNumber])`.
- `Membership` tiene `@@unique([athleteId, year])`, asi un atleta no puede tener
  dos afiliaciones para el mismo anio.
- `EventRegistration` tiene `@@unique([eventId, athleteId])`, asi no hay doble
  inscripcion al mismo evento.
- `PaymentOrder` y `Payment` se separan para no depender del estado externo del
  proveedor al crear la operacion interna.
- `PaymentAllocation` evita campos duplicados como `membershipPaidAmount` o
  `registrationPaidAmount` dentro de multiples tablas.
- `UserIdentity` permite varios proveedores por usuario sin duplicar cuentas.
- `IntegrationEvent` centraliza webhooks, preferencias de pago, emails e imports
  con `idempotencyKey`, `externalId`, payload crudo y resultado procesado.

## Indices para consultas futuras

Indices relevantes definidos en Prisma:

- `User`: `@@index([role, status])` para listados de operadores por permiso.
- `Athlete`: `@@index([lastName, firstName])`, `@@index([email])`,
  `@@index([status])`.
- `Membership`: `@@index([athleteId, status])`, `@@unique([athleteId, year])`.
- `Event`: `@@index([status, eventDate])`, `@@index([eventDate])`.
- `EventRegistration`: `@@index([athleteId, status])`,
  `@@index([eventId, status])`, `@@unique([eventId, athleteId])`.
- `PaymentOrder`: `@@index([athleteId, status])`,
  `@@index([provider, status])`, `@@index([providerPreferenceId])`.
- `Payment`: `@@index([orderId])`, `@@index([athleteId, status])`,
  `@@index([provider, status])`.
- `IntegrationEvent`: `@@unique([provider, externalId])`,
  `@@index([provider, type, status])`, `@@index([entityType, entityId])`.
- `IntegrationAttempt`: `@@index([integrationEventId])`,
  `@@index([status, createdAt])`.
- `LiftingResult`: `@@index([eventId])`, `@@index([athleteId])`,
  `@@index([eventId, division, category])`.
- `AuditLog`: `@@index([actorId])`, `@@index([entityType, entityId])`,
  `@@index([action])`.
- `ExportJob`: `@@index([type, status])`.

## Consultas que el modelo optimiza

- Perfil completo de atleta:
  `Athlete -> AthleteDocument -> Membership -> EventRegistration -> Payment`.
- Panel de evento:
  `Event -> EventRegistration -> Athlete -> Membership`.
- Estado de deuda/cobro:
  `PaymentOrder -> Payment -> PaymentAllocation -> Membership/EventRegistration`.
- Auditoria de entidad:
  `AuditLog` por `entityType + entityId`.
- Eventos externos de una entidad:
  `IntegrationEvent` por `entityType + entityId`, proveedor, tipo y estado.
- Dashboard administrativo:
  `Membership` por estado, `Event` por fecha/estado, `PaymentOrder` por estado.
- Experiencia personalizada:
  preferencias y vistas guardadas por `userId` sin joins sobre tablas de negocio.

## Estados de negocio

### Membership

`pendiente_pago -> activa -> vencida | cancelada | reembolsada`

### EventRegistration

`borrador -> pendiente_pago -> pagada -> confirmada | observada | cancelada`

### Payment / PaymentOrder

`creado -> pendiente -> aprobado | rechazado | cancelado | reembolsado`

### Event

`draft -> published -> registration_open -> registration_closed -> finished | cancelled`

## Metadata Json

Usar `Json` solo para informacion flexible que no se consulte como columna
principal:

- `PaymentOrder.metadata`: idempotencia, contexto de checkout, concepto extendido.
- `Payment.rawPayload`: payload crudo del proveedor.
- `IntegrationEvent.payload`: webhook, request o fila importada original.
- `IntegrationEvent.result`: respuesta normalizada procesada por el workflow.
- `IntegrationAttempt.requestPayload/responsePayload`: request/response por retry.
- `LiftingResult.rawPayload`: fila original importada.
- `ExportJob.filters` y `ExportJob.metadata`: parametros del reporte.
- `EmailLog.payload` y `EmailLog.providerResponse`: template y respuesta Brevo.
- `AuditLog.before/after/metadata`: snapshot y contexto de cambio.

Si un dato empieza a usarse para filtros frecuentes, debe convertirse en columna
tipada e indexable.

## Migraciones

Todavia no se aplico ninguna migracion contra base de datos. Antes de ejecutar
`prisma migrate dev` o una migracion productiva, revisar datos existentes y
definir estrategia de backfill para:

- Separar `firstName`/`lastName` si habia nombres completos.
- Crear `AthleteDocument` desde documentos existentes.
- Mapear roles viejos a `admin_maximal`, `admin_plu_arg`,
  `operador_plu_arg` o `viewer_plu_usa`.
- Reconciliar pagos existentes con `PaymentOrder`, `Payment` y
  `PaymentAllocation`.
- Persistir eventos en `IntegrationEvent` cuando se reemplace el store en memoria
  por repositorios Prisma.

## Validacion

Comandos esperados:

```powershell
npm.cmd test -- tests/prismaSchema.test.js
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/plu_arg?schema=public'; npx.cmd prisma validate
```
