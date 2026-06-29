# Setup — PLU ARG / Maximal

## Requisitos

- Node.js 20+
- npm 10+
- Docker Desktop (opcional, para PostgreSQL)

## Instalación

```bash
git clone https://github.com/martinlgalvan00/PLU-Front.git
cd PLU-Front
cp .env.example .env
npm install
```

## Desarrollo

```bash
# Solo frontend
npm run dev

# Frontend + API scaffold
npm run dev:all

# Base de datos local
npm run db:up
```

Frontend: http://localhost:5173  
API: http://localhost:3001/health

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Build producción |
| `npm run lint` | Oxlint |
| `npm run test` | Vitest |
| `npm run db:up` | PostgreSQL en Docker |
| `npm run db:migrate` | Migraciones Prisma |
| `npm run db:seed` | Seeds (cuando existan) |

## Variables de entorno

Ver `.env.example`. Nunca commitear `.env` con credenciales reales.

## Estructura

```
src/
  components/   # UI reutilizable
  pages/        # Vistas por ruta lógica
  hooks/        # Estado React
  services/     # Lógica de negocio e integraciones
  lib/          # Constantes, roles, format
  styles/       # CSS modular
server/         # API Express (scaffold)
prisma/         # Schema PostgreSQL
agent-skills/   # Skills para agentes
docs/           # Documentación
tests/          # Tests unitarios
```
