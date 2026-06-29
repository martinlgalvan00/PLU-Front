# PLU ARG / Maximal

Plataforma de gestión para Powerlifting United Argentina, integrada con Maximal.

## Stack

- **Vite 8** + **React 19** + **CSS modular**
- **Express** (API scaffold)
- **PostgreSQL** + **Prisma**
- **Vitest** para tests

## Inicio rápido

```bash
cp .env.example .env
npm install
npm run dev
```

Abrir http://localhost:5173

## Documentación

- [Setup](./docs/SETUP.md)
- [Arquitectura](./docs/ARCHITECTURE.md)
- [Reglas de negocio](./docs/BUSINESS_RULES.md)
- [Agent Skills](./agent-skills/) — guías para agentes de código

## Estructura

```
src/
  components/   UI (layout, cards, forms)
  pages/        Vistas públicas y panel admin
  hooks/        Estado React
  services/     Negocio + integraciones (MP, Brevo, exports)
  lib/          Constantes, roles, utilidades
  styles/       CSS con design tokens
server/         API Express
prisma/         Schema PostgreSQL
agent-skills/   14 skills internas
docs/           Documentación técnica
tests/          Tests unitarios
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Frontend dev |
| `npm run dev:all` | Frontend + API |
| `npm run build` | Build producción |
| `npm run test` | Tests |
| `npm run db:up` | PostgreSQL Docker |

## Roles MVP

- Admin Maximal / PLU ARG — edición completa
- Operador PLU ARG — operación sin gestión de usuarios
- PLU USA — solo lectura y exportación

## Licencia

Privado — PLU ARG / Maximal
