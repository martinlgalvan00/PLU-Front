---
name: plu-frontend-design
description: >-
  Reglas operativas de marca, UX y sistema visual de PLU Argentina. Invocar
  primero, antes que cualquier otra guía de diseño, para toda tarea de UI,
  UX, estilos, componentes, responsive o motion en este repo. Establece
  la jerarquía de autoridad frente a metodologías externas (Impeccable,
  Emil Kowalski, Taste, Vercel Web Design Guidelines).
---

# PLU Frontend Design

Skill de marca y producto para PLU Argentina (Powerlifting United Argentina / Maximal).
Convierte la documentación de marca dispersa del repo en reglas operativas para cualquier
agente que trabaje en UI, UX, estilos, responsive o motion.

**Esta skill manda.** Ninguna metodología externa (Impeccable, Taste, Emil Kowalski, Vercel
Web Design Guidelines) puede pisar lo que dice acá. Ver "Jerarquía de autoridad" abajo.

## Fuente de verdad — y por qué está fragmentada

No existe un único `docs/FRONTEND_BRAND_GUIDELINES.md` en este repo. La marca vive repartida en:

| Documento | Estado | Para qué sirve |
|---|---|---|
| `docs/PLU_BRAND_ALIGNMENT.md` | ✅ Vigente, es la fuente **más reciente y autorizada** (jul. 2026) | Qué se toma de Powerlifting United, qué se adapta, decisión de paleta confirmada por PLU USA |
| `src/styles/tokens/palette.css` | ✅ Vigente — **ground truth de color**, no un doc | Valores hex/oklch reales en uso |
| `src/styles/variables.css` | ✅ Vigente — **ground truth de tokens** (spacing, radios, motion, elevación) | Valores reales en uso |
| `docs/UX_UI_GUIDELINES.md` | ⚠️ **Parcialmente desactualizado** — la tabla de paleta todavía dice "CTA principal = `--color-brand-red`", que ya no es cierto | Gramática visual (un solo énfasis por hover), regla de 2 clics, temas |
| `docs/DESIGN_FACELIFT_SPEC.md` | ⚠️ **Superado** por la auditoría anti-IA de `PLU_BRAND_ALIGNMENT.md` §7 (paleta vieja: dorado apagado `#c9b978`, rojo como acento) | Solo como referencia histórica de por qué se corrigió |
| `docs/DESIGN_POLISH_CHECKLIST.md` | ✅ Vigente | Checklist anti-"generado por IA" ya usado en las últimas rondas |
| `docs/MOTION.md` | ✅ Vigente | Sistema de motion real (`motion/react`, tokens, componentes) |
| `agent-skills/design-system-plu/SKILL.md`, `agent-skills/design-upgrade/SKILL.md` | ⚠️ Tablas de paleta desactualizadas (mismo problema que `UX_UI_GUIDELINES.md`) | Proceso e inventario de componentes, siguen siendo útiles fuera de la tabla de color |

**Regla dura: ante cualquier conflicto entre un documento `.md` y el código real
(`palette.css`, `variables.css`, `themes/dark.css`, `themes/light.css`), gana el código.**
Los documentos describen intención pasada; el código es lo que el usuario ve hoy. Si notás
otro doc desalineado con el código, corregilo o marcalo como superado — no lo repitas.

## Jerarquía de autoridad

1. **Lógica de negocio, permisos, contratos y comportamiento existente** — `src/lib/roles.js`,
   `src/services/`, contratos de API, Mercado Pago. Nunca se toca por un cambio visual.
2. **Esta skill** (`plu-frontend-design`) — que a su vez se apoya en el ground truth de
   `palette.css` / `variables.css` / `PLU_BRAND_ALIGNMENT.md` por encima de docs desactualizados.
3. **Tokens, componentes y patrones ya aprobados** — `src/styles/variables.css`,
   `src/styles/tokens/palette.css`, `src/components/ui/*`, `src/components/layout/*`,
   `src/components/admin/*`. Reutilizar antes de crear.
4. **Requisitos concretos de la tarea actual** — lo que el usuario pidió explícitamente.
5. **Recomendaciones de skills externas** (Impeccable, Taste, Emil Kowalski, Vercel Guidelines)
   — útiles como método y quality gate, nunca como fuente de identidad.
6. **Preferencias visuales genéricas del agente** — la última palabra, casi nunca decisiva.

Ninguna skill externa puede reemplazar la paleta, la tipografía, la identidad o las
restricciones de PLU. Si Impeccable, Taste o cualquier otra fuente sugiere algo que
contradice esta skill, se descarta o se adapta — no se aplica literal.

## Identidad buscada / percepción a evitar

**Buscada:** oficial, deportiva, institucional, moderna, premium, clara, humana. Una
federación real, no una app. Coherente entre sitio público, autenticación y administración.

**Evitar:**
- Plantilla genérica de SaaS (heroes centrados con gradiente de fondo, grillas 3-cards
  perfectamente simétricas, iconos en cuadrados redondeados repetidos).
- Estética fitness amateur (gradientes neón, tipografía script, folklore exagerado).
- "Se ve como generado por IA" — ya fue un hallazgo real reportado por PLU USA en jul. 2026
  (`PLU_BRAND_ALIGNMENT.md` §7). Sus síntomas concretos ya identificados en este repo: drift
  de color no documentado, glow decorativo sin función, copy aspiracional en vez de factual.
  No reintroducirlos.
- Copia literal de `powerliftingunited.com` (assets, layout pixel a pixel). El copy
  institucional SÍ se traduce/adapta fielmente desde jul. 2026 (`PLU_BRAND_ALIGNMENT.md` §2)
  — eso ya no es "copiar", es la decisión de producto vigente. No revertirla por criterio propio.

## Paleta y roles semánticos (ground truth: `src/styles/tokens/palette.css`)

Confirmada por PLU USA en jul. 2026, tomada del logo oficial: **negro/grafito, azul, blanco,
amarillo/dorado**. El rojo **no es color de marca**.

| Rol | Token semántico | Uso |
|---|---|---|
| Estructura / fondo | `--color-bg-primary`, `--color-bg-surface`, `--color-bg-elevated` | Superficies oscuras (default) |
| Identidad / navegación | `--color-brand-celeste` (`--plu-celeste-*`) | Acento institucional, links, focus, iconografía informativa |
| Acción principal | `--color-brand-action` (= `--plu-gold-500`) | CTA primario, botón principal |
| Premium / distinción | `--color-brand-gold` | Membresía, medallas, resultados destacados |
| Superficie clara | `--plu-warm-50/100`, `--plu-ink-900` | Modo claro |
| Info secundaria | `--plu-ink-500`, `--color-text-muted` | Texto de apoyo |
| **Danger — único uso de rojo** | `--plu-red-500` / `--color-brand-red` | Errores de validación, badges de alerta, check-in fallido. **Nunca decorativo, nunca CTA, nunca acento de marca.** |

**Regla de disciplina** (ya escrita en `DESIGN_FACELIFT_SPEC.md` §2 y sigue vigente): máximo
un acento de color por bloque visual (card, sección, banner). No mezclar celeste + dorado +
rojo en el mismo elemento, salvo la línea tricolor de 1.5px (`--gradient-brand`) que ya
funciona como firma de marca puntual.

Antes de escribir un color nuevo: ¿existe ya en `palette.css`/`variables.css`? Si no,
agregarlo como variable en `:root` primero — nunca hex suelto en `.jsx` (excepción real:
SVG inline de banderas de idioma, ya así en `LocaleFlag.jsx`).

## Tipografía — Poppins obligatorio

Única familia del proyecto (`--font-family`, `--font-display` → ambos Poppins, pesos 300–900).
No introducir una segunda tipografía (ni siquiera para "un acento editorial") sin guideline
oficial de PLU USA que lo pida explícitamente — ya se evaluó y descartó una vez.

| Nivel | Tamaño | Peso | Transform |
|---|---|---|---|
| H1 hero/página | `clamp(28px,4.2vw,46px)` | 700 | ninguno |
| H2 sección | `clamp(22px,3.2vw,36px)` | 700 | ninguno |
| H3 card | 16–18px | 600 | ninguno |
| Eyebrow/badge | 10–11px | 600–700 | uppercase (único lugar permitido) |
| Body | 14–15px | 400 | ninguno |

`uppercase` + `letter-spacing-wide` se reserva a eyebrows y badges de estado — no a H3 de
card ni a labels sueltos; eso ya se identificó como uno de los "tells" más genéricos.

## Botones, cards, tablas, fichas, badges, estados

**Botones** (`components/buttons.css`): `.btn`, `.btn--gold` (acción principal), `.btn--secondary`,
`.btn--small`. Radio `md`. Un solo énfasis en hover/focus: glow de color (`--glow-*-soft`) O
`translateY`, nunca ambos + `scale`. `type="button"`/`type="submit"` siempre explícito.
Touch target ≥44px.

**Cards**: clases semánticas (`benefit-card`, `pricing-card`, `metric-card`), radio `lg`/`xl`.
Hover = `translateY(-1px a -3px)` + `--elevation-sm`/`md` + cambio de `border-color`. Sin
borde-gradiente animado, sin glow de ícono, sin `scale`. No anidar card dentro de card.
No convertir automáticamente toda sección en grid de cards — solo donde el contenido ya es
una colección de ítems comparables (planes, eventos, resultados).

**Badges/status pills** (`status.css`): color semántico plano, sin sombra ni gradiente,
separado del acento de marca. Ya es el estándar a imitar en el resto del sistema — no
inventar una segunda variante.

**Tablas** (`DataTable`, `tables.css`): scroll horizontal en mobile, no conversión automática
a cards salvo que la tabla ya sea inmanejable en 375px con scroll (evaluar caso por caso, no
por regla global).

**Fichas técnicas** (evento, membresía, credencial): un acento de color por ficha, jerarquía
tipográfica antes que capas decorativas. Si una card necesita 3+ efectos superpuestos para
verse bien, el problema es de jerarquía, no de falta de motion (`design-upgrade` §9c, vigente).

## Criterios por sección

| Sección | Tono | Prioridad de contenido |
|---|---|---|
| **Home** | Pública emocional/institucional | Hero → misión/pilares → Pitbull spotlight → afiliación → resultados/reglamento (teasers) → comunidad → FAQ → CTA final. No reordenar sin razón de negocio. |
| **Afiliaciones** (`MembersPage`) | Conversión | Beneficio, precio ARS, requisitos, CTA claro. Planes **siempre** vía `MembershipCard` — nunca markup genérico (`design-upgrade` §8, regla ya escrita y con motivo documentado: se pierde jerarquía/features/ahorro). |
| **Pitbull Classic** (`PitbullPage`) | Conversión + institucional | Fecha, lugar, cupos, categorías, precio, CTA inscripción. Barra de capacidad ya animada, no duplicar el patrón con otro widget. |
| **Pitbull Barbell Club / comunidad** | Institucional | Gimnasios afiliados, historias reales — sin inventar testimonios ni cifras. |
| **Eventos / Resultados / Records** | Lectura/reportes | `/records` explícitamente separado de `/results` (no mezclar resultado de evento con récord histórico). Podio con medallas, sombra estática por rango (oro/plata/bronce), sin glow pulsante. |
| **Login** | Conversión mínima | Un formulario, error inline claro, sin fricción decorativa. |
| **Administración** (`AdminShell`) | Operativa privada | Claridad, velocidad, `StatusBadge`, filtros, acciones por rol. Sin ruido visual, sin motion decorativo. Vista PLU USA = solo lectura, UI orientada a descarga (`canExportPluUsa`, nunca exponer acciones de edición). |

## Reglas de tema — light y dark

- Dark es el tema **nativo/default** (`:root, [data-theme='dark']`); light es `[data-theme='light']`
  explícito. Ambos deben cubrir el mismo conjunto de tokens — si agregás un token nuevo,
  definilo en `dark.css` **y** `light.css` con el mismo nombre, mismo turno.
- **Hallazgo de esta auditoría**: `light.css` (271 líneas) carga ~95 líneas extra de overrides
  por selector de componente (`.admin-shell__sidebar`, `.stat-block`, `.faq-item`, etc.) que
  `dark.css` no necesita — señal de que dark se diseña primero y light se parcha después. Al
  tocar un componente, verificar el mismo cambio en ambos temas en el mismo commit, no como
  tarea aparte.
- Transición de tema: View Transition API (`ThemeProvider.jsx`) con fallback CSS en `base.css`.
  Componente nuevo con apariencia distinta por tema → agregarlo al selector de fallback de
  `base.css` (~línea 90).
- Nunca hex hardcodeado en JSX — el cambio de tema tiene que ser automático vía variable.

## Reglas responsive

Breakpoints reales del proyecto (no inventar otros): **360/390/430 mobile, 768/900/1024
tablet/drawer, 1152/1280/1366/1440 desktop, 1920+ TV/4K** (`layout/responsive.css`,
`QA_CHECKLIST.md`). CTAs full-width en mobile, formularios a una columna, touch targets ≥44px,
navbar colapsable con drawer que atrapa foco y bloquea scroll de fondo.

## Reglas de accesibilidad

- Contraste WCAG AA mínimo en texto principal sobre cualquier fondo (dark y light).
- Foco visible en todo control interactivo — patrón único, no reinventar por componente:
  ```css
  .is-focusable:focus-visible {
    outline: 2px solid var(--color-brand-celeste);
    outline-offset: 3px;
    box-shadow: 0 0 0 4px rgba(116, 172, 223, 0.2);
  }
  ```
- Labels asociados a todo input. Nombres accesibles en botones ícono-only.
- Headings en orden lógico, landmarks (`nav`, `main`, `footer`) reales.
- Estados que hoy dependen solo de color (badges) llevan además texto o ícono.
- Modales/drawers: foco atrapado, `Escape` cierra, foco vuelve al disparador.
- `prefers-reduced-motion` respetado en toda animación nueva (`MotionProvider` + `@media`
  ya cablea esto — no lo dupliques a mano).

## Reglas de motion

Sistema real ya implementado con `motion/react` (ver `docs/MOTION.md`) — **no crear tokens
nuevos que dupliquen los que ya existen en `src/styles/variables.css`**:

```css
--motion-instant: 100ms;
--motion-fast: 160ms;
--motion-base: 240ms;
--motion-slow: 480ms;
--motion-cinematic: 700ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-emphasized: var(--ease-design); /* cubic-bezier(0.2, 0.8, 0.2, 1) */
```

Antes de animar cualquier elemento, responder (Emil Kowalski, adaptado):

1. ¿Qué comunica esta animación? (respuesta, continuidad, relación espacial, cambio de
   estado, jerarquía, confirmación, progreso, apertura/cierre)
2. ¿Mejora comprensión o feedback, o es decoración?
3. ¿El usuario la va a ver con demasiada frecuencia (loop, cada carga)?
4. ¿Se resuelve con CSS (`transition`) en vez de JS/Motion?
5. ¿Funciona con `prefers-reduced-motion`?
6. ¿Afecta la velocidad percibida (bloquea interacción, tarda en "sentirse" lista)?

Si la respuesta a (2) es "decoración" y no hay una razón de producto concreta, no se hace.

Obligatorio:
- `transform` y `opacity` por sobre todo lo demás. No `transition: all`. No animar `width`,
  `height`, `top`, `left` salvo excepción justificada (ej. FAQ accordion ya migrado a Motion
  height, no CSS `grid-template-rows`).
- Máximo **una** animación en loop infinito visible por sección (`design-upgrade` §9c, regla
  dura ya aplicada al podio de resultados). Loops operativos (pulse-ring en admin/check-in)
  se aceptan porque comunican estado real, no decoración.
- Glow/sombra de color con tinte de marca: estático, nunca pulsante.
- Drawers, menús y popovers conservan relación espacial con su disparador (abren desde donde
  se los invocó, no aparecen genéricamente).
- Sin parallax pesado, sin scroll hijacking, sin fondos en movimiento, sin dependencias nuevas
  si CSS o Motion (ya instalado) alcanzan.

### 3D — uso restringido

Solo en piezas protagonistas puntuales: card principal de afiliación (credencial con
`TiltCard`, ya implementado), inscripción a torneo, entrada/credencial digital, elemento
destacado de membresía. Elegante, minimalista, ≤6° de inclinación (`TILT_MAX_DEG`, ya el
límite real en `src/motion/tokens.ts`), mouse-only, sin partículas, sin reflejos agresivos,
desactivado bajo `prefers-reduced-motion`. No aplicar 3D a cards genéricas ni en serie.

## Restricciones funcionales absolutas

No modificar Mercado Pago, backend, endpoints, contratos de API, modelos de datos, permisos,
roles (`src/lib/roles.js`), navegación funcional ni rutas. No eliminar validaciones. No
inventar datos, beneficios, precios, fechas, sedes ni testimonios. No copiar literalmente
`powerliftingunited.com` (ver excepción de copy institucional en `PLU_BRAND_ALIGNMENT.md` §2).
No usar rojo como color de marca. No em dash en contenido visible. No convertir todo en cards
ni todas las tablas en cards mobile por regla ciega. No animaciones infinitas decorativas.
No glassmorphism generalizado (`backdrop-filter` solo con overlay real detrás, ver
`UX_UI_GUIDELINES.md`). No agregar dependencias si CSS/Motion ya instalado alcanza.

## Proceso de auditoría, implementación y QA

1. **Auditar antes de modificar**: leer la pantalla y su servicio asociado (`src/services/`
   si aplica). Objetivo de la pantalla, usuario principal, acción principal/secundaria,
   estados (loading/empty/error/success), comportamiento mobile.
2. **Verificar con evidencia real**, no solo lectura de código: correr el dev server, ver la
   pantalla renderizada (capturas si el entorno lo permite). Este repo ya tuvo bugs que la
   lectura de código no detectó (CSS no importado, colisiones de layout mobile) — no repetir
   ese error asumiendo que el código describe el render.
3. **Implementar** el cambio mínimo que resuelve el hallazgo, reusando tokens/componentes.
4. **QA**: desktop angosto/amplio, tablet, mobile estándar/angosto, light, dark, teclado,
   foco, hover, touch, reduced motion, loading/empty/error/success, sin permisos, overflow
   horizontal, texto largo.
5. **Validación técnica real**: `npm run lint`, `npm run typecheck` (si existe script — hoy
   no hay uno dedicado, TypeScript se valida via build/tsc si aplica), `npm test`,
   `npm run build`. No declarar algo "OK" sin haberlo corrido.

## Formato obligatorio de entrega

Por cada cambio o tanda de cambios:

- **Problema** (con evidencia) → **Solución** → **Archivos modificados**.
- **Impacto visual** y **impacto funcional** (¿tocó lógica, rutas, permisos? debería ser "no").
- **Responsive**: qué breakpoints se verificaron.
- **Light y dark**: confirmación explícita de ambos, no solo el que se ve por default.
- **Motion**: qué se agregó/sacó, duración, easing, respuesta a `prefers-reduced-motion`.
- **Validación técnica**: resultado real de lint/typecheck/test/build, nunca asumido.
- **Pendientes**: solo los reales y verificables, no aspiracionales.
