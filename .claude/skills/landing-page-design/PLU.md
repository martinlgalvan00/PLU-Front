# Adaptador PLU — landing-page-design

Origen: [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills) (MIT).

## Jerarquía (obligatoria)

1. Reglas de negocio, rutas, permisos y contratos API del repo.
2. [`.claude/skills/plu-frontend-design/SKILL.md`](../plu-frontend-design/SKILL.md) — autoridad visual.
3. Tokens y temas ejecutados: `src/styles/tokens/palette.css`, `src/styles/variables.css`, `themes/*`.
4. Pedido concreto del usuario.
5. Esta skill — **solo como método** (Part A: intake, estructura, copy, conversión).

## Qué usar de esta skill

- Part A: intake, estructura de landing, layout, copy de conversión, SEO/AEO, checklist de ship.
- Criterios de claridad: una oferta, una audiencia, una CTA primaria, proof junto al claim.

## Qué NO aplicar en PLU

- Part B como sistema de identidad (Geist, Tailwind scale, spacing table ajena, fondos planos obligatorios, icon sets foráneos).
- Sustituir tipografía, paleta, radius o motion tokens del proyecto.
- Introducir Tailwind, `transition: all`, o patrones SaaS genéricos que `plu-frontend-design` / Taste rechazan.
- Reescribir landings institucionales existentes como si fueran greenfield de marketing SaaS.

## Cómo trabajar

1. Invocar primero `plu-frontend-design`.
2. Usar Part A para decidir mensaje y estructura.
3. Implementar con CSS modular del repo y componentes existentes.
4. Motion con tokens `--motion-*` / `--ease-*` y criterio Emil Kowalski (ver CLAUDE.md).
5. QA: desktop angosto/amplio, tablet, mobile, light/dark, lint/test/build según alcance.
