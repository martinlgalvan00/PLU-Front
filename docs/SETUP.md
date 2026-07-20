# Setup — PLU ARG / Maximal

## Requisitos

- Node.js 20+
- npm 10+
- Un proyecto Supabase y su URL PostgreSQL de Session Pooler

## Instalación

```bash
git clone https://github.com/martinlgalvan00/PLU-Front.git
cd PLU-Front
cp .env.example .env
npm install
```

## Desarrollo

```bash
# Único comando: prepara ambas bases, verifica y levanta toda la aplicación
npm run dev

# Opcional: sólo preparar/migrar/verificar, sin dejar servidores abiertos
npm run setup:all
```

Frontend: http://localhost:5173  
API: http://localhost:3001/health

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Migra Prisma y Supabase, verifica y levanta Vite + Express |
| `npm run setup:all` | Migra y verifica ambas bases sin levantar la app |
| `npm run build` | Build producción |
| `npm run lint` | Oxlint |
| `npm run test` | Vitest |
| `npm run db:migrate` | Migraciones de datos sobre Supabase |
| `npm run db:seed` | Seeds (cuando existan) |

## Por qué existe la API

Supabase provee PostgreSQL, Auth, Storage y RPCs, pero la aplicación conserva
Express como frontera de seguridad. El navegador nunca recibe la Secret API Key:
Express valida cookies, roles y propiedad de los datos; crea URLs firmadas de
Storage; calcula montos autoritativos; y procesa webhooks, pagos y reintentos.

El flujo es:

```text
React/Vite -> API Express -> Supabase
                    |-> Mercado Pago
                    |-> Brevo
```

`npm run dev` mantiene ambos procesos visibles bajo un solo comando y
`Ctrl+C` los cierra juntos.

No se inicia PostgreSQL local ni se necesita Docker. Las tablas transaccionales
viven en `public`; Prisma comparte la misma base Supabase en el schema aislado
`plu_prisma` para usuarios, roles y sesiones.

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
