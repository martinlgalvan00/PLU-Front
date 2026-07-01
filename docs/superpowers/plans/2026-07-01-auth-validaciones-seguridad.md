# Auth, RBAC y Validaciones Seguras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure, reliable, low-cost authentication and authorization base for PLU ARG, with backend-enforced RBAC, server-side validation, hardened Express defaults, and no private secrets in the browser bundle.

**Architecture:** Express owns authentication, sessions, security headers, protected mutations, and integration secrets. React keeps only UX state and permission display hints, while backend middleware remains authoritative. Zod schemas and role helpers are shared where safe so frontend and API validate the same rules.

**Tech Stack:** React 19, Vite 8, Express 5, Prisma 6, PostgreSQL, Zod, Vitest, cookie-parser, helmet, express-rate-limit, bcryptjs.

---

## File Structure

- Modify: `package.json` and `package-lock.json` for `bcryptjs`, `cookie-parser`, `helmet`, `express-rate-limit`.
- Modify: `prisma/schema.prisma` to add `Session`, `User.lastLoginAt`, and `User.sessions`.
- Modify: `src/lib/constants.js` to align role metadata with `UserRole`.
- Modify: `src/lib/roles.js` to expose canonical permission helpers.
- Modify: `tests/roles.test.js` for full RBAC coverage.
- Create: `src/lib/schemas/auth.js` for shared login payload validation.
- Create: `tests/authSchema.test.js` for auth schema behavior.
- Create: `server/lib/errors.js` for typed HTTP errors and safe error responses.
- Create: `server/lib/validate.js` for Zod request validation.
- Create: `server/lib/security.js` for Origin/header mutation checks and safe CORS origins.
- Modify: `server/app.js` to add security middleware, parsers, routes, 404, and error handler.
- Create: `server/services/passwordService.js` for password hashing and verification.
- Create: `server/services/sessionService.js` for token creation, hashing, cookie options, lookup, and revocation.
- Create: `server/middleware/auth.js` for `requireAuth` and `requirePermission`.
- Create: `server/routes/auth.js` for `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`.
- Create: `tests/api.auth.test.js` for login/session/logout.
- Create: `tests/api.security.test.js` for hardened API behavior and protected route failures.
- Modify: `src/config/env.js` to expose only browser-safe values.
- Modify: `.env.example` to document server-only secrets and demo auth settings.
- Modify: `src/lib/api.js` to support cookie credentials and mutation headers.
- Modify: `src/hooks/useAppData.js`, `src/App.jsx`, `src/pages/LoginPage.jsx`, and `src/components/layout/AdminShell.jsx` to consume real auth state without breaking the current demo/admin work.

## Task 1: Canonical Roles and Permissions

**Files:**
- Modify: `src/lib/constants.js`
- Modify: `src/lib/roles.js`
- Modify: `tests/roles.test.js`

- [ ] **Step 1: Write failing RBAC tests**

Replace `tests/roles.test.js` with tests that assert the canonical roles:

```javascript
import { describe, expect, it } from 'vitest'
import {
  canApproveManualPayments,
  canEditOperationalData,
  canExport,
  canExportPluUsa,
  canManageUsers,
  canViewAdmin,
  getRoleLabel,
  isKnownRole,
} from '../src/lib/roles.js'

describe('roles', () => {
  it('reconoce solo roles canonicos', () => {
    expect(isKnownRole('admin_maximal')).toBe(true)
    expect(isKnownRole('admin_plu_arg')).toBe(true)
    expect(isKnownRole('operador_plu_arg')).toBe(true)
    expect(isKnownRole('viewer_plu_usa')).toBe(true)
    expect(isKnownRole('admin_plu')).toBe(false)
    expect(isKnownRole('athlete_plu')).toBe(false)
  })

  it('permite ver admin a los roles administrativos', () => {
    expect(canViewAdmin('admin_maximal')).toBe(true)
    expect(canViewAdmin('viewer_plu_usa')).toBe(true)
    expect(canViewAdmin(null)).toBe(false)
  })

  it('limita edicion y aprobacion manual a roles operativos', () => {
    expect(canEditOperationalData('admin_maximal')).toBe(true)
    expect(canEditOperationalData('admin_plu_arg')).toBe(true)
    expect(canEditOperationalData('operador_plu_arg')).toBe(true)
    expect(canEditOperationalData('viewer_plu_usa')).toBe(false)
    expect(canApproveManualPayments('operador_plu_arg')).toBe(true)
    expect(canApproveManualPayments('viewer_plu_usa')).toBe(false)
  })

  it('limita gestion de usuarios a admins superiores', () => {
    expect(canManageUsers('admin_maximal')).toBe(true)
    expect(canManageUsers('admin_plu_arg')).toBe(true)
    expect(canManageUsers('operador_plu_arg')).toBe(false)
    expect(canManageUsers('viewer_plu_usa')).toBe(false)
  })

  it('permite export PLU USA tambien al viewer autorizado', () => {
    expect(canExport('viewer_plu_usa')).toBe(true)
    expect(canExportPluUsa('viewer_plu_usa')).toBe(true)
    expect(canExportPluUsa('unknown')).toBe(false)
  })

  it('devuelve etiquetas seguras', () => {
    expect(getRoleLabel('admin_plu_arg')).toBe('Admin PLU ARG')
    expect(getRoleLabel('unknown')).toBe('Sin rol')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/roles.test.js`

Expected: FAIL because `canViewAdmin`, `canEditOperationalData`, `canApproveManualPayments`, `getRoleLabel`, and `isKnownRole` are not implemented yet.

- [ ] **Step 3: Implement canonical role constants**

Update `src/lib/constants.js` so `ROLES` contains only:

```javascript
export const ROLES = {
  admin_maximal: {
    label: 'Admin Maximal',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: true,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
  },
  admin_plu_arg: {
    label: 'Admin PLU ARG',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: true,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
  },
  operador_plu_arg: {
    label: 'Operador PLU ARG',
    canViewAdmin: true,
    canEditOperationalData: true,
    canManageUsers: false,
    canApproveManualPayments: true,
    canExportAdmin: true,
    canExportPluUsa: true,
  },
  viewer_plu_usa: {
    label: 'PLU USA lectura',
    canViewAdmin: true,
    canEditOperationalData: false,
    canManageUsers: false,
    canApproveManualPayments: false,
    canExportAdmin: false,
    canExportPluUsa: true,
  },
}
```

- [ ] **Step 4: Implement role helpers**

Update `src/lib/roles.js`:

```javascript
import { ROLES } from './constants.js'

function permission(role, key) {
  return ROLES[role]?.[key] ?? false
}

export function isKnownRole(role) {
  return Boolean(ROLES[role])
}

export function getRoleLabel(role) {
  return ROLES[role]?.label ?? 'Sin rol'
}

export function canViewAdmin(role) {
  return permission(role, 'canViewAdmin')
}

export function canEditOperationalData(role) {
  return permission(role, 'canEditOperationalData')
}

export function canEdit(role) {
  return canEditOperationalData(role)
}

export function canManageUsers(role) {
  return permission(role, 'canManageUsers')
}

export function canExport(role) {
  return permission(role, 'canExportAdmin') || permission(role, 'canExportPluUsa')
}

export function canExportPluUsa(role) {
  return permission(role, 'canExportPluUsa')
}

export function canApproveManualPayments(role) {
  return permission(role, 'canApproveManualPayments')
}

export function canApprovePayments(role) {
  return canApproveManualPayments(role)
}
```

- [ ] **Step 5: Run role tests**

Run: `npm.cmd test -- tests/roles.test.js`

Expected: PASS.

## Task 2: Shared Auth Schema

**Files:**
- Create: `src/lib/schemas/auth.js`
- Create: `tests/authSchema.test.js`

- [ ] **Step 1: Write failing auth schema tests**

Create `tests/authSchema.test.js`:

```javascript
import { describe, expect, it } from 'vitest'
import { loginSchema } from '../src/lib/schemas/auth.js'

describe('loginSchema', () => {
  it('normaliza email y conserva password', () => {
    const result = loginSchema.safeParse({
      email: ' ADMIN@PLUARG.COM ',
      password: 'clave-segura-123',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      email: 'admin@pluarg.com',
      password: 'clave-segura-123',
    })
  })

  it('rechaza email invalido y password corto', () => {
    const result = loginSchema.safeParse({
      email: 'no-es-email',
      password: '123',
    })

    expect(result.success).toBe(false)
    expect(result.error.flatten().fieldErrors.email[0]).toBe('Ingresá un correo válido.')
    expect(result.error.flatten().fieldErrors.password[0]).toBe('Ingresá una contraseña de al menos 8 caracteres.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/authSchema.test.js`

Expected: FAIL because `src/lib/schemas/auth.js` does not exist.

- [ ] **Step 3: Create auth schema**

Create `src/lib/schemas/auth.js`:

```javascript
import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Ingresá un correo válido.'),
  password: z
    .string()
    .min(8, 'Ingresá una contraseña de al menos 8 caracteres.')
    .max(200, 'La contraseña es demasiado larga.'),
})
```

- [ ] **Step 4: Run auth schema tests**

Run: `npm.cmd test -- tests/authSchema.test.js`

Expected: PASS.

## Task 3: Harden Express Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/lib/errors.js`
- Create: `server/lib/validate.js`
- Create: `server/lib/security.js`
- Modify: `server/app.js`
- Create: `tests/api.security.test.js`

- [ ] **Step 1: Install dependencies**

Run: `npm.cmd install helmet express-rate-limit cookie-parser bcryptjs`

Expected: `package.json` and `package-lock.json` update.

- [ ] **Step 2: Write failing API security tests**

Create `tests/api.security.test.js`:

```javascript
import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

describe('api security baseline', () => {
  it('oculta x-powered-by y aplica headers basicos', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/health`)

    expect(response.headers.get('x-powered-by')).toBeNull()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')

    await target.close()
  })

  it('responde 404 json consistente', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/no-existe`)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Ruta no encontrada' })

    await target.close()
  })

  it('rechaza mutaciones cross-origin sin origen permitido', async () => {
    const target = listen(createApp())

    const response = await fetch(`${target.url}/api/payments/preferences`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    expect(response.status).toBe(403)

    await target.close()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm.cmd test -- tests/api.security.test.js`

Expected: FAIL because headers and 404/origin middleware are not implemented yet.

- [ ] **Step 4: Implement errors, validation, and security helpers**

Create `server/lib/errors.js`:

```javascript
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

export function notFoundHandler(_req, _res, next) {
  next(new HttpError(404, 'Ruta no encontrada'))
}

export function errorHandler(err, _req, res, _next) {
  const status = Number.isInteger(err.status) ? err.status : 500
  const message = status >= 500 ? 'Error interno' : err.message
  res.status(status).json({ error: message })
}
```

Create `server/lib/validate.js`:

```javascript
import { HttpError } from './errors.js'

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      next(new HttpError(400, Object.values(errors).flat()[0] || 'Datos inválidos', errors))
      return
    }
    req.validatedBody = result.data
    next()
  }
}
```

Create `server/lib/security.js`:

```javascript
import { HttpError } from './errors.js'

export function getAllowedOrigins() {
  return [process.env.APP_URL, process.env.VITE_APP_URL, 'http://localhost:5173']
    .filter(Boolean)
}

export function corsOrigin(origin, callback) {
  if (!origin || getAllowedOrigins().includes(origin)) {
    callback(null, true)
    return
  }
  callback(new HttpError(403, 'Origen no permitido'))
}

export function requireTrustedMutation(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next()
    return
  }

  const origin = req.get('origin')
  if (origin && !getAllowedOrigins().includes(origin)) {
    next(new HttpError(403, 'Origen no permitido'))
    return
  }

  next()
}
```

- [ ] **Step 5: Harden app middleware**

Update `server/app.js`:

```javascript
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import healthRoutes from './routes/health.js'
import paymentRoutes from './routes/payments.js'
import emailRoutes from './routes/emails.js'
import { errorHandler, notFoundHandler } from './lib/errors.js'
import { corsOrigin, requireTrustedMutation } from './lib/security.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: corsOrigin, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())
  app.use(requireTrustedMutation)
  app.use(healthRoutes)
  app.use('/api/payments', paymentRoutes)
  app.use('/api/emails', emailRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
```

- [ ] **Step 6: Run API security tests**

Run: `npm.cmd test -- tests/api.security.test.js tests/api.health.test.js`

Expected: PASS.

## Task 4: Backend Auth Services and Routes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `server/services/passwordService.js`
- Create: `server/services/sessionService.js`
- Create: `server/middleware/auth.js`
- Create: `server/routes/auth.js`
- Modify: `server/app.js`
- Create: `tests/api.auth.test.js`

- [ ] **Step 1: Write failing auth API tests with in-memory Prisma double**

Create `tests/api.auth.test.js`:

```javascript
import { describe, expect, it } from 'vitest'
import { createApp } from '../server/app.js'
import { hashPassword } from '../server/services/passwordService.js'

function listen(app) {
  const server = app.listen(0)
  const { port } = server.address()
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0]
}

function createPrismaDouble(users) {
  const sessions = []
  return {
    user: {
      findUnique: async ({ where }) => users.find((user) => user.email === where.email) ?? null,
      update: async ({ where, data }) => {
        const user = users.find((item) => item.id === where.id)
        Object.assign(user, data)
        return user
      },
    },
    session: {
      create: async ({ data }) => {
        const session = { id: `ses-${sessions.length + 1}`, ...data }
        sessions.push(session)
        return session
      },
      findUnique: async ({ where }) => {
        const session = sessions.find((item) => item.tokenHash === where.tokenHash)
        if (!session) return null
        return { ...session, user: users.find((user) => user.id === session.userId) }
      },
      updateMany: async ({ where, data }) => {
        sessions
          .filter((session) => session.tokenHash === where.tokenHash && session.revokedAt === where.revokedAt)
          .forEach((session) => Object.assign(session, data))
        return { count: 1 }
      },
    },
  }
}

describe('auth api', () => {
  it('inicia sesion, devuelve usuario seguro y permite consultar me', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        name: 'Admin PLU',
        role: 'admin_plu_arg',
        active: true,
      },
    ])
    const target = listen(createApp({ prisma }))

    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ email: ' ADMIN@PLUARG.COM ', password: 'clave-segura-123' }),
    })
    const body = await login.json()
    const cookie = cookieFrom(login)

    expect(login.status).toBe(200)
    expect(cookie).toMatch(/^plu_session=/)
    expect(body.user).toEqual({
      id: 'usr-1',
      email: 'admin@pluarg.com',
      name: 'Admin PLU',
      role: 'admin_plu_arg',
    })

    const me = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })
    expect(me.status).toBe(200)
    expect(await me.json()).toEqual({ user: body.user })

    await target.close()
  })

  it('rechaza password invalido y usuario inactivo con mensaje generico', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        name: 'Admin PLU',
        role: 'admin_plu_arg',
        active: false,
      },
    ])
    const target = listen(createApp({ prisma }))

    const response = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ email: 'admin@pluarg.com', password: 'incorrecta-123' }),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Credenciales invalidas.' })

    await target.close()
  })

  it('cierra sesion y me vuelve a responder 401', async () => {
    const prisma = createPrismaDouble([
      {
        id: 'usr-1',
        email: 'admin@pluarg.com',
        passwordHash: await hashPassword('clave-segura-123'),
        name: 'Admin PLU',
        role: 'admin_plu_arg',
        active: true,
      },
    ])
    const target = listen(createApp({ prisma }))

    const login = await fetch(`${target.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ email: 'admin@pluarg.com', password: 'clave-segura-123' }),
    })
    const cookie = cookieFrom(login)

    const logout = await fetch(`${target.url}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'http://localhost:5173' },
    })
    expect(logout.status).toBe(204)

    const me = await fetch(`${target.url}/api/auth/me`, { headers: { Cookie: cookie } })
    expect(me.status).toBe(401)

    await target.close()
  })
})
```

- [ ] **Step 2: Run auth API tests to verify failure**

Run: `npm.cmd test -- tests/api.auth.test.js`

Expected: FAIL because `createApp` does not accept auth dependencies and `/api/auth/*` does not exist.

- [ ] **Step 3: Add Prisma Session model**

Update `prisma/schema.prisma` with:

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  passwordHash String
  name         String
  role         UserRole  @default(operador_plu_arg)
  active       Boolean   @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  auditLogs    AuditLog[]
  sessions     Session[]
}

model Session {
  id        String    @id @default(cuid())
  tokenHash String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  userAgent String?
  ipHash    String?
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([userId])
  @@index([expiresAt])
}
```

- [ ] **Step 4: Implement password and session services**

Use `bcryptjs` for hashing and Node `crypto` for session tokens. Store only token hashes in DB.

- [ ] **Step 5: Implement auth middleware and routes**

Add `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`. Return only safe user fields.

- [ ] **Step 6: Wire auth route in app**

Update `server/app.js` to accept dependencies:

```javascript
export function createApp(deps = {}) {
  const app = express()
  const dependencies = { prisma: deps.prisma }
  // middleware...
  app.use('/api/auth', authRoutes(dependencies))
  // routes...
  return app
}
```

- [ ] **Step 7: Run auth API tests**

Run: `npm.cmd test -- tests/api.auth.test.js`

Expected: PASS.

## Task 5: Browser-Safe Env and API Client

**Files:**
- Modify: `src/config/env.js`
- Modify: `.env.example`
- Modify: `src/lib/api.js`
- Create: `tests/env.test.js`

- [ ] **Step 1: Write failing env test**

Create `tests/env.test.js` that reads `src/config/env.js` as text and asserts it does not contain `VITE_MERCADO_PAGO_ACCESS_TOKEN`, `VITE_BREVO_API_KEY`, `accessToken`, or `apiKey`.

- [ ] **Step 2: Run env test to verify failure**

Run: `npm.cmd test -- tests/env.test.js`

Expected: FAIL because the current browser env exposes private-key-shaped fields.

- [ ] **Step 3: Remove private client env fields**

Keep only public values in `src/config/env.js`:

```javascript
const appUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173'
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const env = {
  appUrl,
  apiUrl,
  isDev: import.meta.env.DEV,
  mercadoPago: {
    publicKey: import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY ?? '',
    configured: Boolean(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY),
  },
}
```

- [ ] **Step 4: Add credentials and mutation header to API client**

Update `src/lib/api.js` fetch options:

```javascript
const method = options.method ?? 'GET'
const mutationHeaders = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
  ? { 'X-PLU-Request': 'browser' }
  : {}

const response = await fetch(url, {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    ...mutationHeaders,
    ...(options.headers ?? {}),
  },
  ...options,
})
```

- [ ] **Step 5: Run env tests**

Run: `npm.cmd test -- tests/env.test.js`

Expected: PASS.

## Task 6: React Auth Wiring

**Files:**
- Modify: `src/hooks/useAppData.js`
- Modify: `src/App.jsx`
- Modify: `src/pages/LoginPage.jsx`
- Modify: `src/components/layout/AdminShell.jsx`

- [ ] **Step 1: Add auth API methods**

Add these functions near the exports in `src/lib/api.js`:

```javascript
export function loginRequest(credentials) {
  return apiPost('/api/auth/login', credentials)
}

export function meRequest() {
  return apiRequest('/api/auth/me')
}

export function logoutRequest() {
  return apiPost('/api/auth/logout', {})
}
```

- [ ] **Step 2: Replace admin demo login with form submission**

`LoginPage` should collect email/password for admin access. Demo athlete access can stay clearly separated for local showcase until athlete auth is designed.

- [ ] **Step 3: Use canonical admin roles**

`App.jsx` should route admin access with `canViewAdmin(app.role)`, not hardcoded `admin_plu`.

- [ ] **Step 4: Render current role label**

`AdminShell` should receive `roleLabel` and render it instead of hardcoded `Admin PLU`.

- [ ] **Step 5: Verify UI behavior**

Run: `npm.cmd test -- tests/roles.test.js tests/authSchema.test.js`

Expected: PASS.

## Task 7: Full Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run unit/API tests**

Run: `npm.cmd test`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm.cmd run build`

Expected: PASS.

- [ ] **Step 4: Scan bundle/source for private env leaks**

Run: `rg -n "VITE_MERCADO_PAGO_ACCESS_TOKEN|VITE_BREVO_API_KEY|MERCADO_PAGO_ACCESS_TOKEN|BREVO_API_KEY|accessToken|apiKey" src dist`

Expected: no private secret references in `src` browser code or `dist`.
