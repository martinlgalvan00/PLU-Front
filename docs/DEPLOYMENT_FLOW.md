# Flujo de CI/CD — DEV y PROD

## Objetivo

El proyecto mantiene dos destinos públicos y estables:

| Entorno | Rama fuente | Propósito                                         | Publicación                                                  |
| ------- | ----------- | ------------------------------------------------- | ------------------------------------------------------------ |
| DEV     | `dev`       | Aceptación, QA y revisión de los próximos cambios | Automática después de integrar un PR aprobado                |
| PROD    | `main`      | Sitio oficial                                     | Automática después de promover `dev` mediante un PR aprobado |

Vercel conserva una versión inmutable por deployment para auditoría y rollback.
Eso no significa que existan más entornos activos: las URLs estables de DEV y
PROD siempre deben apuntar a la última versión aceptada de su rama.

## Flujo obligatorio

```text
feature/<cambio>
       │
       └── PR hacia dev
             ├── CI application
             ├── CI supabase-integration
             └── aprobación humana
                    │
                    └── merge squash
                           └── Vercel actualiza DEV
                                  │
                                  ├── QA funcional
                                  ├── QA visual
                                  └── aceptación
                                         │
                                         └── PR dev hacia main
                                                ├── CI completo
                                                ├── aprobación de release
                                                └── merge
                                                       └── Vercel actualiza PROD
```

No se trabaja directamente sobre `dev` ni `main`. Los commits de trabajo viven
en ramas `feature/*`, `fix/*` o `chore/*`. Esas ramas no generan deployments de
Vercel porque `vercel.json` las deshabilita.

## Compuertas de calidad

Todo PR hacia `dev` o `main` debe aprobar:

1. `application`
   - Node según `.nvmrc`;
   - instalación reproducible con `npm ci` (falla con mensaje claro si el lock
     está desfasado; localmente: `npm run lock:check`);
   - lint;
   - tests unitarios y Storybook en Chromium;
   - build de producción;
   - validación del schema Prisma.
2. `supabase-integration`
   - Supabase local limpio;
   - aplicación completa de migraciones y seed;
   - lint de schemas;
   - assert de conectividad (`npm run supabase:assert`);
   - tests de integración contra la base real;
   - smoke transaccional de pagos.
3. Revisión humana y resolución de conversaciones.

En `push` a `dev`/`main` (y `workflow_dispatch`) corre además `integrations-live`:

- Secrets opcionales por ahora: `MERCADO_PAGO_ACCESS_TOKEN`, `BREVO_API_KEY`,
  `BREVO_SENDER_EMAIL` (sandbox/DEV). Si faltan, el job emite **warning** y
  omite el smoke live; no bloquea el CI.
- Con secrets cargados: `npm run mercado-pago:doctor` (ping `/users/me`, sin
  cobrar) y `npm run email:doctor` (sin `--send`).

El workflow `Deployment smoke` exige `/api/health` **y** `/api/ready`
(`checks.prisma` + `checks.supabase`) sobre la URL del deploy.

Las ejecuciones anteriores de la **misma rama y el mismo tipo de evento**
(`push` o `pull_request`) se cancelan cuando llega un commit nuevo. Un push a
`dev` también sincroniza el PR permanente `dev -> main`: los dos eventos corren
en grupos separados para que uno no cancele al otro (si no, GitHub muestra el
commit en rojo por checks `cancelled`). En el `push` a `dev` solo corre
`integrations-live`; `application` y `supabase-integration` los cubre el PR.

## Configuración única en GitHub

Un administrador del repositorio debe proteger ambas ramas desde
`Settings > Rules > Rulesets` o `Settings > Branches`.

### Regla para `dev`

- Requerir pull request antes de mergear.
- Requerir al menos una aprobación.
- Descartar aprobaciones cuando cambia el PR.
- Requerir conversaciones resueltas.
- Requerir los checks `application` y `supabase-integration`.
- Bloquear force-push y eliminación.
- Usar squash merge para que cada cambio aceptado produzca una sola integración.

### Regla para `main`

- Aplicar todos los controles de `dev`.
- Aceptar promociones solamente desde `dev`.
- Requerir una aprobación de release distinta del autor cuando el equipo lo permita.
- No permitir bypass de las reglas salvo recuperación operativa.

GitHub no permite expresar “el PR debe venir exclusivamente desde `dev`” con la
protección clásica. Esa condición se sostiene con revisión y puede automatizarse
después con un check específico si el equipo incorpora más ramas de release.

## Configuración única en Vercel

1. En `Project Settings > Environments > Production > Branch Tracking`,
   confirmar `main` como rama de producción.
2. Asignar el dominio oficial al entorno Production.
3. Asignar un dominio estable de aceptación a la rama `dev`, por ejemplo
   `dev.<dominio-oficial>`.
4. Separar variables:
   - Production: Supabase, API, Auth0 y Mercado Pago productivos.
   - Preview con rama `dev`: credenciales de sandbox/staging.
5. No reutilizar secretos productivos en DEV.
6. Activar `Automatically expose System Environment Variables`; la API usa la
   URL oficial en Production y la URL estable de rama en `dev`.

### Matriz de variables

Crear dos proyectos Supabase. En Vercel, cargar la siguiente matriz:

| Variable | Production (`main`) | Preview, sólo rama `dev` |
| --- | --- | --- |
| `SUPABASE_URL` | proyecto PROD | proyecto DEV |
| `SUPABASE_SERVICE_ROLE_KEY` | secreto PROD | secreto DEV |
| `SUPABASE_DATABASE_URL` | pooler PROD | pooler DEV |
| `VITE_SUPABASE_URL` | proyecto PROD | proyecto DEV |
| `VITE_SUPABASE_ANON_KEY` | publishable PROD | publishable DEV |
| `AUTH_SECRET` | aleatorio PROD | aleatorio DEV |
| `CRON_SECRET` | aleatorio PROD | aleatorio DEV |
| Mercado Pago/Brevo/Auth0 | productivos | sandbox/staging |
| `SESSION_COOKIE_SECURE` | `true` | `true` |
| `VITE_DEMO_MODE` | `false` | opcional `true` para QA |

`VITE_API_URL` queda vacío en Vercel: frontend y API comparten origen. No cargar
secretos sin prefijo `VITE_` en variables cliente. Aplicar todas las migraciones
en ambos Supabase antes de considerar `/api/ready` aprobado.

En Hobby, Vercel ejecuta una vez por día la recuperación de pagos, la
revalidación de pagos, los avisos de renovación y el ciclo de vida de cuentas
de seguridad. Es el máximo de frecuencia del plan gratuito. Recuperación y
revalidación de pagos no dependen solo de esa corrida diaria: los workflows
`.github/workflows/payment-recovery-cron.yml` (cada 15 min) y
`payment-revalidation-cron.yml` (cada hora) disparan los mismos endpoints
autenticados desde afuera, así que el cron nativo de Vercel queda como red de
contención mínima, no como única pasada del día. Si la operación exige más
frecuencia todavía, se puede pasar a Pro sin cambiar endpoints. Las
expiraciones que liberan cupos no esperan ningún cron: corren cada minuto
dentro de Supabase.

`vercel.json` permite deployments automáticos solamente para `dev` y `main`.
Los demás branches siguen teniendo CI mediante sus PRs, pero no crean previews.

## Promoción y rollback

### Promover DEV a PROD

1. Completar `docs/QA_CHECKLIST.md` sobre la URL estable de DEV.
2. Actualizar el PR permanente `dev -> main`.
3. Esperar ambos jobs de CI.
4. Obtener la aprobación de release.
5. Mergear el PR.
6. Verificar la URL oficial y los endpoints `/api/health` y `/api/ready`.

### Rollback

- DEV: revertir el PR problemático en `dev`; Vercel publicará la reversión.
- PROD: usar rollback instantáneo de Vercel para recuperar servicio y luego
  crear el revert correspondiente en `main` y sincronizarlo hacia `dev`.

El rollback de frontend no revierte migraciones de base de datos. Las
migraciones deben ser compatibles hacia atrás y cualquier corrección se agrega
como una migración nueva.

## Limitaciones

- Vercel seguirá guardando historial de versiones; el objetivo es tener sólo dos
  destinos estables, no borrar el historial necesario para rollback.
- La protección de ramas y los dominios se configuran una vez en GitHub/Vercel
  y requieren permisos administrativos.
- Un CI verde no reemplaza el QA manual en DEV ni el smoke posterior a PROD.
