---
name: design-ux-ui
description: >-
  Refina secciones UI con UX claro y CSS moderno en PLU ARG (glass, editorial,
  docks, tokens temáticos). Usar cuando el usuario pida mejorar diseño visual,
  modernizar CSS, pulir componentes, o señale un DOM/componente concreto.
---

# Design UX/UI — PLU ARG

Skill táctica para **mejorar una sección concreta** (hero, dock, cards, nav, formularios) con criterio UX + CSS moderno.

**Complementa** (no reemplaza):
- [`design-system-plu`](../design-system-plu/SKILL.md) — tokens y componentes base
- [`design-upgrade`](../design-upgrade/SKILL.md) — auditoría por pantalla y QA global

## Cuándo usarla

- El usuario marca un **DOM path** o componente (`HeroSection`, `HomeQuickBand`, etc.).
- Pide hacer algo **“más elegante / moderno / premium”** sin rediseñar todo el sitio.
- Hay que implementar **CSS refinado** (glass, pills, editorial, motion de entrada).
- Hay que decidir **estructura JSX mínima** antes de estilos.

## Procedimiento (6 pasos)

### 1. Contexto mínimo

Leer solo lo necesario:

| Qué | Dónde |
|-----|-------|
| Componente | `src/components/ui/` o `layout/` |
| Estilos | `src/styles/pages/*.css`, `layout/`, `components/` |
| Tokens página | `src/styles/themes/design-pages-theme.css` |
| Tokens globales | `src/styles/variables.css`, `tokens/palette.css` |
| Copy / links | `src/i18n/locales/es.js`, `src/lib/content.js` |

**No** leer todo el repo. **No** agregar dependencias CSS (sin Tailwind).

### 2. Auditoría UX (2 minutos)

Responder en silencio antes de codear:

1. ¿Cuál es la **acción principal** de esta sección?
2. ¿Qué información es **secundaria**?
3. ¿Mobile first o desktop first? (siempre validar ≤768px)
4. ¿Hay **duplicación** con navbar u otra sección?
5. ¿El copy es largo? → dividir en lead + meta (como hero).

Si la acción no es obvia en 5 segundos → simplificar jerarquía antes de decorar.

### 3. Elegir patrón visual

Consultar [css-patterns.md](./css-patterns.md). Elegir **uno dominante** por sección:

| Intención | Patrón |
|-----------|--------|
| Navegación secundaria bajo hero | **Dock glass** (`home-quick-band--dock`) |
| Titular institucional | **Editorial + regla tricolor** (`hero__editorial`) |
| Credibilidad / stats | **Panel glass** (`hero-status-card`) |
| Conversión | **CTA primario + outline + barra de acciones** |
| Listado compacto | **Pills scrollables** dentro de shell |

**Regla:** premium = menos capas simultáneas, no más efectos (ver `design-upgrade` §9c).

### 4. Tokens antes que hex

Orden obligatorio:

1. ¿Existe variable? → reutilizar
2. ¿Es específico de Home/light/dark? → `design-pages-theme.css` (`--home-*`)
3. ¿Es global de marca? → `variables.css` / `palette.css`

Nunca hardcodear en JSX. Par dark **y** light con el **mismo nombre** de token.

### 5. Implementación CSS

Checklist de implementación:

```
- [ ] JSX: wrapper semántico mínimo (shell, aside, track — solo si aporta)
- [ ] BEM consistente con el archivo existente
- [ ] Hover/focus visible en controles
- [ ] Scroll horizontal en mobile si hay chips (scrollbar oculto OK)
- [ ] Animación de entrada UNA vez (no loop) + prefers-reduced-motion
- [ ] Breakpoints: 640, 720, 768, 1200 (usar los del archivo, no inventar)
- [ ] npm run build
```

**Motion permitido por sección:** máximo 1 loop infinito visible (ej. pulse dot). Preferir entrada stagger o hover.

### 6. Handoff al usuario

Reportar siempre:

- Archivos tocados y **por qué**
- Cómo probar (viewport + interacción)
- Riesgos de regresión (tema claro, mobile scroll, altura hero)
- Siguiente mejora chica sugerida (opcional, 1 línea)

## Anti-patrones PLU

| Evitar | Hacer |
|--------|-------|
| Rojo saturado en todo el titular | Gold/ink para acento; rojo solo en CTA primario |
| Dividers verticales entre cada link | Shell pill + hover bg |
| min-height 100vh en bloques internos | Cap con `min(100dvh, …)` |
| 3+ animaciones simultáneas | Entrada + hover |
| Nuevo componente por 5 líneas CSS | Extender clase existente |
| Copy largo en una sola `<p>` | Lead + `__meta` secundario |

## Ejemplo aplicado: HomeQuickBand dock

**Objetivo:** accesos rápidos sin competir con CTAs del hero.

**Estructura:**
```
nav.home-quick-band--dock
  span.home-quick-band__stripe   ← tricolor 1px
  div.home-quick-band__inner
    div.home-quick-band__aside → label
    div.home-quick-band__shell   ← glass pill
      div.home-quick-band__track → links scroll
```

**Tokens:** `--home-quick-band-shell-*`, `--home-quick-band-stripe` en `design-pages-theme.css`.

**Archivos:** `HomeQuickBand.jsx`, `home.css`.

## Validación

- [ ] Acción clara en mobile
- [ ] Tema claro y oscuro OK
- [ ] Sin hex en JSX
- [ ] `npm run build` pasa
- [ ] Coherente con hero editorial recién refinado

## Referencias

- Patrones CSS del repo: [css-patterns.md](./css-patterns.md)
- QA visual global: [`design-upgrade`](../design-upgrade/SKILL.md) §10
- Tokens: [`design-system-plu`](../design-system-plu/SKILL.md)
