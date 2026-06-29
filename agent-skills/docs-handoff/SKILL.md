# Docs & Handoff — Documentación del proyecto

## Objetivo

Mantener la **documentación viva** de PLU-Front para humanos y agentes: README, `docs/`, `.env.example`, skills en `agent-skills/`, y artefactos de arquitectura — sincronizados con el código real tras cada cambio significativo.

## Cuándo usarla

- Al cerrar una feature o fase del roadmap.
- Cuando un agente nuevo entra al proyecto sin contexto.
- Tras cambiar contratos (API, env vars, schema Prisma, flujos de pago).
- Antes de handoff a otro dev o deploy a staging/producción.
- Si `docs/README.md` referencia archivos que no existen — crearlos o corregir índice.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Cambios realizados | Diff o lista de archivos tocados |
| Estado actual del MVP | Qué es mock vs implementado |
| Variables nuevas | Para `.env.example` |
| Decisiones de arquitectura | Para ARCHITECTURE.md |

## Salidas esperadas

- Documentación actualizada y sin links rotos.
- `.env.example` completo sin secretos reales.
- README con quick start funcional.
- Índice `docs/README.md` coherente.
- Skills `agent-skills/*/SKILL.md` alineadas con código.
- Handoff claro: qué funciona, qué falta, cómo probar.

## Procedimiento paso a paso

### 1. Mapa de documentación

```
PLU-Front/
├── README.md                 # Portada + quick start (mejorar vs template Vite)
├── .env.example              # Variables sin secretos
├── agent-skills/             # Skills para agentes (este directorio)
│   └── */SKILL.md
└── docs/
    ├── README.md             # Índice
    ├── SETUP.md              # ✅ Instalación
    ├── ARCHITECTURE.md       # Crear/mantener
    ├── BUSINESS_RULES.md     # ✅ Reglas negocio
    ├── PAYMENT_FLOW.md       # Crear — Mercado Pago
    ├── EMAIL_FLOW.md         # Crear — Brevo
    ├── EXPORTS.md            # Crear — CSV/PLU USA
    ├── QA_CHECKLIST.md       # Crear — QA manual
    └── ROADMAP.md            # Crear — fases
```

### 2. README raíz — contenido mínimo

Reemplazar template genérico de Vite con:

1. **Qué es:** PLU ARG / Maximal — afiliaciones e inscripciones powerlifting.
2. **Stack:** Vite + React (JS), CSS modular, Express scaffold, Prisma, Vitest.
3. **Quick start:** 5 comandos (`clone`, `cp .env`, `npm i`, `npm run dev`).
4. **Scripts clave:** tabla desde `package.json`.
5. **Links:** `docs/README.md`, `agent-skills/`.
6. **Estado MVP:** localStorage demo, pagos/email mock, backend 501.

### 3. `.env.example` — reglas

- Una variable por línea con comentario de propósito.
- Valores placeholder (`TEST-xxxx`, URLs localhost).
- Agrupar por dominio: App, DB, Auth, Mercado Pago, Brevo.
- Comentario de seguridad: *NUNCA confirmar pagos desde frontend*.
- Actualizar **cada vez** que se agregue `process.env` o `import.meta.env`.

Variables actuales documentadas:

```
VITE_APP_URL, VITE_API_URL, DATABASE_URL, AUTH_SECRET,
VITE_MERCADO_PAGO_PUBLIC_KEY, MERCADO_PAGO_ACCESS_TOKEN,
MERCADO_PAGO_WEBHOOK_SECRET, MERCADO_PAGO_ENV,
BREVO_API_KEY, BREVO_SENDER_*, VITE_BREVO_TEMPLATE_*
```

### 4. ARCHITECTURE.md — esquema sugerido

```markdown
# Arquitectura PLU ARG

## Vista general
[Diagrama: Browser → Vite React → localStorage/API → Postgres]

## Capas frontend
- pages/ → hooks/ → services/ → lib/

## Backend scaffold
- server/index.js — Express, CORS, rutas 501

## Datos
- MVP: storageService (localStorage)
- Target: Prisma + PostgreSQL

## Integraciones
- Mercado Pago (server-only)
- Brevo (server proxy)
- LiftingCast import

## Seguridad
- RBAC roles.js
- Auth futuro JWT/cookie
```

### 5. Documentos de flujo (crear si faltan)

| Doc | Contenido | Skill relacionada |
|-----|-----------|-------------------|
| PAYMENT_FLOW.md | Diagrama checkout + webhook | mercado-pago |
| EMAIL_FLOW.md | Templates + triggers | brevo-emails |
| EXPORTS.md | Columnas CSV admin y USA | export-plu |
| QA_CHECKLIST.md | Casos manual | testing-qa |
| ROADMAP.md | Fases 1-5 con estado | business-analysis |

### 6. Sincronizar agent-skills

Tras cambiar código relevante, actualizar skill correspondiente:

| Cambio en | Actualizar skill |
|-----------|------------------|
| package.json scripts | project-bootstrap |
| schema.prisma | database-modeling |
| paymentService / server payments | mercado-pago |
| roles.js | auth-rbac |
| variables.css / components | design-system-plu |

### 7. Plantilla de handoff (por PR o fase)

```markdown
## Handoff — [Feature/Fase]

### Qué se hizo
- ...

### Cómo probar
1. npm run dev
2. ...

### Estado integraciones
| Integración | Estado |
|-------------|--------|
| Mercado Pago | mock / sandbox / prod |
| Brevo | mock / real |
| PostgreSQL | local / — |

### Pendientes
- [ ] ...

### Riesgos
- ...
```

### 8. Convenciones de escritura

- Español rioplatense, claro y directo.
- Comandos en bloques copiables (PowerShell y bash si aplica).
- Tablas para matrices (roles, estados, env vars).
- No duplicar: skill detallada + doc resumen con link a skill.
- Fecha o fase en ROADMAP cuando se complete ítem.

## Validaciones

- Todos los links en `docs/README.md` resuelven a archivos existentes.
- `.env.example` incluye todas las vars usadas en código (grep `import.meta.env` y `process.env`).
- README quick start probado en máquina limpia.
- Skills referencian paths reales del repo.
- Sin secretos ni tokens reales en docs commiteados.
- ARCHITECTURE refleja MVP vs target honestamente.

## Errores comunes

| Error | Impacto | Fix |
|-------|---------|-----|
| README template Vite | Confusión onboarding | Reescribir portada |
| docs/README link roto | 404 para agentes | Crear doc o quitar link |
| .env.example desactualizado | Setup falla | Grep env vars tras cada PR |
| Skills desincronizadas | Agente implementa mal | Actualizar en mismo PR |
| Documentar solo happy path | Soporte difícil | Incluir errores comunes |
| ROADMAP sin estado | Prioridades unclear | Marcar done/in progress |

## Checklist de aceptación

- [ ] `README.md` describe proyecto PLU ARG (no template genérico)
- [ ] `docs/README.md` índice sin links rotos
- [ ] `.env.example` completo y sin secretos
- [ ] `docs/SETUP.md` probado
- [ ] `docs/BUSINESS_RULES.md` alineado con Prisma enums
- [ ] Docs de flujo creados o referenciados desde skills
- [ ] `agent-skills/` con 14 skills actualizadas
- [ ] Handoff template usado en entregas mayores

## Referencias oficiales

- [Write the Docs — Guide](https://www.writethedocs.org/guide/)
- [Keep a Changelog](https://keepachangelog.com/es-ES/)
- Estructura interna: `docs/README.md`

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `README.md` | Portada repo |
| `docs/README.md` | Índice documentación |
| `docs/SETUP.md` | Instalación |
| `docs/BUSINESS_RULES.md` | Negocio |
| `.env.example` | Variables entorno |
| `agent-skills/*/SKILL.md` | Guías agentes |
| `package.json` | Scripts a documentar |
| `docs/ARCHITECTURE.md` | Arquitectura (crear) |
| `docs/ROADMAP.md` | Roadmap (crear) |
