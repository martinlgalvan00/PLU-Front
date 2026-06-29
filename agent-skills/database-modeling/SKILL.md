# Database Modeling — Prisma / PostgreSQL

## Objetivo

Modelar, migrar y poblar la base de datos **PostgreSQL** de PLU ARG usando **Prisma**, alineada con las reglas de negocio y preparada para reemplazar el almacenamiento en `localStorage` del MVP.

## Cuándo usarla

- Agregar o modificar entidades en `prisma/schema.prisma`.
- Crear migraciones (`prisma migrate dev`).
- Escribir seeds de datos demo o producción inicial.
- Conectar `server/` a Prisma Client.
- Resolver inconsistencias entre datos demo y enums del schema.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| `DATABASE_URL` | Connection string en `.env` |
| Postgres running | `npm run db:up` |
| Schema Prisma | `prisma/schema.prisma` |
| Reglas de negocio | `docs/BUSINESS_RULES.md` |

## Salidas esperadas

- Schema válido con relaciones y enums coherentes.
- Migración aplicada en desarrollo.
- Cliente generado (`@prisma/client`).
- (Opcional) Seed ejecutable con `npm run db:seed`.
- Documentación actualizada si cambian entidades públicas.

## Procedimiento paso a paso

### 1. Levantar PostgreSQL

```powershell
npm run db:up
docker ps  # plu-arg-postgres healthy
```

Connection string default:

```
postgresql://plu:plu_dev@localhost:5432/plu_arg
```

### 2. Entidades del modelo

| Modelo | Propósito | Relaciones clave |
|--------|-----------|------------------|
| `User` | Operadores del panel | → `AuditLog` |
| `Athlete` | Atletas registrados | → Membership, Registration, Payment |
| `Membership` | Afiliación anual | → Athlete |
| `Event` | Eventos (Pitbull Classic, etc.) | → Registrations, LiftingResult |
| `EventRegistration` | Inscripción a evento | → Athlete, Event |
| `PaymentOrder` | Orden de cobro MP | → Payment[] |
| `Payment` | Pago individual | → Order, Athlete |
| `LiftingResult` | Resultados importados | → Event |
| `Export` | Registro de exportaciones | — |
| `AuditLog` | Trazabilidad | → User (actor) |
| `EmailLog` | Envíos Brevo | — |

### 3. Enums (contrato de estados)

```
UserRole: admin_maximal | admin_plu_arg | operador_plu_arg | viewer_plu_usa
AthleteStatus: pre_registrado | registrado | afiliado_activo | afiliado_vencido | bloqueado
MembershipStatus: pendiente_pago | activa | vencida | cancelada | reembolsada
RegistrationStatus: borrador | pendiente_pago | pagada | confirmada | observada | cancelada
PaymentStatus: creado | pendiente | aprobado | rechazado | cancelado | reembolsado
```

**Importante:** el MVP en frontend usa aliases en inglés en datos seed (`active`, `approved`). Al migrar a DB, normalizar a enums español o crear capa de mapeo en servicios.

### 4. Campos críticos y constraints

- `Athlete.documentId` — `@unique`
- `Athlete.email` — `@unique`
- `Membership.memberCode` — `@unique` (formato `PLU-ARG-YYYY-NNN`)
- `Event.slug` — `@unique` (ej. `pitbull-classic-2026`)
- `PaymentOrder.idempotencyKey` — `@unique` (evitar doble cobro)
- `PaymentOrder.externalRef` — `@unique`

### 5. Flujo de migración

```powershell
# Editar prisma/schema.prisma
npm run db:generate
npm run db:migrate
# Nombre descriptivo: add_email_log, etc.
```

**Reglas:**

- Nunca editar migraciones ya aplicadas en producción; crear nueva migración.
- Revisar SQL generado en `prisma/migrations/`.
- Commitear carpeta `migrations/` junto con cambios de schema.

### 6. Seeds (`prisma/seed.js`)

Cuando exista, debe poblar:

1. Usuario admin inicial (`admin_plu_arg`).
2. Evento `pitbull-classic-2026` con `requiresMembership: true`.
3. (Opcional) Atletas demo equivalentes a `athleteService.js` initial data.

```javascript
// prisma/seed.js — estructura esperada
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  await prisma.event.upsert({
    where: { slug: 'pitbull-classic-2026' },
    update: {},
    create: {
      slug: 'pitbull-classic-2026',
      title: 'Pitbull Classic',
      venue: 'Maximal Strength Club',
      location: 'Buenos Aires',
      eventDate: new Date('2026-08-15'),
      capacity: 120,
      status: 'published',
      requiresMembership: true,
    },
  })
}

main().finally(() => prisma.$disconnect())
```

Registrar en `package.json`: `"prisma": { "seed": "node prisma/seed.js" }`.

### 7. Integración con server (futuro)

```javascript
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

app.get('/api/athletes', async (req, res) => {
  const athletes = await prisma.athlete.findMany()
  res.json(athletes)
})
```

Reemplazar progresivamente `storageService.js` por repositorios Prisma.

## Validaciones

- `npx prisma validate` sin errores.
- `npm run db:migrate` aplica en DB limpia.
- Unicidad email/documento enforced a nivel DB.
- FKs con `onDelete` definido donde corresponda (evaluar `Restrict` vs `Cascade`).
- `prisma studio` (`npm run db:studio`) muestra datos coherentes post-seed.

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| P1001 Can't reach database | Postgres down | `npm run db:up` |
| Drift detected | Schema ≠ DB | `prisma migrate dev` o reset en dev |
| Enum mismatch | Frontend usa `active`, DB `activa` | Mapper en service layer |
| Seed duplica unique | Re-ejecutar seed | Usar `upsert` |
| Client outdated | Schema cambió sin generate | `npm run db:generate` |

## Checklist de aceptación

- [ ] Schema refleja todas las entidades del dominio MVP
- [ ] Enums alineados con `docs/BUSINESS_RULES.md`
- [ ] Migración creada y aplicada localmente
- [ ] Constraints de unicidad en email, documento, memberCode
- [ ] Seed idempotente (si existe)
- [ ] `package.json` scripts `db:*` funcionan
- [ ] Documentación de entidades en `docs/ARCHITECTURE.md` (si existe)

## Referencias oficiales

- [Prisma Schema Reference](https://www.prisma.io/docs/orm/reference/prisma-schema-reference)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [PostgreSQL 16 docs](https://www.postgresql.org/docs/16/)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `prisma/schema.prisma` | Modelo completo |
| `prisma/seed.js` | Datos iniciales (crear si falta) |
| `prisma/migrations/` | Historial SQL |
| `docker-compose.yml` | Postgres local |
| `.env.example` | `DATABASE_URL` |
| `package.json` | Scripts `db:*` |
| `src/services/storageService.js` | MVP localStorage (a reemplazar) |
| `server/index.js` | Futuro consumidor Prisma |
