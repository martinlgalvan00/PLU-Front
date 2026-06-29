# Auth & RBAC — PLU ARG

## Objetivo

Definir y aplicar el modelo de **roles y permisos (RBAC)** del panel PLU ARG: quién puede editar datos, aprobar pagos, gestionar usuarios y exportar consolidados PLU USA. Preparar el terreno para autenticación real en backend sin romper el MVP con selector de rol en demo.

## Cuándo usarla

- Agregar botones o acciones en `AdminPage.jsx`.
- Implementar guards en hooks o servicios.
- Diseñar endpoints protegidos en `server/`.
- Crear modelo `User` y sesiones en Prisma.
- Cuando un agente exponga datos sensibles sin verificar rol.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Rol actual | Una de las 4 claves en `ROLES` |
| Acción solicitada | editar, exportar, aprobar pago, gestionar usuarios |
| Funciones RBAC | `src/lib/roles.js` |
| Enum Prisma | `UserRole` en schema |

## Salidas esperadas

- UI y API que ocultan o deshabilitan acciones no permitidas.
- Funciones puras `can*` reutilizables en frontend y (futuro) middleware backend.
- Usuario autenticado con `role` persistido en sesión/JWT (fase futura).
- `viewer_plu_usa` limitado a lectura + export PLU USA.

## Procedimiento paso a paso

### 1. Roles del sistema

Definidos en `src/lib/constants.js` → `ROLES` y en Prisma `enum UserRole`:

| Rol | Clave | canEdit | canManageUsers | Uso |
|-----|-------|---------|----------------|-----|
| Admin Maximal | `admin_maximal` | ✅ | ✅ | Superadmin federación |
| Admin PLU ARG | `admin_plu_arg` | ✅ | ✅ | Operación completa Argentina |
| Operador PLU ARG | `operador_plu_arg` | ✅ | ❌ | Día a día sin usuarios |
| PLU USA lectura | `viewer_plu_usa` | ❌ | ❌ | Export y consulta |

### 2. API de permisos (`src/lib/roles.js`)

```javascript
canEdit(role)           // mutaciones de datos
canManageUsers(role)    // CRUD usuarios
canExport(role)         // cualquier export
canExportPluUsa(role)   // export consolidado USA (también viewers)
canApprovePayments(role) // alias de canEdit hoy
```

**Regla:** toda acción destructiva o de aprobación debe consultar estas funciones, no comparar strings sueltos.

### 3. Estado actual (MVP demo)

- `useAppData.js` mantiene `role` en `useState('admin_maximal')`.
- `AdminPage` expone `<select>` para cambiar rol (solo demo; **no es seguridad**).
- `userCanEdit = canEdit(role)` controla botones de export admin y aprobación.

### 4. Roadmap auth backend (fase futura)

```
┌─────────────┐     POST /api/auth/login      ┌─────────────┐
│   React     │ ──────────────────────────────►│   Express   │
│  (cookie/   │ ◄──────────────────────────────│  + Prisma   │
│   JWT)      │     { user, role, token }      │  User model │
└─────────────┘                                └─────────────┘
```

**Pasos de implementación:**

1. **Modelo:** `User` en Prisma ya existe (`email`, `passwordHash`, `role`, `active`).
2. **Hash:** bcrypt o argon2 en `server/` — nunca guardar password plano.
3. **Sesión:** HTTP-only cookie o JWT con `AUTH_SECRET` de `.env`.
4. **Middleware:** `requireRole(['admin_plu_arg', ...])` en rutas sensibles.
5. **Frontend:** reemplazar selector demo por login; propagar rol desde `/api/auth/me`.
6. **Quitar** simulación de rol en producción.

### 5. Matriz de permisos por feature

| Feature | admin_maximal | admin_plu_arg | operador_plu_arg | viewer_plu_usa |
|---------|:-------------:|:-------------:|:----------------:|:--------------:|
| Ver dashboard | ✅ | ✅ | ✅ | ✅ |
| Filtrar inscripciones | ✅ | ✅ | ✅ | ✅ |
| Aprobar pagos | ✅ | ✅ | ✅ | ❌ |
| Export CSV admin | ✅ | ✅ | ✅ | ❌ |
| Export PLU USA | ✅ | ✅ | ✅ | ✅ |
| Gestionar usuarios | ✅ | ✅ | ❌ | ❌ |
| Import resultados | ✅ | ✅ | ✅ | ❌ |

### 6. Integrar en componentes

```jsx
// AdminPage.jsx — patrón actual
<button disabled={!canEdit} onClick={onExportAdmin}>...</button>
<button onClick={onExportPluUsa}>...</button>  // canExportPluUsa en hook
```

En `useAppData.js`, derivar flags:

```javascript
const userCanEdit = canEdit(role)
const userCanExportPluUsa = canExportPluUsa(role)
```

## Validaciones

- `viewer_plu_usa` no puede llamar `handleApprovePayment` ni mutar estado.
- Tests en `tests/roles.test.js` cubren cada función `can*`.
- Endpoints futuros devuelven `403` sin rol suficiente.
- Password nunca en logs ni en respuestas API.
- Usuario `active: false` no puede autenticarse.

## Errores comunes

| Error | Riesgo | Mitigación |
|-------|--------|------------|
| Confiar en `disabled` solo en UI | Bypass vía consola | Validar en backend |
| Rol en localStorage sin firmar | Spoofing | JWT/sesión server-side |
| Hardcodear `'admin_maximal'` | Permisos incorrectos | Usar `canEdit(role)` |
| Exponer `passwordHash` | Filtración | Select explícito en Prisma |
| Selector de rol en producción | Cualquiera es admin | Remover en build prod |

## Checklist de aceptación

- [ ] Permisos centralizados en `roles.js`
- [ ] Admin UI respeta `canEdit` / `canExportPluUsa`
- [ ] Tests de roles actualizados
- [ ] Documentado en `docs/BUSINESS_RULES.md` si cambian roles
- [ ] (Futuro) Login + middleware en `server/`
- [ ] (Futuro) Sin selector de rol en producción

## Referencias oficiales

- [OWASP — Authorization](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing)
- [Express middleware patterns](https://expressjs.com/en/guide/using-middleware.html)
- Prisma `UserRole` enum: `prisma/schema.prisma`

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/lib/roles.js` | Funciones can* |
| `src/lib/constants.js` | Definición `ROLES` |
| `src/hooks/useAppData.js` | Estado `role`, flags derivados |
| `src/pages/AdminPage.jsx` | UI condicionada por permisos |
| `prisma/schema.prisma` | `User`, `UserRole`, `AuditLog` |
| `tests/roles.test.js` | Tests unitarios RBAC |
| `.env.example` | `AUTH_SECRET` |
| `server/index.js` | Futuro middleware auth |
