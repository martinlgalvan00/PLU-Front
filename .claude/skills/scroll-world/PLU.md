# Adaptador PLU — scroll-world

Origen: [oso95/scroll-world](https://github.com/oso95/scroll-world) (MIT).

## Jerarquía (obligatoria)

1. Reglas de negocio, rutas, permisos y contratos API del repo.
2. [`.claude/skills/plu-frontend-design/SKILL.md`](../plu-frontend-design/SKILL.md) — autoridad visual.
3. Para motion 3D liviano del producto (TiltCard, showcases): `agent-skills/motion-premium/SKILL.md`.
4. Pedido concreto del usuario.
5. Esta skill — pipeline de mundo scroll-scrubbed **solo con confirmación explícita**.

## Cuándo usarla

- El usuario pide explícitamente un hero / landing tipo “vuelo 3D” o “mundo scrolleable”.
- Hay presupuesto y tooling listos (Monid y/o Higgsfield, ffmpeg, Python/Pillow).
- Se acepta que genera assets de video pesados, no un polish del sitio actual.

## Cuándo NO usarla

- Pulir o “hacer más elegante” el 3D/motion existente → usar `motion-premium` + `plu-frontend-design`.
- Sin confirmación de gasto en APIs de generación de video/imagen.
- Como default para cualquier mejora visual de landings PLU.

## Restricciones PLU

- No gastar créditos ni lanzar el pipeline de generación sin aprobación explícita del usuario (costo y tiempo).
- Si se integra al frontend: CSS modular + design tokens PLU; no Tailwind ni stack ajeno.
- Preferir el scrub engine portable (`references/scrub-engine.js`) como referencia; adaptar a React/Vite del repo sin romper rutas ni SSR assumptions.
- `prefers-reduced-motion`: ofrecer fallback estático (poster / still) obligatoriamente.
- Marca: fotografía e identidad PLU/Maximal primero; el look “diorama genérico” solo si el usuario lo pide.

## Fuente de verdad local

- Procedimiento completo: `SKILL.md` de esta carpeta.
- Prompts / pipeline / engine: `references/`.
