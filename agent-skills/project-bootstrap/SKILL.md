# Project Bootstrap — PLU ARG / Maximal

## Objetivo

Dejar el entorno de desarrollo de **PLU-Front** listo para trabajar: dependencias instaladas, variables de entorno configuradas, servicios opcionales (PostgreSQL vía Docker), scripts de `package.json` verificados y pipeline mínimo (`build`, `lint`, `test`) pasando sin errores.

## Cuándo usarla

- Clonar el repo por primera vez en una máquina nueva (Windows, macOS o Linux).
- Después de cambios en `package.json`, `docker-compose.yml`, `vite.config.js` o `prisma/schema.prisma`.
- Cuando un agente reporta errores de módulos faltantes, puertos ocupados o base de datos inaccesible.
- Antes de implementar features que dependan del backend scaffold (`server/`) o de Prisma.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Node.js 20+ | Runtime obligatorio |
| npm 10+ | Gestor de paquetes del proyecto |
| Docker Desktop | Opcional; necesario solo si se usa PostgreSQL local |
| Repo clonado | `PLU-Front` en disco local |
| `.env` | Copiado desde `.env.example` y ajustado |

## Salidas esperadas

- `node_modules/` instalado sin errores.
- `.env` presente (no commiteado).
- Frontend accesible en `http://localhost:5173`.
- API scaffold respondiendo en `http://localhost:3001/health` (si se levanta).
- PostgreSQL en `localhost:5432` (si se usa `npm run db:up`).
- `npm run build`, `npm run lint` y `npm run test` exitosos.

## Procedimiento paso a paso

### 1. Verificar prerequisitos

```powershell
node -v    # >= 20
npm -v     # >= 10
docker -v  # opcional
```

### 2. Instalar dependencias

```powershell
cd c:\Users\agusd\OneDrive\Escritorio\Hobbie\PLU-Front
npm install
```

### 3. Configurar entorno

```powershell
Copy-Item .env.example .env
```

Revisar al menos:

- `VITE_APP_URL=http://localhost:5173`
- `VITE_API_URL=http://localhost:3001`
- `DATABASE_URL=postgresql://plu:plu_dev@localhost:5432/plu_arg`

**Nunca** commitear `.env` con tokens reales de Mercado Pago o Brevo.

### 4. Levantar servicios

**Solo frontend (MVP actual con localStorage):**

```powershell
npm run dev
```

**Frontend + API scaffold:**

```powershell
npm run dev:all
```

**PostgreSQL (futuro backend persistente):**

```powershell
npm run db:up
npm run db:generate
npm run db:migrate
# npm run db:seed   # cuando exista prisma/seed.js
```

### 5. Validar pipeline

```powershell
npm run lint
npm run test
npm run build
```

### 6. Smoke test manual

1. Abrir `http://localhost:5173`.
2. Navegar Inicio → Registro → generar orden de prueba.
3. Ir al panel Admin y verificar métricas y tabla.
4. Si API levantada: `curl http://localhost:3001/health`.

## Validaciones

| Comando | Criterio de éxito |
|---------|-------------------|
| `npm run dev` | Vite sin errores de compilación |
| `npm run build` | `dist/` generado |
| `npm run lint` | Oxlint sin errores en `src/` y `server/` |
| `npm run test` | Vitest: todos los tests en verde |
| `npm run db:up` | Container `plu-arg-postgres` healthy |
| `GET /health` | JSON `{ status: "ok", service: "plu-arg-api" }` |

## Errores comunes

| Error | Causa probable | Solución |
|-------|----------------|----------|
| `EADDRINUSE :5173` | Puerto ocupado | Matar proceso o cambiar puerto en Vite |
| `Cannot find module` | `npm install` incompleto | Borrar `node_modules` y reinstalar |
| Prisma `P1001` | Postgres no levantado | `npm run db:up` y esperar healthcheck |
| Docker no inicia en Windows | WSL2 / Hyper-V | Habilitar virtualización y reiniciar Docker Desktop |
| Tests fallan en jsdom | Import ESM mal resuelto | Revisar `vitest.config.js` y extensiones `.js` |
| `.env` ignorado por Vite | Variable sin prefijo `VITE_` | Solo `VITE_*` expuestas al frontend |

## Checklist de aceptación

- [ ] `npm install` sin warnings críticos
- [ ] `.env` creado desde `.env.example`
- [ ] `npm run dev` levanta el frontend
- [ ] `npm run lint` pasa
- [ ] `npm run test` pasa
- [ ] `npm run build` genera `dist/`
- [ ] (Opcional) Postgres healthy y Prisma client generado
- [ ] (Opcional) `npm run dev:all` con `/health` OK

## Referencias oficiales

- [Vite — Getting Started](https://vite.dev/guide/)
- [React 19 docs](https://react.dev/)
- [Prisma — Quickstart](https://www.prisma.io/docs/getting-started)
- [Docker Compose](https://docs.docker.com/compose/)
- [Vitest](https://vitest.dev/guide/)
- [Oxlint](https://oxc.rs/docs/guide/usage/linter.html)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `package.json` | Scripts y dependencias |
| `vite.config.js` | Configuración Vite + React |
| `vitest.config.js` | Configuración de tests |
| `docker-compose.yml` | PostgreSQL 16 local |
| `.env.example` | Plantilla de variables |
| `index.html` | Entry HTML de Vite |
| `src/main.jsx` | Bootstrap React |
| `server/index.js` | API Express scaffold |
| `prisma/schema.prisma` | Modelo de datos |
| `docs/SETUP.md` | Guía humana de instalación |
