# Setup — PLU ARG / Maximal

## Requisitos

- Node.js 22 (ver `.nvmrc`; también sirve 24+)
- npm 10+
- Un proyecto Supabase y su URL PostgreSQL de Session Pooler

## Instalación

```bash
git clone https://github.com/martinlgalvan00/PLU-Front.git
cd PLU-Front
cp .env.example .env
npm install
```

Si cambiaste `package.json`, **siempre** regenerá y commiteá el lock en el
mismo cambio:

```bash
npm install
npm run lock:check   # misma validación que usa CI antes de npm ci
git add package.json package-lock.json
```

CI usa `npm ci` (instalación reproducible). Si el lock está desfasado, el job
falla a propósito: no reemplaces `npm ci` por `npm install` en el workflow.

## Desarrollo

```bash
# Día a día: frontend (Vite) + API Express contra Supabase remoto
npm run dev

# Solo frontend (si la API ya está corriendo en otra terminal)
npm run dev:web

# Solo API
npm run dev:api

# Primera vez o tras cambios de schema: migra, verifica y levanta todo
npm run setup:all
npm run dev

# Diagnóstico rápido de integración Supabase
npm run supabase:diagnose
```

En Windows, el CLI de Supabase a veces falla con `uv_spawn`: el bootstrap
reintenta automáticamente y **nunca imprime** la connection string completa.
Si el stack ya está al día, preferí `dev` / `dev:services` o
`BOOTSTRAP_SKIP_MIGRATIONS=1 npm run dev:all`.

Frontend: http://localhost:5173  
API: http://localhost:3001/health  
Ready: http://localhost:3001/ready

Si el 3001 está ocupado por otro proyecto, definí `PORT=3003` (u otro libre)
en `.env`. Vite proxyea `/api` al mismo `PORT`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Solo frontend (Vite) |
| `npm run setup:all` | Migra y verifica ambas bases sin levantar la app |
| `npm run dev:services` | Levanta Vite + Express sin migrar |
| `npm run dev:all` | Migra Prisma y Supabase, verifica y levanta Vite + Express |
| `npm run build` | Build producción |
| `npm run lint` | Oxlint |
| `npm run test` | Vitest |
| `npm run test:check` | Lint + tests unitarios/Storybook + build |
| `npm run test:integration` | Integración contra Supabase (local en CI) |
| `npm run db:migrate` | Migraciones de datos sobre Supabase |
| `npm run db:seed` | Seeds (cuando existan) |
| `npm run db:verify:payments` | Smoke SQL de la state machine de pagos |
| `npm run supabase:assert` | Ping rápido admin a `events` |
| `npm run email:doctor` | Diagnóstico live Brevo (sin `--send`) |
| `npm run mercado-pago:doctor` | Ping live del Access Token de Mercado Pago |
| `npm run mercado-pago:urls` | Imprime webhooks DEV/PROD y verifica que respondan en público |

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

`npm run dev:services` o `npm run dev:all` mantienen ambos procesos visibles
bajo un solo comando y `Ctrl+C` los cierra juntos. Para UI sin API alcanza
`npm run dev`.

No se inicia PostgreSQL local ni se necesita Docker. Las tablas transaccionales
viven en `public`; Prisma comparte la misma base Supabase en el schema aislado
`plu_prisma` para usuarios, roles y sesiones.

## Variables de entorno

Ver `.env.example`. Nunca commitear `.env` con credenciales reales.

### Gate de cobros (`PAID_CHECKOUT_ENABLED` + admin)

Con `APP_PRODUCTION=true` (Vercel Production), afiliación, inscripción, combo y
entradas quedan cerrados (“Próximamente”) hasta `PAID_CHECKOUT_ENABLED=true`.
La fecha **Abre la inscripción** del evento en el panel (`registration_opens_at`)
sigue alimentando el countdown de marketing; no abre Mercado Pago.

Kill switch: `PAID_CHECKOUT_ENABLED=false` corta cobros también en local;
`=true` es el único interruptor que abre cobros en producción.

Los emails del teaser “avísame al abrir” van a `launch_interest` (migración
`supabase/migrations/20260814100000_launch_interest.sql`). Listar:

```sql
select email, source, event_slug, created_at
from launch_interest
order by created_at desc;
```

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
