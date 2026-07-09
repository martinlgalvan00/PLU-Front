# PLU ARG / Maximal

Plataforma web de gestión para **Powerlifting United Argentina**, integrada con **Maximal**. Incluye sitio público, área de atletas, panel operativo y API backend.

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Vite 8 + React 19 + CSS modular con design tokens |
| API | Express 5 (`server/`) |
| Base de datos | PostgreSQL 16 + Prisma |
| Pagos | Mercado Pago Checkout Pro (adaptador + mock) |
| Emails | Brevo API (adaptador + mock) |
| Auth | Sesiones HTTP-only + Auth0 OAuth (opcional) |
| Tests | Vitest (16 suites) |
| Catálogo UI | Storybook 10 (68 stories) |

## Inicio rápido

```bash
cp .env.example .env
npm install
npm run dev          # solo frontend → http://localhost:5173
npm run dev:all      # frontend + API → http://localhost:3001
```

Base de datos local (opcional, requerida para tickets y auth real):

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

## Estado del proyecto

El proyecto está en **MVP avanzado**: la UI y la lógica de negocio están desarrolladas; parte de los datos vive en `localStorage` (demo) y otra en PostgreSQL (tickets, usuarios, sesiones).

| Área | Estado actual | Target |
|------|---------------|--------|
| Atletas, afiliaciones, inscripciones | `localStorage` + servicios frontend | PostgreSQL vía API |
| Entradas (Pitbull) | API real + Postgres | Producción con MP webhook |
| Auth atletas/admins | API con sesión + demo local | Solo API/OAuth |
| Pagos afiliación/inscripción | Mock + aprobación manual UI | MP Checkout Pro + webhook |
| Resultados | Archivo mock + filtros UI | Import LiftingCast |
| Records | Página placeholder | Tabla de récords oficiales |
| Admin: resultados/exports/audit | Placeholder | Secciones completas |

---

## Funcionalidades desarrolladas

### Sitio público

Navegación por vistas internas (sin router URL aún). Transiciones animadas entre páginas.

| Vista | Ruta lógica | Qué hace |
|-------|-------------|----------|
| **Home** | `home` | Hero, qué es PLU, spotlight Pitbull Classic, banda de afiliación, teasers de resultados y reglamento, comunidad, FAQ resumida |
| **Afiliación** | `members` | Planes, beneficios, requisitos, pasos anuales, FAQ; CTA según si el atleta está logueado |
| **Pitbull Classic** | `pitbull` | Landing del evento insignia: dossier, precios, beneficios, share card, compra de entradas (público, sin cuenta) |
| **Eventos** | `events` | Calendario, filtros por estado, detalle de evento, registro a Google Calendar / ICS, live stream, inscripción a competencia |
| **Resultados** | `results` | Archivo de eventos con búsqueda, filtros (publicados/borradores), ordenamiento, panel expandible por evento |
| **Records** | `records` | Página informativa + estado "próximamente" (sin datos de récords aún) |
| **Reglamento** | `rulebook` | Documento navegable por tabs: marco, peso, divisiones, equipamiento, levantamientos, etc. (ES/EN) |
| **Comunidad** | `community` | Stats, gimnasios afiliados, miembros recientes (datos mock desde servicios) |
| **FAQ** | `faq` | Preguntas frecuentes completas |
| **Contacto** | `contact` | Formulario de contacto + datos institucionales |
| **Registro** | `register` | Alta de atleta nuevo (flujo público de perfil) |
| **Login** | `login` | Email/contraseña, OAuth Auth0 (si está configurado), accesos demo |

**Extras transversales del sitio público:**

- Tema claro/oscuro (`ThemeToggle`)
- Internacionalización ES / EN (`I18nProvider`)
- Navbar con sesión (perfil, admin, logout)
- Footer con navegación secundaria
- Branding oficial PLU ARG (logo, emblema)

### Verificación por QR (pública)

| Vista | Qué hace |
|-------|----------|
| **CredentialPage** | Se abre al escanear el QR de afiliación, inscripción o entrada. Muestra veredicto visual (válida / revisar / inválida / usada). Para **entradas** consulta la API real y permite check-in en puerta |

### Área privada del atleta

Requiere rol `athlete_plu`.

| Vista | Qué hace |
|-------|----------|
| **Perfil** (`profile`) | Hero de cuenta, navegación por tabs |
| → Credencial QR | Código de miembro digital para verificación |
| → Próximos eventos | Eventos disponibles e inscripciones propias |
| → Historial | Inscripciones pasadas |
| → Afiliación | Compra/renovación de membresía |
| → Datos personales | Edición de perfil |
| → Seguridad | Info de sesión |
| **Afiliación** (`membership`) | Flujo de pago de membresía anual |
| **Inscripción** (`competition`) | Inscripción a evento seleccionado (valida duplicados) |

**Flujos de negocio del atleta:**

- Registro → creación de perfil
- Afiliación → orden de pago (`pendiente_pago` → aprobación)
- Inscripción a evento → orden de pago + estados (`borrador` → `confirmada`)
- Precios MVP en ARS: afiliación $38.000, juvenil $28.000, evento $45.000, combo $78.000

### Pitbull Classic — entradas

Compra pública sin cuenta, persistida en PostgreSQL.

- Selección de asistentes (hasta 8), DNI, pase por día (`day1` / `day2` / `both`)
- Add-ons opcionales
- Proveedores: `mock`, `mercado_pago`, `manual`
- Subida de comprobante de transferencia (órdenes manuales)
- Generación de tickets con QR token
- Check-in en puerta (único por ticket, constraint en DB)
- Canje de add-ons en evento
- Share card del evento (descarga visual)

### Panel administrativo

Requiere rol con `canViewAdmin`. Shell propio (`AdminShell`) con búsqueda global y badges de pendientes.

| Sección | Estado | Funcionalidad |
|---------|--------|---------------|
| **Dashboard** | ✅ | KPIs, acciones pendientes (pagos, órdenes), actividad reciente, búsqueda global |
| **Atletas** | ✅ | Listado + ficha detalle con historial, pagos y auditoría |
| **Afiliaciones** | ✅ | Membresías enriquecidas, navegación a atleta |
| **Inscripciones** | ✅ | Tabla filtrable (estado, evento, búsqueda), aprobación de pagos, export CSV |
| **Eventos** | ✅ | CRUD de eventos admin, capacidad, estados, tickets asociados |
| **Check-in** | ✅ | Escaneo/manual de inscripciones y entradas, canje de add-ons |
| **Usuarios** | ✅ | Alta y cambio de rol (solo admins con permiso) |
| **Pagos entradas** | ✅ | Órdenes manuales pendientes, aprobación, refresh desde API |
| **PLU USA** | ✅ | Vista restringida para partner: lectura + export CSV autorizado |
| **Resultados** | 🔜 | Placeholder |
| **Exportaciones** | 🔜 | Placeholder |
| **Auditoría** | 🔜 | Placeholder (logs ya se generan en operaciones sensibles) |

### Roles y permisos

| Rol | Permisos |
|-----|----------|
| `admin_maximal` | Acceso total |
| `admin_plu_arg` | Operación completa + gestión de usuarios |
| `operador_plu_arg` | Operación sin gestión de usuarios |
| `seguridad_plu_arg` | Check-in |
| `plu_usa` | Solo lectura + exportación PLU USA |
| `athlete_plu` | Perfil, afiliación, inscripciones |

La lógica de permisos vive en `src/lib/roles.js` y se aplica en UI y middleware del servidor.

---

## API backend (`server/`)

| Ruta | Endpoints principales |
|------|----------------------|
| `/api/health` | Health check |
| `/api/auth` | `POST /login`, `GET /me`, `POST /oauth/session`, `POST /logout` |
| `/api/tickets` | Órdenes, tickets, check-in, comprobantes, add-ons |
| `/api/payments` | Workflow de pagos (eventos de integración) |
| `/api/emails` | Workflow de notificaciones (Brevo) |

**Seguridad:** Helmet, CORS con credenciales, rate limit en login, cookies HTTP-only, validación Zod, roles en rutas sensibles.

**Workflows de integración:** eventos idempotentes (`IntegrationEvent` / `IntegrationAttempt`) para pagos y emails, con store en memoria en MVP y contrato Prisma listo para persistencia.

---

## Servicios frontend (`src/services/`)

| Servicio | Responsabilidad |
|----------|-----------------|
| `athleteService` | Perfil, afiliación, inscripción, check-in, aprobación de pagos |
| `membershipService` | Enriquecimiento de membresías |
| `ticketApi` / `ticketService` | Cliente API de entradas |
| `ticketProofService` | Subida de comprobantes |
| `eventAdminService` | CRUD eventos admin |
| `adminService` | Dashboard, badges, actividad, auditoría |
| `exportService` | CSV admin y PLU USA |
| `userService` | Usuarios del panel |
| `resultsService` | Archivo y filtros de resultados |
| `rulebookContentService` | Contenido del reglamento por locale |
| `communityService` | Stats y gimnasios |
| `paymentService` | Adaptador Mercado Pago (mock/real) |
| `emailService` | Adaptador Brevo (mock/real) |
| `eventCardService` | Generación de cards visuales |
| `checkinScanService` | Lógica de escaneo |
| `storageService` | Persistencia localStorage del MVP |

---

## Diseño y UX

- **Design tokens** en `src/styles/variables.css` (colores, tipografía, espaciado)
- **Temas** claro y oscuro (`src/styles/themes/`)
- **Animaciones** con `Reveal`, `StaggerReveal`, `PageTransition`
- **i18n** completo ES/EN en `src/i18n/` + contenido editorial en `src/lib/content/`
- **Storybook** con 68 stories de componentes UI y layout
- **Design sync** vía `.design-sync/` para publicar componentes a claude.ai/design

```bash
npm run storybook        # http://localhost:6006
npm run build-storybook
```

---

## Base de datos (Prisma)

Modelos definidos en `prisma/schema.prisma`:

- **Auth:** `User`, `UserIdentity`, `UserProfile`, `Session`, preferencias
- **Dominio:** `Athlete`, `Membership`, `Event`, `EventRegistration`
- **Ticketing:** `TicketOrder`, `Ticket`, `CheckIn`
- **Pagos:** `PaymentOrder`, `Payment`, `PaymentAllocation`
- **Integraciones:** `IntegrationEvent`, `IntegrationAttempt`
- **Operación:** `LiftingResult`, `ExportJob`, `EmailLog`, `AuditLog`

---

## Tests

```bash
npm run test
```

Cobertura actual: auth API, OAuth, roles, validación, servicios de atleta, i18n, seguridad, schema Prisma, workflows de integración, health check.

---

## Estructura del repo

```
src/
  components/   UI (layout + ui/)
  pages/        Vistas públicas, admin y perfil
  hooks/        useAppData (estado global), useContent
  services/     Negocio + adaptadores
  lib/          Constantes, roles, navegación, formatos
  i18n/         Internacionalización
  styles/       CSS modular con tokens
server/         API Express + workflows
prisma/         Schema y seed
agent-skills/   14 skills internas para agentes
docs/           Arquitectura, reglas de negocio, diseño
tests/          Tests unitarios e integración API
.storybook/     Configuración Storybook
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Frontend dev (Vite) |
| `npm run dev:api` | Solo API Express |
| `npm run dev:all` | Frontend + API en paralelo |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm run test` | Tests (Vitest) |
| `npm run test:watch` | Tests en modo watch |
| `npm run lint` | Oxlint |
| `npm run format` | Prettier |
| `npm run db:up` | PostgreSQL en Docker |
| `npm run db:migrate` | Migraciones Prisma |
| `npm run db:seed` | Seed de datos |
| `npm run db:studio` | Prisma Studio |
| `npm run storybook` | Catálogo de componentes |
| `npm run design:import` | Importar diseño desde Claude |
| `npm run design:extract` | Extraer referencia de diseño |

## Documentación

- [Setup](./docs/SETUP.md)
- [Arquitectura](./docs/ARCHITECTURE.md)
- [Reglas de negocio](./docs/BUSINESS_RULES.md)
- [UX/UI Guidelines](./docs/UX_UI_GUIDELINES.md)
- [Design Facelift Spec](./docs/DESIGN_FACELIFT_SPEC.md)
- [Agent Skills](./agent-skills/) — guías para agentes de código

## Cuentas demo (desarrollo)

En login, sin API configurada:

| Email | Rol |
|-------|-----|
| `demo` / `demo@pluarg.com.ar` | Atleta (sin afiliación, para probar flujo completo) |
| `admin` | Admin PLU ARG |
| `plu-usa` | Partner PLU USA |

Con API + seed, usar las credenciales definidas en `prisma/seed.js`.

## Licencia

Privado — PLU ARG / Maximal
