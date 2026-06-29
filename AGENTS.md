# Agentes — PLU ARG / Maximal

Este proyecto usa **agent skills** internas en [`/agent-skills`](./agent-skills/).

## Antes de implementar

1. Leer [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) y [`docs/BUSINESS_RULES.md`](./docs/BUSINESS_RULES.md)
2. Identificar la skill relevante en `/agent-skills/` (UI: `design-upgrade` + `design-system-plu`)
3. Seguir el procedimiento de la skill paso a paso

## Skills disponibles

| Skill | Uso |
|-------|-----|
| `project-bootstrap` | Inicializar, instalar, validar build |
| `business-analysis` | Reglas de negocio y backlog |
| `design-system-plu` | CSS y componentes visuales |
| `design-upgrade` | Mejora visual, UX, responsive y QA por pantalla |
| `auth-rbac` | Roles y permisos |
| `database-modeling` | Prisma schema y migraciones |
| `mercado-pago` | Pagos Checkout Pro |
| `brevo-emails` | Emails transaccionales |
| `forms-validation` | Formularios y validación |
| `events-registrations` | Eventos e inscripciones |
| `export-plu` | Exportaciones CSV/XLSX |
| `liftingcast-import` | Import resultados LiftingCast |
| `admin-panel` | Panel administrativo |
| `testing-qa` | Tests y QA |
| `docs-handoff` | Documentación |

## Convenciones

- Lógica de negocio en `src/services/`, no en componentes
- CSS en `src/styles/`, tokens en `variables.css`
- Integraciones con adaptadores mockeables
- Nunca confirmar pagos desde frontend
- Responder en español rioplatense
