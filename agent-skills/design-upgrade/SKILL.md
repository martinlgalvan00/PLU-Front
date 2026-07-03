# Design Upgrade — PLU ARG / Maximal

## Objetivo

Mejorar todos los diseños del proyecto PLU ARG / Maximal para que la plataforma tenga una identidad visual **profesional, moderna, deportiva, argentina y superior a la referencia base** de [Powerlifting United](https://powerliftingunited.com/).

Esta skill se aplica cada vez que el agente cree, edite o refactorice una pantalla, componente, layout, landing, panel privado, formulario, tabla, dashboard, estado vacío, card, modal o flujo visual.

**Principio central:** no copiar literalmente Powerlifting United. Usarlo como referencia estructural e institucional, pero crear una versión propia, más moderna, más premium y ambientada a Argentina.

PLU USA sirve de referencia para federación, membresías, eventos, resultados, rulebook, portal, CTAs, comunidad y FAQ. PLU ARG / Maximal debe elevar esa base con mejor UX, mobile, jerarquía, identidad local, integración con panel privado, calidad visual y claridad comercial/operativa.

## Cuándo usarla

Usar esta skill cuando:

- Se cree o edite una **landing** o página pública.
- Se diseñe o refactorice el **panel privado**.
- Se creen o modifiquen **componentes UI**.
- Se implementen **formularios**, **tablas** o **dashboards**.
- Se diseñen cards de eventos, membresías o resultados.
- Se ajusten **estilos globales**, motion o responsive.
- Se haga **QA visual** antes de cerrar una tarea de UI.
- Un cambio visual toque más de una pantalla (auditar coherencia global).

**Complementa** (no reemplaza) a [`design-system-plu`](../design-system-plu/SKILL.md): esa skill define tokens y componentes base; esta skill define el **proceso de mejora** y los criterios de calidad por tipo de pantalla.

## Entradas requeridas

Antes de diseñar o modificar, revisar:

| Entrada | Ubicación en el repo |
|---------|----------------------|
| Reglas de negocio MVP | `docs/BUSINESS_RULES.md` |
| Arquitectura y capas UI | `docs/ARCHITECTURE.md` |
| Referencia estructural | Powerlifting United (solo jerarquía, no copy/assets) |
| Tokens y paleta | `src/styles/variables.css` |
| Motion y efectos | `src/styles/animations.css`, `src/styles/effects.css` |
| Componentes existentes | `src/components/ui/`, `src/components/layout/` |
| Páginas actuales | `src/pages/` |
| Contenido estático | `src/lib/content.js`, `src/lib/constants.js` |
| Assets de marca | `src/assets/PLU Official Letterhead Logo.png`, `src/assets/PLU Argentina.jpg` |
| Stack | Vite + React + **CSS modular** (sin Tailwind) |
| Roles y permisos UI | `src/lib/roles.js` |

Si faltan assets (fotos de competencia, logos finales), usar placeholders profesionales y dejar **TODO explícito** en el handoff — no bloquear el flujo con imágenes rotas.

## Salidas esperadas

- Pantallas con intención visual clara (pública vs privada vs conversión).
- Componentes reutilizables, no estilos one-off por página.
- Tokens CSS centralizados (sin hex sueltos en JSX).
- Estados vacío, error y carga considerados (o documentados como pendiente).
- Responsive verificado en mobile, tablet y desktop.
- Motion sutil integrado (`Reveal`, `PageTransition`, `surface-card`) sin exagerar.
- Documentación breve del cambio: pantallas, decisiones, pendientes, riesgos.

## Procedimiento paso a paso

### 1. Auditar antes de modificar

Para cada pantalla, identificar:

| Pregunta | Por qué importa |
|----------|-----------------|
| ¿Objetivo de la pantalla? | Evita decoración sin propósito |
| ¿Usuario principal? | Atleta, operador, PLU USA, admin |
| ¿Acción principal y secundaria? | Jerarquía de CTAs |
| ¿Qué datos muestra? | Densidad y prioridad visual |
| ¿Estado vacío / error / carga? | Completitud del flujo |
| ¿Comportamiento mobile? | No diseñar solo en desktop |
| ¿Riesgo de confusión? | Formularios largos, tablas densas |

**Regla:** no modificar diseño sin entender el flujo. Leer la página y su servicio asociado en `src/services/` si aplica.

### 2. Definir intención visual

Clasificar la pantalla:

| Tipo | Tono | Ejemplos en el proyecto |
|------|------|-------------------------|
| **Pública emocional** | Fuerte, visual, institucional | `HomePage`, `PitbullPage`, `MembersPage` |
| **Operativa privada** | Clara, rápida, sobria | `AdminPage` + `AdminShell` |
| **Conversión** | CTA evidente, pocos pasos | `RegisterPage`, formularios de afiliación |
| **Validación** | Estados de pago, confirmación | `order-panel`, `StatusBadge` |
| **Lectura / reportes** | Limpio, exportable | vistas PLU USA, `ResultsPage` |

| Regla | |
|-------|---|
| Público | Emocional, institucional, conversión |
| Privado | Operativo, tablas, filtros, sin ruido visual |

### 3. Aplicar identidad PLU ARG

El diseño debe transmitir: fuerza, federación, competencia, profesionalismo, estándar internacional, comunidad argentina, confianza y seriedad operativa.

**Evitar:**

- Estética fitness genérica (gradientes neón, tipografía script).
- Diseño amateur (márgenes inconsistentes, 5 tamaños de botón).
- Exceso celeste/blanco (celeste solo como acento secundario: `--color-brand-celeste`).
- Folklore exagerado.
- Copia literal de PLU USA (copy, logos, layout idéntico).
- Tablas desordenadas, formularios largos sin agrupación, botones sin jerarquía.

**Paleta actual (tokens):**

| Token | Rol |
|-------|-----|
| `--color-bg-primary` | Base oscura |
| `--color-brand-red` | CTAs primarios, energía competitiva |
| `--color-brand-gold` | Acento premium, precios destacados |
| `--color-brand-celeste` | Detalle argentino sutil |
| `--font-display` | Barlow Condensed — títulos en mayúsculas |

### 4. Usar sistema visual consistente

Reutilizar o extender (nunca duplicar):

```
src/styles/
  variables.css     # tokens
  animations.css    # motion
  effects.css         # grain, shimmer, surface-card
  components/         # buttons, plu-ui, forms, status
  layout/             # header, footer, admin-shell
  pages/              # home, page, register
```

**Regla:** color nuevo → variable en `:root` primero. Patrón repetido ≥2 veces → componente en `src/components/ui/`.

### 5. Mejorar UX en cada pantalla

Responder antes de cerrar:

1. ¿Qué está viendo el usuario?
2. ¿Qué tiene que hacer ahora?
3. ¿Qué pasa si hay error?
4. ¿Qué pasa si no hay datos?
5. ¿Qué pasa en mobile?
6. ¿Qué información es prioritaria?
7. ¿Qué acción debe destacarse?

Máximo **2 clics** desde la home a: afiliación, inscripción Pitbull Classic o login del panel.

### 6. Mejorar responsive

Probar en:

- Mobile (~375px)
- Tablet (~768px)
- Desktop (~1200px)
- Pantallas grandes (~1440px)

| Regla | Implementación |
|-------|----------------|
| CTAs visibles en mobile | `btn--block` en hero mobile, header con menú hamburguesa |
| Formularios en una columna | `form-grid` → 1 col en breakpoints chicos |
| Tablas legibles | `DataTable` + scroll horizontal o columnas colapsadas |
| Cards apiladas | grids → `1fr` en `@media (max-width: 960px)` |
| Panel navegable | `AdminShell` sidebar colapsable en mobile |

### 7. Componentes reutilizables

**Ya implementados en el proyecto:**

| Componente | Archivo |
|------------|---------|
| Navbar público | `Header.jsx` |
| Hero | `HomePage.jsx` + `pages/home.css` |
| CTAButton | `Button.jsx` + `.btn` variants |
| MembershipCard | `MembershipCard.jsx` |
| EventCard | `EventCard.jsx` |
| ResultCard | `ResultCard.jsx` |
| StatBlock | `StatBlock.jsx` |
| FAQAccordion | `FAQAccordion.jsx` |
| SectionHeader | `SectionHeading.jsx` |
| AdminShell + Sidebar | `AdminShell.jsx` |
| DataTable | `DataTable.jsx` |
| StatusBadge | `StatusBadge.jsx` → `StatusPill.jsx` |
| ExportButton | `ExportButton.jsx` |
| EmptyState | `EmptyState.jsx` |
| Scroll reveal | `Reveal.jsx` |
| Page transition | `PageTransition.jsx` |
| Footer | `Footer.jsx` |
| LoginButton | `LoginButton.jsx` |
| CTASection | `CTASection.jsx` |

**Pendientes de crear cuando el flujo lo requiera:**

| Componente | Cuándo crearlo |
|------------|----------------|
| `LoadingState` | Fetch a API real, exports largos |
| `ErrorState` | Fallos de pago, validación, red |
| `PaymentStatusCard` | Post-checkout Mercado Pago |
| `FormSection` | Agrupar formulario de registro por pasos |
| `ConfirmationScreen` | Post-inscripción / post-pago exitoso |

Al crearlos, seguir la misma convención: JSX en `src/components/ui/`, estilos en `src/styles/components/`.

### 8. Mejoras por módulo

#### Landing pública (`HomePage.jsx`)

Debe incluir: hero fuerte, claim claro, imagen deportiva, CTAs visibles, stats, afiliación, Pitbull Classic, eventos, resultados, comunidad, FAQ, CTA final.

#### Afiliación (`MembersPage`, `RegisterPage`)

Transmitir: beneficio, precio ARS, qué incluye, requisitos, CTA claro, proceso simple. **Siempre** renderizar los planes con el componente `MembershipCard` (ícono por tier, comparación de ahorro, features con check, CTA) — nunca con markup genérico tipo `design-process-card`, que pierde jerarquía visual y datos (features, ahorro, destacado). `MembersPage` ya usa `<div className="membership-grid">` + `MembershipCard` por cada `MEMBERSHIP_PLANS`; si se agrega un plan nuevo, alcanza con sumarlo a `MEMBERSHIP_PLANS` en `content.js`, el componente ya soporta `compareWith`, `highlighted` y `features`. Usar `FormSection` (cuando exista) para el registro.

#### Pitbull Classic (`PitbullPage`)

Mostrar: fecha, lugar, cupos, categorías, precio, CTA inscripción. Barra de capacidad animada ya en `page.css`.

#### Panel privado (`AdminPage` + `AdminShell`)

Priorizar: claridad, velocidad, estados (`StatusBadge`), filtros, acciones por rol, exportaciones. Sidebar con 10 módulos; secciones sin backend → `EmptyState`.

#### PLU USA (`viewer_plu_usa`)

Solo lectura: export PLU USA habilitado, acciones de edición deshabilitadas (`canEdit` en `roles.js`). UI limpia orientada a descarga.

#### Resultados (`ResultsPage`)

Mostrar: podio visual top 3 (medallas 🥇🥈🥉), stats de la temporada, grilla de resultados por meet, filtros por evento. Consistencia con `EventsPage` (mismo hero, mismo design system). Tokens: `--results-podium-bg`, `--results-row-bg`, `--results-rank-bg`. Estilos en `src/styles/pages/results.css`. El podio anima **solo en la entrada** (drop-in + medal bounce, una vez al entrar en viewport) y usa sombra estática por rango (oro/plata/bronce); nada de loops infinitos — ver sección "9c. Modernidad y minimalismo".

**Componentes clave:** `ResultCard` (rediseñado con `ResultCard--featured`, `result-card__medal`), `PodiumSection`, `ResultsStats`, `FilterPills`.

**Estados a cubrir:** sin resultados → `EmptyState`; filtro vacío → mensaje contextual con botón de reset.

### 9. Motion y detalle (sin exagerar)

Usar el sistema existente:

| Efecto | Dónde |
|--------|-------|
| `Reveal` | Secciones al scroll |
| `PageTransition` | Cambio de vista en `App.jsx` |
| `surface-card` | Hover en cards |
| Hero stagger | CSS en `animations.css` |
| FAQ accordion | `grid-template-rows` en `plu-ui.css` |
| Header scrolled | `useScrolled` en `Header.jsx` |

Respetar `prefers-reduced-motion` (ya en `animations.css`).

### 9c. Modernidad y minimalismo (regla de restricción visual)

El objetivo estético es **premium y contenido**, no "recargado". Un diseño se siente más moderno cuando *hace menos cosas a la vez*, no cuando suma más efectos.

**Reglas duras:**

| Regla | Por qué |
|-------|---------|
| Máximo **una** animación en loop infinito visible por sección | Dos o más loops simultáneos (float + glow pulsante + shimmer) leen como "plantilla de casino", no como marca premium |
| Motion de entrada (una vez) sí, motion ambiental permanente no | La atención del usuario debe volver a los datos, no quedar atrapada en movimiento decorativo |
| Glow/sombra de color → **estático**, no pulsante | Un `box-shadow` fijo con tinte de marca ya comunica jerarquía (oro/plata/bronce); animarlo en loop es ruido |
| Hover-only para shimmer, elevación o brillo | El detalle premium se revela con la interacción, no se regala todo el tiempo |
| Preferir espacio en blanco antes que otra capa decorativa | Si una card necesita 3+ efectos superpuestos para verse bien, el problema es de jerarquía tipográfica, no de falta de motion |

**Ejemplo aplicado — Podio (`Podium.jsx` / `results.css`):** entrada `podium-card-drop` (una vez) + `podium-medal-bounce` (una vez) + sombra estática por rango (oro/plata/bronce) + shimmer solo en `:hover`. **Sin** flotación infinita ni glow pulsante — se retiraron por sentirse recargados frente al objetivo minimalista.

**Checklist rápido antes de agregar un efecto nuevo:**
- [ ] ¿Ya hay una animación en loop en esta vista? → no agregar otra
- [ ] ¿El efecto comunica jerarquía/estado o es solo decoración? → si es solo decoración, dudar
- [ ] ¿Se puede lograr el mismo impacto con espaciado o tipografía en vez de motion?

### 9b. Transiciones de Tema (Dark / Light)

**Implementación actual:** View Transition API (`document.startViewTransition`) en `ThemeProvider.jsx` con animación `clip-path: circle()` que se expande desde el centro. Fallback CSS en `base.css`.

**Reglas:**

- El selector de fallback CSS en `base.css` debe incluir **todos** los componentes que cambian visualmente con el tema.
- Nuevos componentes → agregar al selector de `base.css` (línea ~90).
- Nuevos tokens de tema → definir en `dark.css` **y** `light.css` con los mismos nombres de variable.
- Los overrides `[data-theme='light'] .component` van al final del CSS del componente correspondiente.
- Nunca hardcodear colores en JSX; usar variables CSS para que el cambio de tema sea automático.

**Checklist específico de transiciones:**

- [ ] Componente nuevo agregado al selector de fallback en `base.css`
- [ ] Token nuevo definido en `dark.css` y `light.css`
- [ ] Override `[data-theme='light']` al final del CSS del componente
- [ ] No hay hex hardcodeados en el componente JSX
- [ ] Transición se ve fluida en Chrome (View Transition) y Firefox (fallback)

### 10. QA visual antes de finalizar

Checklist obligatorio (marcar cada ítem):

- [ ] La acción principal se entiende en menos de 5 segundos
- [ ] Hay jerarquía clara (título → subtítulo → CTA)
- [ ] Mobile funciona (375px)
- [ ] Los estados se diferencian visualmente (`StatusBadge` tones)
- [ ] Botones primarios destacan sobre secundarios/outline
- [ ] No se copió literalmente la referencia USA
- [ ] Se siente argentino y profesional (sin folklore)
- [ ] El panel es operativo y legible
- [ ] Hay estado vacío donde aplica
- [ ] Hay manejo de error o está documentado como pendiente
- [ ] Consistencia entre pantallas (mismos tokens, mismos botones)
- [ ] `npm run build` pasa sin errores

### 11. Documentar cambios

Al cerrar una mejora visual, registrar en el mensaje al usuario o en `docs/` si es grande:

- Pantallas modificadas
- Componentes creados o extendidos
- Tokens nuevos en `variables.css`
- Decisiones visuales y por qué
- Pendientes (assets, LoadingState, etc.)
- Riesgos de regresión
- Cómo probar (viewport + flujo)

## Validaciones

- Cero colores hex en JSX (salvo SVG inline justificado).
- Estilos en archivos `.css` modulares, no inline salvo `--hero-image`.
- Lógica de negocio fuera de componentes UI (`src/services/`).
- Focus visible en controles interactivos.
- Labels en todos los inputs de formulario.
- Contraste WCAG AA en texto principal sobre fondos oscuros.
- Imágenes con `alt` descriptivo.
- Build y lint sin errores nuevos.

## Errores comunes

| Error | Consecuencia | Fix |
|-------|--------------|-----|
| Rediseñar una pantalla aislada | Inconsistencia global | Auditar tokens y componentes compartidos primero |
| Copiar layout PLU USA | Deuda de marca | Reinterpretar con paleta PLU ARG |
| Animaciones exageradas | Sensación amateur / lentitud | Usar motion existente; respetar reduced-motion |
| Tabla sin scroll en mobile | Datos ilegibles | `DataTable` + `overflow-x: auto` |
| Formulario sin agrupación | Abandono | Secciones con títulos y `FormSection` |
| Olvidar rol PLU USA | Export bloqueado o edición expuesta | Verificar `canEdit` / `canExportPluUsa` |
| Crear componente duplicado | Deuda técnica | Buscar en `src/components/ui/` antes de crear |
| Hero sin imagen de respaldo | Build roto | CSS gradient fallback si falta asset |
| Múltiples animaciones infinitas simultáneas (float + glow + shimmer) | Se ve recargado, no "premium moderno" | Una sola animación de entrada + hover; sombra estática con tinte de marca en vez de glow pulsante |
| Renderizar planes/precios con markup genérico en vez del componente dedicado | Se pierde jerarquía, features y comparación de ahorro | Usar `MembershipCard` (o el componente ya construido) en cada lugar donde se muestren planes |

## Checklist de aceptación

Un diseño está **aceptado** si:

- [ ] Se ve más moderno que la referencia Powerlifting United
- [ ] Mantiene identidad PLU ARG / Maximal
- [ ] No copia literalmente textos, logos ni estructura exacta de PLU USA
- [ ] Funciona en mobile, tablet y desktop
- [ ] Jerarquía visual clara (display font en títulos, body legible)
- [ ] CTAs evidentes en landing y conversión
- [ ] Usa componentes reutilizables del design system
- [ ] Panel privado fácil de operar (sidebar, tabla, filtros)
- [ ] Formularios claros con validación visible
- [ ] Tablas legibles con estados diferenciados
- [ ] Estados de pago / afiliación / inscripción comprensibles
- [ ] Puede escalar sin rediseñar todo (tokens + componentes)
- [ ] No hay más de una animación en loop infinito visible a la vez por sección
- [ ] `npm run build` y `npm run test` pasan

## Referencias oficiales

- [Powerlifting United](https://powerliftingunited.com/) — referencia estructural (no copia)
- [MDN — CSS custom properties](https://developer.mozilla.org/es/docs/Web/CSS/Using_CSS_custom_properties)
- [MDN — prefers-reduced-motion](https://developer.mozilla.org/es/docs/Web/CSS/@media/prefers-reduced-motion)
- [Lucide Icons](https://lucide.dev/icons/)
- Skill complementaria: [`design-system-plu`](../design-system-plu/SKILL.md)
- Skill complementaria: [`admin-panel`](../admin-panel/SKILL.md)
- Skill complementaria: [`forms-validation`](../forms-validation/SKILL.md)

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/styles/variables.css` | Design tokens |
| `src/styles/animations.css` | Motion system |
| `src/styles/effects.css` | Grain, shimmer, surface-card |
| `src/styles/index.css` | Import chain |
| `src/components/ui/*` | Componentes visuales |
| `src/components/layout/Header.jsx` | Navbar público |
| `src/components/layout/Footer.jsx` | Footer |
| `src/components/layout/AdminShell.jsx` | Panel + sidebar |
| `src/components/layout/PageTransition.jsx` | Transición entre vistas |
| `src/components/ui/Reveal.jsx` | Scroll reveal |
| `src/hooks/useMotion.js` | Intersection Observer, header scroll |
| `src/pages/HomePage.jsx` | Landing principal |
| `src/pages/AdminPage.jsx` | Panel operativo |
| `src/pages/RegisterPage.jsx` | Conversión afiliación/inscripción |
| `src/lib/content.js` | Copy y datos de secciones |
| `src/lib/constants.js` | Nav, eventos, precios |
| `src/lib/status.js` | Labels y tonos de badges |
| `src/assets/` | Logos e imágenes de marca |
| `docs/BUSINESS_RULES.md` | Reglas que afectan UI de estados |
| `docs/QA_CHECKLIST.md` | QA general del proyecto |
| `AGENTS.md` | Índice de skills para agentes |
