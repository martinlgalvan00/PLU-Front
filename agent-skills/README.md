# Agent Skills — PLU ARG / Maximal

Skills internas reutilizables para agentes de código que trabajan en este proyecto.

## Índice

| # | Skill | Descripción |
|---|-------|-------------|
| 1 | [project-bootstrap](./project-bootstrap/SKILL.md) | Inicializar proyecto, instalar deps, validar build |
| 2 | [business-analysis](./business-analysis/SKILL.md) | Reglas de negocio, MVP, backlog |
| 3 | [design-system-plu](./design-system-plu/SKILL.md) | CSS, componentes visuales PLU ARG |
| 3b | [design-upgrade](./design-upgrade/SKILL.md) | Proceso de mejora visual y QA por pantalla |
| 4 | [auth-rbac](./auth-rbac/SKILL.md) | Roles, permisos, guards |
| 5 | [database-modeling](./database-modeling/SKILL.md) | Prisma, migraciones, seeds |
| 6 | [mercado-pago](./mercado-pago/SKILL.md) | Checkout Pro, webhooks, pagos |
| 7 | [brevo-emails](./brevo-emails/SKILL.md) | Emails transaccionales |
| 8 | [forms-validation](./forms-validation/SKILL.md) | Formularios y Zod |
| 9 | [events-registrations](./events-registrations/SKILL.md) | Eventos e inscripciones |
| 10 | [export-plu](./export-plu/SKILL.md) | Exportaciones CSV/XLSX |
| 11 | [liftingcast-import](./liftingcast-import/SKILL.md) | Import LiftingCast |
| 12 | [admin-panel](./admin-panel/SKILL.md) | Panel administrativo |
| 13 | [testing-qa](./testing-qa/SKILL.md) | Tests y QA |
| 14 | [docs-handoff](./docs-handoff/SKILL.md) | Documentación y handoff |

## Cómo usar

1. Identificá la tarea
2. Abrí la skill correspondiente
3. Seguí el procedimiento paso a paso
4. Validá con el checklist de aceptación

## Convenciones del proyecto

- Stack: **Vite + React + CSS modular**
- Negocio en `src/services/`
- Estilos en `src/styles/` con tokens en `variables.css`
- Integraciones mockeables si faltan credenciales
- Nunca confirmar pagos desde frontend
