# CLAUDE.md — PLU ARG / Maximal

Guía para agentes de Claude Code que trabajan en este repo. Ver también [`AGENTS.md`](./AGENTS.md)
(índice completo de skills internas en `agent-skills/`) y [`README.md`](./README.md) (stack,
setup, estado del proyecto).

## Proyecto

Plataforma web de gestión para Powerlifting United Argentina, integrada con Maximal: sitio
público, área de atletas, panel operativo y API backend. Vite + React 19 + CSS modular con
design tokens (sin Tailwind) en el frontend; Express 5 + PostgreSQL/Supabase + Prisma en el
backend; Mercado Pago para pagos.

## Convenciones generales

- Lógica de negocio en `src/services/`, nunca en componentes de UI.
- CSS en `src/styles/`, tokens de color en `src/styles/tokens/palette.css`, resto de tokens
  (spacing, tipografía, motion, elevación) en `src/styles/variables.css`.
- Integraciones externas con adaptadores mockeables si faltan credenciales.
- Nunca confirmar pagos desde el frontend.
- Responder en español rioplatense.

## Frontend design workflow

Para cualquier tarea relacionada con UI, UX, estilos, componentes, responsive o motion:

1. Invocar primero la skill `plu-frontend-design` (`.claude/skills/plu-frontend-design/SKILL.md`)
   — es la autoridad de marca, producto y restricciones del frontend. Fija además la jerarquía
   frente a cualquier metodología externa.
2. Dentro de esa skill, el ground truth de color/tokens es el código (`palette.css`,
   `variables.css`, `themes/dark.css`, `themes/light.css`), no los `.md` de `docs/` — varios
   quedaron desincronizados tras la corrección de paleta de julio 2026 (ver la skill para el
   detalle de cuáles).
3. Auditar antes de modificar: leer la pantalla, su servicio asociado y verla renderizada
   (dev server) antes de asumir un problema visual — este repo ya tuvo bugs que solo aparecían
   en el render, no en el código (CSS no importado, colisiones mobile).
4. Usar el criterio de **Impeccable** (auditoría, jerarquía, layout, tipografía, reducción de
   elementos genéricos, consistencia, responsive, hardening, polish) como proceso — nunca para
   decidir marca, paleta o tono.
5. Usar el criterio de **Taste** solo para detectar patrones genéricos/de plantilla (heroes
   centrados, grillas simétricas, badges decorativos, composición de SaaS) — cualquier
   alternativa que proponga se compara contra `plu-frontend-design` antes de aplicarse.
6. Usar el criterio de **Emil Kowalski** solo para motion y microinteracciones: `transform`/
   `opacity` primero, sin `transition: all`, sin loops decorativos, siempre con
   `prefers-reduced-motion`, reusando los tokens `--motion-*`/`--ease-*` que ya existen en
   `variables.css` (no duplicarlos).
7. Usar las **Vercel Web Design Guidelines** y accesibilidad (`@storybook/addon-a11y`, ya
   habilitado; sin axe/Lighthouse instalados por ahora) como quality gate técnico — HTML
   semántico, foco, formularios, touch targets, reduced motion — nunca para definir identidad.
8. Preservar lógica de negocio, rutas, permisos (`src/lib/roles.js`), integraciones y
   contratos de API. Un cambio visual no debería tocar ninguno de estos archivos.
9. Validar desktop (angosto y amplio), tablet, mobile, light mode y dark mode antes de dar
   un cambio por terminado.
10. Ejecutar `npm run lint`, `npm test`, `npm run build` (y `typecheck` si corresponde a la
    tarea) y reportar el resultado real, nunca asumido.
