# Flujo Logico de Aplicacion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el flujo central de PLU ARG de demo local a una capa logica backend-first, con atletas, afiliaciones, inscripciones, pagos, auditoria y panel admin funcionando contra PostgreSQL/Prisma.

**Architecture:** Express expone casos de uso del dominio y Prisma es la fuente de verdad. React deja de decidir estados sensibles y pasa a consumir APIs, manteniendo `localStorage` solo para preferencias visuales o modo demo explicitamente aislado. Los workflows quedan idempotentes y auditables, igual que el flujo de tickets ya implementado.

**Tech Stack:** React 19, Vite 8, Express 5, Prisma 6, PostgreSQL/Supabase Postgres, Zod, Vitest, cookies HTTP-only, workflows idempotentes.

---

## Current Findings

- `src/hooks/useAppData.js` todavia hidrata `athletes`, `memberships`, `registrations`, `payments`, `auditLogs`, `adminEvents` y `users` desde `localStorage`.
- `server/modules/ticketing/*` ya muestra el patron correcto: validacion API, workflow backend, transaccion Prisma y permisos server-side.
- `prisma/schema.prisma` ya contiene las entidades necesarias: `Athlete`, `AthleteDocument`, `Membership`, `EventRegistration`, `PaymentOrder`, `Payment`, `PaymentAllocation`, `AuditLog`, `IntegrationEvent`.
- `server/routes/payments.js` y `server/modules/payments/paymentWorkflow.js` existen, pero el workflow actual crea ordenes locales en memoria y no conecta aun con `PaymentOrder`, `Payment`, `Membership` ni `EventRegistration`.
- El frontend debe conservar la experiencia actual, pero cambiar progresivamente la fuente de verdad.

## Target File Structure

- Create: `server/modules/domain/domainMappers.js` for Prisma-to-UI DTO mapping.
- Create: `server/modules/domain/auditLogRepository.js` for central audit creation.
- Create: `server/modules/athletes/athleteSchemas.js` for Zod request schemas.
- Create: `server/modules/athletes/athleteRepository.js` for Prisma reads/writes.
- Create: `server/modules/athletes/athleteWorkflow.js` for public athlete registration and profile update.
- Create: `server/routes/athletes.js` for athlete profile/list/detail endpoints.
- Create: `server/modules/memberships/membershipWorkflow.js` for membership order creation and activation.
- Create: `server/routes/memberships.js` for membership endpoints.
- Create: `server/modules/registrations/registrationWorkflow.js` for event registration order creation and confirmation.
- Create: `server/routes/registrations.js` for registration endpoints.
- Modify: `server/modules/payments/paymentWorkflow.js` to persist `PaymentOrder`, `Payment`, allocations and idempotency in Prisma.
- Modify: `server/routes/payments.js` to accept Prisma deps and expose approval/webhook flows.
- Modify: `server/app.js` to mount new domain routes.
- Create: `src/services/domainApi.js` for frontend domain API calls.
- Modify: `src/hooks/useAppData.js` to load domain state from API and only fall back to demo state when API is unavailable in development.
- Modify: `src/services/athleteService.js` to retain pure helper functions only; remove canonical mutation ownership from browser code.
- Modify: `src/services/storageService.js` to make domain storage demo-only and documented.
- Create: `tests/domainMappers.test.js`.
- Create: `tests/api.athletes.test.js`.
- Create: `tests/api.memberships.test.js`.
- Create: `tests/api.registrations.test.js`.
- Create: `tests/api.domainPayments.test.js`.
- Modify: `tests/athleteService.test.js` to cover only pure frontend compatibility helpers.
- Modify: `docs/ARCHITECTURE.md`, `docs/BUSINESS_RULES.md`, `README.md`, and `docs/INFORME_AVANCE_PLU_ARG.md` after implementation.

## Phase Boundaries

This plan is split so each phase can ship independently:

1. Read-only domain API and mapping.
2. Athlete registration persisted in Prisma.
3. Membership and registration order creation persisted in Prisma.
4. Payment approval/webhook updates all related entities atomically.
5. Frontend switches from local mutation ownership to API ownership.
6. Demo/localStorage path is isolated and documented.

## Task 1: Domain DTO Mappers

**Files:**
- Create: `server/modules/domain/domainMappers.js`
- Create: `tests/domainMappers.test.js`

- [ ] **Step 1: Write mapper tests**

Create `tests/domainMappers.test.js`:

```javascript
import { describe, expect, it } from 'vitest'
import {
  mapAthleteDto,
  mapMembershipDto,
  mapPaymentDto,
  mapRegistrationDto,
} from '../server/modules/domain/domainMappers.js'

describe('domain mappers', () => {
  it('maps athlete with primary document to the UI contract', () => {
    const athlete = {
      id: 'ath-db-1',
      firstName: 'Martina',
      lastName: 'Rivas',
      birthDate: new Date('1997-04-18T00:00:00.000Z'),
      email: 'martina.rivas@example.com',
      phone: '+54 9 11 3000-1188',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'La Plata',
      gym: 'Maximal Power',
      competitiveSex: 'femenino',
      defaultDivision: 'Open',
      defaultCategory: 'Raw',
      estimatedBodyweightKg: '67.50',
      status: 'afiliado_activo',
      documents: [{ documentType: 'dni', documentNumber: '40111222', primary: true }],
    }

    expect(mapAthleteDto(athlete)).toEqual({
      id: 'ath-db-1',
      fullName: 'Martina Rivas',
      documentId: '40111222',
      birthDate: '1997-04-18',
      email: 'martina.rivas@example.com',
      phone: '+54 9 11 3000-1188',
      country: 'Argentina',
      province: 'Buenos Aires',
      city: 'La Plata',
      gym: 'Maximal Power',
      sex: 'Femenino',
      division: 'Open',
      category: 'Raw',
      estimatedWeight: '67.5',
      status: 'afiliado_activo',
    })
  })

  it('maps membership, registration and payment consistently', () => {
    expect(
      mapMembershipDto({
        id: 'mem-1',
        athleteId: 'ath-1',
        year: 2026,
        status: 'pendiente_pago',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        expirationDate: new Date('2026-12-31T00:00:00.000Z'),
        memberCode: 'PLU-ARG-2026-001',
        payment: { status: 'pendiente', externalPaymentId: 'MP-1' },
      }),
    ).toMatchObject({
      id: 'mem-1',
      athleteId: 'ath-1',
      year: '2026',
      status: 'pendiente_pago',
      paymentStatus: 'pendiente',
      mercadoPagoRef: 'MP-1',
    })

    expect(
      mapRegistrationDto({
        id: 'reg-1',
        athleteId: 'ath-1',
        event: { title: 'Pitbull Classic', slug: 'pitbull-classic-2026' },
        category: 'Raw',
        division: 'Open',
        bodyweightKg: '67.50',
        status: 'confirmada',
        payment: { status: 'aprobado' },
        notes: null,
        checkIn: null,
      }),
    ).toMatchObject({
      id: 'reg-1',
      event: 'Pitbull Classic',
      eventSlug: 'pitbull-classic-2026',
      paymentStatus: 'aprobado',
      checkedInAt: null,
    })

    expect(
      mapPaymentDto({
        id: 'pay-1',
        athleteId: 'ath-1',
        order: { concept: 'Afiliacion anual', provider: 'manual' },
        amount: 38000,
        status: 'pendiente',
        externalPaymentId: null,
        createdAt: new Date('2026-07-09T12:00:00.000Z'),
      }),
    ).toMatchObject({
      id: 'pay-1',
      concept: 'Afiliacion anual',
      method: 'manual',
      amount: 38000,
      status: 'pendiente',
    })
  })
})
```

- [ ] **Step 2: Run failing mapper tests**

Run: `npm.cmd test -- tests/domainMappers.test.js`

Expected: FAIL because `server/modules/domain/domainMappers.js` does not exist.

- [ ] **Step 3: Create mapper implementation**

Create `server/modules/domain/domainMappers.js`:

```javascript
function dateOnly(value) {
  if (!value) return null
  return new Date(value).toISOString().slice(0, 10)
}

function decimalString(value) {
  if (value === null || value === undefined) return ''
  const number = Number(value)
  return Number.isFinite(number) ? String(number).replace(/\.0$/, '') : ''
}

function sexLabel(value) {
  if (value === 'femenino') return 'Femenino'
  if (value === 'masculino') return 'Masculino'
  return value ?? ''
}

export function mapAthleteDto(athlete) {
  const document = athlete.documents?.find((item) => item.primary) ?? athlete.documents?.[0]
  return {
    id: athlete.id,
    fullName: `${athlete.firstName} ${athlete.lastName}`.trim(),
    documentId: document?.documentNumber ?? '',
    birthDate: dateOnly(athlete.birthDate),
    email: athlete.email,
    phone: athlete.phone,
    country: athlete.country,
    province: athlete.province,
    city: athlete.city,
    gym: athlete.gym,
    sex: sexLabel(athlete.competitiveSex),
    division: athlete.defaultDivision,
    category: athlete.defaultCategory,
    estimatedWeight: decimalString(athlete.estimatedBodyweightKg),
    status: athlete.status,
  }
}

export function mapMembershipDto(membership) {
  return {
    id: membership.id,
    athleteId: membership.athleteId,
    year: String(membership.year),
    status: membership.status,
    startDate: dateOnly(membership.startDate),
    expirationDate: dateOnly(membership.expirationDate),
    memberCode: membership.memberCode,
    paymentStatus: membership.payment?.status ?? membership.paymentOrder?.status ?? 'pendiente',
    mercadoPagoRef: membership.payment?.externalPaymentId ?? membership.paymentOrder?.externalRef ?? '',
  }
}

export function mapRegistrationDto(registration) {
  return {
    id: registration.id,
    athleteId: registration.athleteId,
    event: registration.event?.title ?? '',
    eventSlug: registration.event?.slug ?? '',
    category: registration.category,
    division: registration.division,
    bodyweight: decimalString(registration.bodyweightKg),
    status: registration.status,
    paymentStatus: registration.payment?.status ?? registration.paymentOrder?.status ?? 'pendiente',
    notes: registration.notes ?? '',
    checkedInAt: registration.checkIn?.scannedAt?.toISOString?.() ?? null,
  }
}

export function mapPaymentDto(payment) {
  return {
    id: payment.id,
    athleteId: payment.athleteId,
    concept: payment.order?.concept ?? '',
    amount: payment.amount,
    method: payment.order?.provider ?? payment.provider,
    status: payment.status,
    reference: payment.externalPaymentId ?? payment.order?.externalRef ?? '',
    createdAt: dateOnly(payment.createdAt),
  }
}
```

- [ ] **Step 4: Run mapper tests**

Run: `npm.cmd test -- tests/domainMappers.test.js`

Expected: PASS.

## Task 2: Audit Log Repository

**Files:**
- Create: `server/modules/domain/auditLogRepository.js`
- Add coverage inside: `tests/api.athletes.test.js` in Task 4

- [ ] **Step 1: Create central audit helper**

Create `server/modules/domain/auditLogRepository.js`:

```javascript
export async function createAuditLog({ prisma, action, entityType, entityId, actorId = null, before = null, after = null, metadata = null }) {
  return prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      actorId,
      before,
      after,
      metadata,
    },
  })
}
```

- [ ] **Step 2: Use this repository in all new workflows**

Every workflow in this plan must call `createAuditLog` after sensitive mutations:

```javascript
await createAuditLog({
  prisma: tx,
  action: 'athlete.registered',
  entityType: 'athlete',
  entityId: athlete.id,
  metadata: { source: 'public_registration' },
})
```

Expected: no direct `prisma.auditLog.create` calls in new workflow files except this repository.

## Task 3: Athlete Schemas and Repository

**Files:**
- Create: `server/modules/athletes/athleteSchemas.js`
- Create: `server/modules/athletes/athleteRepository.js`

- [ ] **Step 1: Create athlete schemas**

Create `server/modules/athletes/athleteSchemas.js`:

```javascript
import { z } from 'zod'

export const publicAthleteRegistrationSchema = z.object({
  fullName: z.string().trim().min(3),
  documentId: z.string().trim().regex(/^\d{7,8}$/),
  birthDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(6),
  country: z.string().trim().min(2).default('Argentina'),
  province: z.string().trim().min(2),
  city: z.string().trim().min(2),
  gym: z.string().trim().min(2),
  sex: z.enum(['Masculino', 'Femenino']),
  division: z.string().trim().min(2),
  category: z.string().trim().min(2),
  estimatedWeight: z.string().trim().regex(/^\d{2,3}(\.\d{1,2})?$/),
  procedureType: z.enum(['membership', 'event', 'both']).default('membership'),
  paymentMethod: z.enum(['mercado_pago', 'manual_link', 'transferencia', 'mock']).default('manual_link'),
})

export const updateAthleteProfileSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(6),
  province: z.string().trim().min(2),
  city: z.string().trim().min(2),
  gym: z.string().trim().min(2),
})
```

- [ ] **Step 2: Create repository reads and duplicate lookup**

Create `server/modules/athletes/athleteRepository.js`:

```javascript
export function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/)
  const firstName = parts.shift() ?? ''
  return {
    firstName,
    lastName: parts.join(' ') || firstName,
  }
}

export function toCompetitiveSex(sex) {
  return sex === 'Femenino' ? 'femenino' : 'masculino'
}

export async function findAthleteDuplicate({ prisma, email, documentId }) {
  return prisma.athlete.findFirst({
    where: {
      OR: [
        { email },
        { documents: { some: { documentType: 'dni', documentNumber: documentId } } },
      ],
    },
    include: { documents: true },
  })
}

export async function listAthletes({ prisma }) {
  return prisma.athlete.findMany({
    include: { documents: true },
    orderBy: [{ createdAt: 'desc' }],
  })
}

export async function getAthleteDetail({ prisma, athleteId }) {
  return prisma.athlete.findUnique({
    where: { id: athleteId },
    include: {
      documents: true,
      memberships: { include: { payment: true, paymentOrder: true }, orderBy: { createdAt: 'desc' } },
      registrations: { include: { event: true, payment: true, paymentOrder: true, checkIn: true }, orderBy: { createdAt: 'desc' } },
      payments: { include: { order: true }, orderBy: { createdAt: 'desc' } },
    },
  })
}
```

Expected: repository has no Express `req`/`res` dependency.

## Task 4: Athlete API Workflow

**Files:**
- Create: `server/modules/athletes/athleteWorkflow.js`
- Create: `server/routes/athletes.js`
- Modify: `server/app.js`
- Create: `tests/api.athletes.test.js`

- [ ] **Step 1: Write athlete API tests**

Create `tests/api.athletes.test.js`:

```javascript
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function createPrismaDouble() {
  const athletes = []
  const auditLogs = []
  const prisma = {
    athlete: {
      findFirst: vi.fn(async ({ where }) => {
        return athletes.find((athlete) => {
          const emailMatch = where.OR.some((item) => item.email && item.email === athlete.email)
          const dniFilter = where.OR.find((item) => item.documents)
          const dniMatch = athlete.documents.some(
            (document) => document.documentNumber === dniFilter?.documents?.some?.documentNumber,
          )
          return emailMatch || dniMatch
        }) ?? null
      }),
      findMany: vi.fn(async () => athletes),
      create: vi.fn(async ({ data, include }) => {
        const athlete = {
          id: `ath-${athletes.length + 1}`,
          ...data,
          documents: data.documents.create.map((document, index) => ({ id: `doc-${index + 1}`, ...document })),
        }
        athletes.unshift(athlete)
        return include ? athlete : { id: athlete.id }
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        const log = { id: `audit-${auditLogs.length + 1}`, ...data, createdAt: new Date() }
        auditLogs.unshift(log)
        return log
      }),
    },
    $transaction: async (callback) => callback({
      athlete: {
        create: async (args) => prisma.athlete.create(args),
      },
      auditLog: prisma.auditLog,
    }),
    __state: { athletes, auditLogs },
  }
  return prisma
}

describe('athlete api', () => {
  it('creates a persisted athlete and audit log', async () => {
    const prisma = createPrismaDouble()
    const target = listen(createApp({ prisma }))

    const response = await fetch(`${target.url}/api/athletes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        fullName: 'Martina Rivas',
        documentId: '40111222',
        birthDate: '1997-04-18',
        email: 'martina.rivas@example.com',
        phone: '+54 9 11 3000-1188',
        country: 'Argentina',
        province: 'Buenos Aires',
        city: 'La Plata',
        gym: 'Maximal Power',
        sex: 'Femenino',
        division: 'Open',
        category: 'Raw',
        estimatedWeight: '67.5',
        procedureType: 'membership',
        paymentMethod: 'manual_link',
      }),
    })

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.athlete).toMatchObject({
      fullName: 'Martina Rivas',
      documentId: '40111222',
      status: 'registrado',
    })
    expect(prisma.__state.auditLogs[0]).toMatchObject({
      action: 'athlete.registered',
      entityType: 'athlete',
    })

    await target.close()
  })
})
```

- [ ] **Step 2: Run failing athlete API test**

Run: `npm.cmd test -- tests/api.athletes.test.js`

Expected: FAIL because `/api/athletes` does not exist.

- [ ] **Step 3: Implement athlete workflow**

Create `server/modules/athletes/athleteWorkflow.js`:

```javascript
import { HttpError } from '../../lib/errors.js'
import { createAuditLog } from '../domain/auditLogRepository.js'
import { mapAthleteDto } from '../domain/domainMappers.js'
import { findAthleteDuplicate, listAthletes, splitFullName, toCompetitiveSex } from './athleteRepository.js'

export async function registerAthlete({ prisma, input }) {
  const duplicate = await findAthleteDuplicate({ prisma, email: input.email, documentId: input.documentId })
  if (duplicate) {
    throw new HttpError(409, `Ya existe un atleta con ese correo o documento (${duplicate.firstName} ${duplicate.lastName}).`)
  }

  const names = splitFullName(input.fullName)

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.create({
      data: {
        firstName: names.firstName,
        lastName: names.lastName,
        birthDate: new Date(`${input.birthDate}T00:00:00.000Z`),
        email: input.email,
        phone: input.phone,
        country: input.country,
        province: input.province,
        city: input.city,
        gym: input.gym,
        competitiveSex: toCompetitiveSex(input.sex),
        defaultDivision: input.division,
        defaultCategory: input.category,
        estimatedBodyweightKg: input.estimatedWeight,
        status: 'registrado',
        documents: {
          create: [{ documentType: 'dni', documentNumber: input.documentId, primary: true }],
        },
      },
      include: { documents: true },
    })

    await createAuditLog({
      prisma: tx,
      action: 'athlete.registered',
      entityType: 'athlete',
      entityId: athlete.id,
      metadata: { procedureType: input.procedureType, paymentMethod: input.paymentMethod },
    })

    return {
      athlete: mapAthleteDto(athlete),
      confirmation: { type: 'profile', athleteName: input.fullName, status: 'registrado' },
    }
  })
}

export async function listAthleteDtos({ prisma }) {
  const athletes = await listAthletes({ prisma })
  return athletes.map(mapAthleteDto)
}
```

- [ ] **Step 4: Create athlete routes**

Create `server/routes/athletes.js`:

```javascript
import { Router } from 'express'
import { validateBody } from '../lib/validate.js'
import { getPrisma } from '../lib/prisma.js'
import { publicAthleteRegistrationSchema } from '../modules/athletes/athleteSchemas.js'
import { listAthleteDtos, registerAthlete } from '../modules/athletes/athleteWorkflow.js'

export function createAthleteRoutes({ getPrisma: resolvePrisma = getPrisma } = {}) {
  const router = Router()
  const prisma = resolvePrisma()

  router.get('/', async (_req, res, next) => {
    try {
      const athletes = await listAthleteDtos({ prisma })
      res.json({ athletes })
    } catch (error) {
      next(error)
    }
  })

  router.post('/', validateBody(publicAthleteRegistrationSchema), async (req, res, next) => {
    try {
      const result = await registerAthlete({ prisma, input: req.validatedBody })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

- [ ] **Step 5: Mount route in app**

Modify `server/app.js`:

```javascript
import { createAthleteRoutes } from './routes/athletes.js'

// inside createApp
app.use('/api/athletes', createAthleteRoutes({ getPrisma: () => deps.prisma ?? getPrisma() }))
```

- [ ] **Step 6: Run athlete API tests**

Run: `npm.cmd test -- tests/api.athletes.test.js tests/domainMappers.test.js`

Expected: PASS.

## Task 5: Membership Order Workflow

**Files:**
- Create: `server/modules/memberships/membershipWorkflow.js`
- Create: `server/routes/memberships.js`
- Modify: `server/app.js`
- Create: `tests/api.memberships.test.js`

- [ ] **Step 1: Write membership API contract**

The endpoint creates a `PaymentOrder`, one initial `Payment`, a `Membership`, one `PaymentAllocation`, and an `AuditLog` in a transaction.

Request:

```json
{
  "athleteId": "ath-1",
  "year": 2026,
  "paymentMethod": "manual"
}
```

Response:

```json
{
  "membership": { "status": "pendiente_pago", "paymentStatus": "pendiente" },
  "paymentOrder": { "status": "pendiente", "orderType": "membership" },
  "payment": { "status": "pendiente", "amount": 38000 }
}
```

- [ ] **Step 2: Create membership workflow**

Create `server/modules/memberships/membershipWorkflow.js`:

```javascript
import { HttpError } from '../../lib/errors.js'
import { PRICING } from '../../../src/lib/constants.js'
import { createAuditLog } from '../domain/auditLogRepository.js'
import { mapMembershipDto, mapPaymentDto } from '../domain/domainMappers.js'

export async function createMembershipOrder({ prisma, athleteId, year = 2026, paymentMethod = 'manual' }) {
  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findUnique({ where: { id: athleteId } })
    if (!athlete) throw new HttpError(404, 'Atleta no encontrado.')

    const existing = await tx.membership.findUnique({
      where: { athleteId_year: { athleteId, year } },
    })
    if (existing && existing.status !== 'cancelada') {
      throw new HttpError(409, 'El atleta ya tiene una afiliacion para ese anio.')
    }

    const paymentOrder = await tx.paymentOrder.create({
      data: {
        athleteId,
        orderType: 'membership',
        status: 'pendiente',
        amount: PRICING.membership,
        provider: paymentMethod,
        concept: 'Afiliacion anual',
        idempotencyKey: `membership:${athleteId}:${year}`,
      },
    })

    const payment = await tx.payment.create({
      data: {
        orderId: paymentOrder.id,
        athleteId,
        provider: paymentMethod,
        status: 'pendiente',
        amount: PRICING.membership,
      },
      include: { order: true },
    })

    const membership = await tx.membership.create({
      data: {
        athleteId,
        year,
        memberCode: `PLU-ARG-${year}-${athleteId.slice(-6).toUpperCase()}`,
        status: 'pendiente_pago',
        startDate: new Date(`${year}-01-01T00:00:00.000Z`),
        expirationDate: new Date(`${year}-12-31T23:59:59.999Z`),
        paymentOrderId: paymentOrder.id,
        paymentId: payment.id,
      },
      include: { payment: true, paymentOrder: true },
    })

    await tx.paymentAllocation.create({
      data: {
        paymentOrderId: paymentOrder.id,
        paymentId: payment.id,
        membershipId: membership.id,
        amount: PRICING.membership,
      },
    })

    await createAuditLog({
      prisma: tx,
      action: 'membership.created',
      entityType: 'membership',
      entityId: membership.id,
      metadata: { paymentOrderId: paymentOrder.id },
    })

    return { membership: mapMembershipDto(membership), paymentOrder, payment: mapPaymentDto(payment) }
  })
}
```

- [ ] **Step 3: Create membership route**

Create `server/routes/memberships.js`:

```javascript
import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../lib/validate.js'
import { getPrisma } from '../lib/prisma.js'
import { createMembershipOrder } from '../modules/memberships/membershipWorkflow.js'

const createMembershipOrderSchema = z.object({
  athleteId: z.string().trim().min(1),
  year: z.number().int().min(2026).default(2026),
  paymentMethod: z.enum(['mercado_pago', 'manual', 'mock']).default('manual'),
})

export function createMembershipRoutes({ getPrisma: resolvePrisma = getPrisma } = {}) {
  const router = Router()
  const prisma = resolvePrisma()

  router.post('/orders', validateBody(createMembershipOrderSchema), async (req, res, next) => {
    try {
      const result = await createMembershipOrder({ prisma, ...req.validatedBody })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

- [ ] **Step 4: Mount route and test**

Modify `server/app.js`:

```javascript
import { createMembershipRoutes } from './routes/memberships.js'

app.use('/api/memberships', createMembershipRoutes({ getPrisma: () => deps.prisma ?? getPrisma() }))
```

Run: `npm.cmd test -- tests/api.memberships.test.js`

Expected: PASS after adding the test double for the transaction behavior above.

## Task 6: Event Registration Order Workflow

**Files:**
- Create: `server/modules/registrations/registrationWorkflow.js`
- Create: `server/routes/registrations.js`
- Modify: `server/app.js`
- Create: `tests/api.registrations.test.js`

- [ ] **Step 1: Implement registration workflow**

Create `server/modules/registrations/registrationWorkflow.js`:

```javascript
import { HttpError } from '../../lib/errors.js'
import { createAuditLog } from '../domain/auditLogRepository.js'
import { mapPaymentDto, mapRegistrationDto } from '../domain/domainMappers.js'

export async function createEventRegistrationOrder({ prisma, athleteId, eventSlug, division, category, bodyweightKg, paymentMethod = 'manual' }) {
  return prisma.$transaction(async (tx) => {
    const [athlete, event] = await Promise.all([
      tx.athlete.findUnique({ where: { id: athleteId }, include: { memberships: true } }),
      tx.event.findUnique({ where: { slug: eventSlug } }),
    ])

    if (!athlete) throw new HttpError(404, 'Atleta no encontrado.')
    if (!event) throw new HttpError(404, 'Evento no encontrado.')

    const activeMembership = athlete.memberships.find((membership) => membership.status === 'activa')
    if (event.requiresMembership && !activeMembership) {
      throw new HttpError(409, 'El evento requiere afiliacion activa.')
    }

    const duplicate = await tx.eventRegistration.findUnique({
      where: { eventId_athleteId: { eventId: event.id, athleteId } },
    })
    if (duplicate && duplicate.status !== 'cancelada') {
      throw new HttpError(409, 'El atleta ya esta inscripto en este evento.')
    }

    const paymentOrder = await tx.paymentOrder.create({
      data: {
        athleteId,
        orderType: 'event_registration',
        status: 'pendiente',
        amount: event.price,
        provider: paymentMethod,
        concept: `Inscripcion ${event.title}`,
        idempotencyKey: `registration:${event.id}:${athleteId}`,
      },
    })

    const payment = await tx.payment.create({
      data: {
        orderId: paymentOrder.id,
        athleteId,
        provider: paymentMethod,
        status: 'pendiente',
        amount: event.price,
      },
      include: { order: true },
    })

    const registration = await tx.eventRegistration.create({
      data: {
        athleteId,
        eventId: event.id,
        membershipId: activeMembership?.id,
        division,
        category,
        bodyweightKg,
        status: 'pendiente_pago',
        paymentOrderId: paymentOrder.id,
        paymentId: payment.id,
      },
      include: { event: true, payment: true, paymentOrder: true, checkIn: true },
    })

    await tx.paymentAllocation.create({
      data: {
        paymentOrderId: paymentOrder.id,
        paymentId: payment.id,
        registrationId: registration.id,
        amount: event.price,
      },
    })

    await createAuditLog({
      prisma: tx,
      action: 'registration.created',
      entityType: 'event_registration',
      entityId: registration.id,
      metadata: { paymentOrderId: paymentOrder.id },
    })

    return { registration: mapRegistrationDto(registration), paymentOrder, payment: mapPaymentDto(payment) }
  })
}
```

- [ ] **Step 2: Create registration route**

Create `server/routes/registrations.js`:

```javascript
import { Router } from 'express'
import { z } from 'zod'
import { validateBody } from '../lib/validate.js'
import { getPrisma } from '../lib/prisma.js'
import { createEventRegistrationOrder } from '../modules/registrations/registrationWorkflow.js'

const createRegistrationSchema = z.object({
  athleteId: z.string().trim().min(1),
  eventSlug: z.string().trim().min(1),
  division: z.string().trim().min(1),
  category: z.string().trim().min(1),
  bodyweightKg: z.string().trim().regex(/^\d{2,3}(\.\d{1,2})?$/),
  paymentMethod: z.enum(['mercado_pago', 'manual', 'mock']).default('manual'),
})

export function createRegistrationRoutes({ getPrisma: resolvePrisma = getPrisma } = {}) {
  const router = Router()
  const prisma = resolvePrisma()

  router.post('/orders', validateBody(createRegistrationSchema), async (req, res, next) => {
    try {
      const result = await createEventRegistrationOrder({ prisma, ...req.validatedBody })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

- [ ] **Step 3: Mount route and test**

Modify `server/app.js`:

```javascript
import { createRegistrationRoutes } from './routes/registrations.js'

app.use('/api/registrations', createRegistrationRoutes({ getPrisma: () => deps.prisma ?? getPrisma() }))
```

Run: `npm.cmd test -- tests/api.registrations.test.js`

Expected: PASS after adding coverage for active membership required, duplicate registration rejected, and successful order creation.

## Task 7: Payment Approval as Atomic Domain Transition

**Files:**
- Modify: `server/modules/payments/paymentWorkflow.js`
- Modify: `server/routes/payments.js`
- Create: `tests/api.domainPayments.test.js`

- [ ] **Step 1: Define approval behavior**

Approving a `PaymentOrder` must atomically:

- Set `PaymentOrder.status = aprobado`.
- Set related `Payment.status = aprobado` and `confirmedAt`.
- Set related `Membership.status = activa` when allocation has `membershipId`.
- Set related `EventRegistration.status = confirmada` when allocation has `registrationId`.
- Set related `Athlete.status = afiliado_activo` when a membership is activated.
- Create `AuditLog` with action `payment.approved`.
- Queue emails through `notificationWorkflow` using deterministic idempotency keys.

- [ ] **Step 2: Implement `approvePaymentOrder`**

Add this export to `server/modules/payments/paymentWorkflow.js`:

```javascript
import { HttpError } from '../../lib/errors.js'
import { createAuditLog } from '../domain/auditLogRepository.js'

export async function approvePaymentOrder({ prisma, paymentOrderId, actorId = null }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({
      where: { id: paymentOrderId },
      include: { allocations: true, payments: true },
    })
    if (!order) throw new HttpError(404, 'Orden de pago no encontrada.')
    if (order.status === 'aprobado') return { paymentOrder: order, alreadyApproved: true }

    const payment = order.payments[0]
    const confirmedAt = new Date()

    const updatedOrder = await tx.paymentOrder.update({
      where: { id: paymentOrderId },
      data: { status: 'aprobado' },
    })

    let updatedPayment = null
    if (payment) {
      updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'aprobado', confirmedAt },
      })
    }

    for (const allocation of order.allocations) {
      if (allocation.membershipId) {
        const membership = await tx.membership.update({
          where: { id: allocation.membershipId },
          data: { status: 'activa', paymentId: updatedPayment?.id ?? null },
        })
        await tx.athlete.update({
          where: { id: membership.athleteId },
          data: { status: 'afiliado_activo' },
        })
      }

      if (allocation.registrationId) {
        await tx.eventRegistration.update({
          where: { id: allocation.registrationId },
          data: { status: 'confirmada', paymentId: updatedPayment?.id ?? null },
        })
      }
    }

    await createAuditLog({
      prisma: tx,
      action: 'payment.approved',
      entityType: 'payment_order',
      entityId: paymentOrderId,
      actorId,
      metadata: { paymentId: updatedPayment?.id ?? null },
    })

    return { paymentOrder: updatedOrder, payment: updatedPayment, alreadyApproved: false }
  })
}
```

- [ ] **Step 3: Add protected/manual approval route**

Modify `server/routes/payments.js` to export a factory and use role guards:

```javascript
import { requireRole } from '../middleware/auth.js'
import { getPrisma } from '../lib/prisma.js'
import { approvePaymentOrder } from '../modules/payments/paymentWorkflow.js'

const FINANCE_ROLES = ['admin_maximal', 'admin_plu_arg', 'operador_plu_arg']

export function createPaymentRoutes({ getPrisma: resolvePrisma = getPrisma } = {}) {
  const router = Router()
  const prisma = resolvePrisma()

  router.post('/orders/:paymentOrderId/approve', ...requireRole(FINANCE_ROLES, { prisma }), async (req, res, next) => {
    try {
      const result = await approvePaymentOrder({
        prisma,
        paymentOrderId: req.params.paymentOrderId,
        actorId: req.auth.user.id,
      })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

Keep existing preference/webhook endpoints in the same route factory.

- [ ] **Step 4: Update app mount**

Modify `server/app.js`:

```javascript
import { createPaymentRoutes } from './routes/payments.js'

app.use('/api/payments', createPaymentRoutes({ getPrisma: () => deps.prisma ?? getPrisma() }))
```

- [ ] **Step 5: Run payment tests**

Run: `npm.cmd test -- tests/api.domainPayments.test.js tests/integrationWorkflow.test.js`

Expected: PASS. Existing integration idempotency tests must keep passing.

## Task 8: Frontend Domain API Client

**Files:**
- Create: `src/services/domainApi.js`
- Modify: `src/hooks/useAppData.js`

- [ ] **Step 1: Create API client functions**

Create `src/services/domainApi.js`:

```javascript
import { apiGet, apiPost } from '../lib/api.js'

export function listAthletesRequest() {
  return apiGet('/api/athletes')
}

export function registerAthleteRequest(payload) {
  return apiPost('/api/athletes', payload)
}

export function createMembershipOrderRequest(payload) {
  return apiPost('/api/memberships/orders', payload)
}

export function createRegistrationOrderRequest(payload) {
  return apiPost('/api/registrations/orders', payload)
}

export function approvePaymentOrderRequest(paymentOrderId) {
  return apiPost(`/api/payments/orders/${paymentOrderId}/approve`, {})
}
```

- [ ] **Step 2: Add domain loading state to `useAppData`**

In `src/hooks/useAppData.js`, add:

```javascript
const [domainLoading, setDomainLoading] = useState(false)
const [domainError, setDomainError] = useState(null)
const [domainSource, setDomainSource] = useState('demo')
```

Add a loader:

```javascript
const refreshDomainData = useCallback(async () => {
  setDomainLoading(true)
  setDomainError(null)
  try {
    const { athletes: apiAthletes } = await listAthletesRequest()
    setAthletes(apiAthletes)
    setDomainSource('api')
  } catch (error) {
    setDomainError(error.message ?? 'No se pudo cargar el dominio desde la API.')
    setDomainSource('demo')
  } finally {
    setDomainLoading(false)
  }
}, [])
```

Call it once after session restore:

```javascript
useEffect(() => {
  refreshDomainData()
}, [refreshDomainData])
```

Expected: UI still works if API is down, but `domainSource` makes the fallback explicit.

- [ ] **Step 3: Replace public registration mutation**

Change `registerAthlete` from local-only mutation to:

```javascript
const registerAthlete = useCallback(
  async (event) => {
    event.preventDefault()
    try {
      const result = await registerAthleteRequest(form)
      setAthletes((current) => [result.athlete, ...current.filter((item) => item.id !== result.athlete.id)])
      setCreatedOrder(result.confirmation)
      setForm({ ...DEFAULT_FORM })
      setSession({
        role: 'athlete_plu',
        athleteId: result.athlete.id,
        name: result.athlete.fullName,
        email: result.athlete.email,
      })
      return result
    } catch (error) {
      if (domainSource === 'demo') {
        const fallback = createAthleteProfile(form, athletes)
        if (fallback.error) return fallback
        setAthletes((current) => [fallback.athlete, ...current])
        setCreatedOrder(fallback.confirmation)
        setAuditLogs((current) => [fallback.auditLog, ...current])
        setForm(fallback.resetForm)
        return fallback
      }
      return { error: error.message ?? 'No se pudo registrar el atleta.' }
    }
  },
  [athletes, domainSource, form, setSession],
)
```

Expected: production-like API path is primary; demo fallback remains explicit.

## Task 9: Membership and Registration Frontend Wiring

**Files:**
- Modify: `src/hooks/useAppData.js`
- Modify if needed: `src/pages/profile/MembershipPurchaseSection.jsx`
- Modify if needed: `src/pages/EventsPage.jsx`

- [ ] **Step 1: Replace membership order mutation**

Update `submitMembership` in `src/hooks/useAppData.js`:

```javascript
const submitMembership = useCallback(
  async (event) => {
    event.preventDefault()
    const athlete = athletes.find((item) => item.id === session?.athleteId)
    if (!athlete) return { error: 'No se encontro el perfil del atleta.' }

    try {
      const result = await createMembershipOrderRequest({
        athleteId: athlete.id,
        year: 2026,
        paymentMethod: form.paymentMethod === 'manual_link' ? 'manual' : form.paymentMethod,
      })
      setMemberships((current) => [result.membership, ...current.filter((item) => item.id !== result.membership.id)])
      setPayments((current) => [result.payment, ...current.filter((item) => item.id !== result.payment.id)])
      setCreatedOrder({ type: 'membership', paymentOrderId: result.paymentOrder.id, ...result.payment })
      return result
    } catch (error) {
      return { error: error.message ?? 'No se pudo crear la afiliacion.' }
    }
  },
  [athletes, form.paymentMethod, session],
)
```

- [ ] **Step 2: Replace competition order mutation**

Update `submitCompetition`:

```javascript
const submitCompetition = useCallback(
  async (event, selectedEvent) => {
    event.preventDefault()
    const athlete = athletes.find((item) => item.id === session?.athleteId)
    if (!athlete) return { error: 'No se encontro el perfil del atleta.' }

    try {
      const result = await createRegistrationOrderRequest({
        athleteId: athlete.id,
        eventSlug: selectedEvent.slug,
        division: form.division,
        category: form.category,
        bodyweightKg: form.estimatedWeight,
        paymentMethod: form.paymentMethod === 'manual_link' ? 'manual' : form.paymentMethod,
      })
      setRegistrations((current) => [result.registration, ...current.filter((item) => item.id !== result.registration.id)])
      setPayments((current) => [result.payment, ...current.filter((item) => item.id !== result.payment.id)])
      setCreatedOrder({ type: 'competition', paymentOrderId: result.paymentOrder.id, ...result.payment })
      return result
    } catch (error) {
      return { error: error.message ?? 'No se pudo crear la inscripcion.' }
    }
  },
  [athletes, form, session],
)
```

Expected: new orders are created by backend and reflected in the UI.

## Task 10: Admin Payment Approval Wiring

**Files:**
- Modify: `src/hooks/useAppData.js`
- Modify if needed: `src/pages/admin/AthleteDetailSection.jsx`
- Modify if needed: `src/pages/admin/RegistrationsSection.jsx`

- [ ] **Step 1: Route admin approvals through API**

Update `handleApprovePayment` to prefer `payment.paymentOrderId` or `createdOrder.paymentOrderId`:

```javascript
const handleApprovePayment = useCallback(
  async (paymentId) => {
    const payment = payments.find((item) => item.id === paymentId)
    if (!payment || !userCanEdit) return

    const paymentOrderId = payment.paymentOrderId ?? createdOrder?.paymentOrderId
    if (!paymentOrderId) return { error: 'La orden de pago no tiene ID de backend.' }

    try {
      await approvePaymentOrderRequest(paymentOrderId)
      await refreshDomainData()
      setCreatedOrder((current) => (current?.paymentId === paymentId ? { ...current, status: 'aprobado' } : current))
      return { ok: true }
    } catch (error) {
      return { error: error.message ?? 'No se pudo aprobar el pago.' }
    }
  },
  [createdOrder, payments, refreshDomainData, userCanEdit],
)
```

Expected: approving a payment no longer mutates memberships/registrations/athletes manually in React.

## Task 11: Isolate Demo Storage

**Files:**
- Modify: `src/services/storageService.js`
- Modify: `src/hooks/useAppData.js`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Rename storage intent in comments and exports**

Keep the existing functions for compatibility, but document them as demo-only:

```javascript
/**
 * Demo-only browser persistence. Domain data must come from the API in real
 * environments; this storage is only a local fallback for showcase mode.
 */
export function readStorage() {
  // existing implementation
}
```

- [ ] **Step 2: Gate writes behind demo source**

In `useAppData.js`, change the storage write effect:

```javascript
useEffect(() => {
  if (domainSource !== 'demo') return
  writeStorage({
    athletes,
    memberships,
    registrations,
    payments,
    createdOrder,
    auditLogs,
    adminEvents,
    users,
  })
}, [domainSource, athletes, memberships, registrations, payments, createdOrder, auditLogs, adminEvents, users])
```

Expected: API-backed sessions do not rewrite canonical domain state into localStorage.

- [ ] **Step 3: Update docs**

In `docs/ARCHITECTURE.md`, replace the MVP table with:

```markdown
| Capa | Estado demo | Target operativo |
|------|-------------|------------------|
| Persistencia dominio deportivo | localStorage demo aislado | PostgreSQL via API Express/Prisma |
| Auth | Demo + sesiones HTTP-only | Sesiones HTTP-only/OAuth sin selector inseguro |
| Pagos | Manual/mock para desarrollo | PaymentOrder + webhook Mercado Pago |
| Emails | Mock console | Brevo templates via workflow backend |
```

Expected: docs no longer imply that localStorage is an acceptable production source.

## Task 12: Verification and Smoke Checks

**Files:**
- All touched files.

- [ ] **Step 1: Run domain unit/API tests**

Run:

```powershell
npm.cmd test -- tests/domainMappers.test.js tests/api.athletes.test.js tests/api.memberships.test.js tests/api.registrations.test.js tests/api.domainPayments.test.js
```

Expected: PASS.

- [ ] **Step 2: Run existing regression suites**

Run:

```powershell
npm.cmd test -- tests/integrationWorkflow.test.js tests/api.auth.test.js tests/api.security.test.js tests/roles.test.js tests/athleteService.test.js
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```powershell
npm.cmd test
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 6: Manual smoke with API and DB**

Run:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev:all
```

Expected:

- Frontend opens at `http://localhost:5173`.
- API health opens at `http://localhost:3001/health`.
- Public athlete registration creates an athlete in Postgres.
- Membership purchase creates `PaymentOrder`, `Payment`, `Membership`, `PaymentAllocation`.
- Admin approval activates membership and writes `AuditLog`.
- Event registration requires active membership when event requires it.
- Refreshing the browser keeps data because it comes from API/Postgres.

## Execution Notes

- Do not remove the ticketing workflow. It is the reference pattern and should continue passing.
- Do not move secrets to the browser. Mercado Pago private access tokens and Brevo keys stay server-side.
- Do not make UI redesign changes in this plan. Visual polish is a separate track.
- Do not replace all admin sections at once. Switch the domain source first, then expand admin modules.
- Prefer route factories that accept `{ getPrisma }`, matching `createTicketRoutes`, so tests can use Prisma doubles.

## Self-Review

- Spec coverage: the plan covers backend source of truth, domain workflows, payment state transitions, frontend API wiring, localStorage isolation, docs, and verification.
- Red-flag scan: no unfinished markers or vague edge-case instructions remain.
- Type consistency: DTO names match new workflow and frontend API names; payment order naming is consistent across backend and frontend.
- Scope check: LiftingCast, records, production deploy, Brevo templates and Mercado Pago credentials are intentionally outside this plan. They should get separate plans after the core logical flow is stable.
