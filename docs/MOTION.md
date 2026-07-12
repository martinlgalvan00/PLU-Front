# Sistema de Motion — PLU Argentina

Documentación de la auditoría, arquitectura e implementación del sistema de animaciones (julio 2026).

## Diagnóstico

### Animaciones existentes (pre-refactor)

| Capa | Implementación | Archivos |
|------|----------------|----------|
| Reveal al scroll | Intersection Observer + clases CSS `.reveal` | `Reveal.jsx`, `animations.css` |
| Stagger | CSS `--stagger-index` en hijos | `StaggerReveal.jsx` |
| Page transition | Timeout + keyframes CSS | `PageTransition.jsx` |
| Hero home | `is-animate` + delays CSS | `HeroSection.jsx`, `home.css` |
| Header scroll | CSS vars vía rAF (`useHeaderScroll`) | `useMotion.js`, `header.css` |
| Parallax hero | `--hero-parallax-shift` vía rAF | `useMotion.js` |
| Microinteracciones | Hover, elevación, icon drift | `motion.css` |
| Admin | Métricas, drawer CSS, pulse-ring puntual | `admin.css` |
| Afiliaciones benefits | CSS 3D `rotateX` / `translateZ` | `members.css` |
| FAQ | `grid-template-rows` CSS | `plu-ui.css` |

### Librerías

| Librería | Estado |
|----------|--------|
| **motion** (`motion/react`) | **Agregada** — reveal, stagger, drawers, accordions, rutas |
| GSAP / Three.js / R3F | No instaladas (fuera de alcance iteración 1) |
| framer-motion legacy | No usada |

### Problemas detectados

1. **Tokens duplicados**: `--duration-*` y `--motion-*` convivían sin jerarquía clara.
2. **Dos sistemas de reveal**: CSS `.reveal` y animaciones ad hoc por página (`fade-up`, `admin-section-enter`, etc.).
3. **Conflicto CSS 3D afiliaciones**: `.members-plu-tile` genérico pisaba transforms 3D de benefits (corregido previamente con `:not(.members-plu-tile--benefit)`).
4. **Hero invisible sin `is-animate`**: reglas CSS dejaban `opacity: 0` hasta clase manual.
5. **Movimiento permanente**: `pulse-ring infinite` en admin, register, account, status — **aceptable** solo en indicadores operativos; no en sitio público decorativo.
6. **Shimmer**: `card-shimmer` y `shimmer-text` existen pero son **one-shot** o hover puntual, no loops decorativos.
7. **Bundle**: +~84 KB gzip tras `motion` (1253 → 1337 KB JS). Mitigado con `manualChunks` + lazy routes (iter. 4).

### Oportunidades aplicadas

- Centralizar variantes Motion reutilizables.
- `MotionProvider` + `prefers-reduced-motion` global.
- Hero con secuencia editorial vía Motion (sin letra por letra).
- Credencial afiliación con `TiltCard` (mouse only, máx. 6°).
- Quick band con stagger corto + flecha `motion-icon-shift`.
- FAQ accordion con `AnimatePresence` + height.
- Admin action drawer con backdrop + slide Motion.
- Route transition < 300 ms con `AnimatePresence`.

### Preloader institucional

**No implementado.** La SPA carga en un solo bundle y el contenido está disponible de inmediato; un preloader añadiría fricción sin beneficio medible en esta iteración. Criterio documentado para evaluar cuando haya lazy routes o assets críticos bloqueantes.

### Arquitectura 3D real (futuro)

Preparado para hero con objeto 3D posterior:

```
src/motion/           ← capa Motion + TiltCard CSS 3D
src/hooks/useMotion.js ← scroll/parallax sin re-render
docs/MOTION.md        ← este documento
```

Punto de extensión sugerido: `HeroVisualLayer` con slot para `<Suspense>` + R3F, manteniendo fallback actual (fotografía + capas CSS).

---

## Sistema de tokens

### CSS (`src/styles/variables.css`)

```css
--motion-instant: 100ms;
--motion-fast: 160ms;
--motion-base: 240ms;
--motion-slow: 480ms;
--motion-cinematic: 700ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

Aliases legacy `--duration-*` se mantienen para compatibilidad con CSS existente.

### TypeScript (`src/motion/tokens.ts`)

Espejo en segundos para Motion: `MOTION_DURATION`, `MOTION_EASE`, `MOTION_VIEWPORT`, `TILT_MAX_DEG`.

### Variantes (`src/motion/variants.ts`)

| Variante | Uso |
|----------|-----|
| `fadeIn` / `fadeUp` / `fadeDown` / `fadeLeft` / `fadeRight` | Reveal direccional |
| `scaleIn` | Cards, modales |
| `staggerContainer` / `staggerItem` | Grupos |
| `modalTransition` | Modales |
| `drawerTransition` | Drawers admin |
| `pageSectionTransition` | Cambio de vista |
| `heroStaggerContainer` / `heroSequenceItem` | Hero home |
| `sectionHeader*` | Encabezados editoriales |

---

## Componentes creados

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| `MotionProvider` | `src/motion/MotionProvider.tsx` | LazyMotion, reduced motion, config global |
| `Reveal` | `src/motion/Reveal.tsx` | Entrada viewport (secciones) |
| `StaggerGroup` | `src/motion/StaggerGroup.tsx` | Stagger de hijos |
| `AnimatedSectionHeader` | `src/motion/AnimatedSectionHeader.tsx` | Eyebrow → título → regla → lead |
| `TiltCard` | `src/motion/TiltCard.tsx` | 3D CSS, mouse only, ≤6° |
| `AnimatedNumber` | `src/motion/AnimatedNumber.tsx` | Métricas reales, once |
| `RouteTransition` | `src/motion/RouteTransition.tsx` | Opacity + Y mínimo entre vistas |

Re-exports JSX (sin romper imports):

- `src/components/ui/Reveal.jsx`
- `src/components/ui/StaggerReveal.jsx`
- `src/components/layout/PageTransition.jsx`

---

## Cambios por área

### Home

- **Hero**: secuencia Motion (kicker → título → lead → CTA → proof). Clase `hero--motion` desactiva CSS legacy.
- **Quick band**: `StaggerGroup` + flecha con drift 2–4px.
- **Secciones**: siguen usando `Reveal` (ahora Motion).

### Afiliaciones

- **Credencial preview**: `TiltCard` con reflejo estático controlado por posición.
- **Benefits 3D**: CSS 3D preservado (no todas las cards).

### Admin

- **Action drawer**: `AnimatePresence` + variantes drawer/backdrop.
- Métricas: CSS `admin-metric-enter` conservado (sobrio).

### FAQ

- Paneles con height Motion; sin `grid-template-rows`.

### Rutas

- `PageTransition` → `RouteTransition` (~280 ms, sin bloquear navegación).

---

## Animaciones eliminadas / deprecadas

| Antes | Ahora |
|-------|-------|
| Clases `.reveal` en componente Reveal | Motion `whileInView` |
| Clases `.stagger-reveal` | `StaggerGroup` Motion |
| Keyframes page-enter en PageTransition | `AnimatePresence` |
| FAQ `grid-template-rows` | Motion height |
| Admin drawer `transform` CSS + `.is-open` | Motion slide |
| Hero `is-animate` manual | `heroStaggerContainer` |

CSS legacy en `animations.css` se mantiene para páginas/componentes no migrados y como fallback visual si Motion falla.

---

## Archivos modificados

### Nuevos

- `tsconfig.json`
- `src/motion/tokens.ts`
- `src/motion/variants.ts`
- `src/motion/useReducedMotion.ts`
- `src/motion/MotionProvider.tsx`
- `src/motion/Reveal.tsx`
- `src/motion/StaggerGroup.tsx`
- `src/motion/AnimatedSectionHeader.tsx`
- `src/motion/TiltCard.tsx`
- `src/motion/AnimatedNumber.tsx`
- `src/motion/RouteTransition.tsx`
- `src/motion/index.ts`
- `docs/MOTION.md`

### Modificados

- `package.json` / `package-lock.json` — `motion`, `typescript`
- `src/providers/AppProviders.jsx`
- `src/components/ui/Reveal.jsx`
- `src/components/ui/StaggerReveal.jsx`
- `src/components/layout/PageTransition.jsx`
- `src/components/layout/HeroSection.jsx`
- `src/components/ui/HomeQuickBand.jsx`
- `src/components/ui/MembersPluHero.jsx`
- `src/components/ui/FAQAccordion.jsx`
- `src/components/admin/AdminActionDrawer.jsx`
- `src/styles/variables.css`
- `src/styles/motion.css`
- `src/styles/pages/home.css`
- `src/styles/pages/members.css`
- `src/styles/pages/admin.css`
- `src/styles/components/plu-ui.css`

---

## QA

| Check | Estado |
|-------|--------|
| Desktop | Pendiente manual |
| Mobile / tablet | Pendiente manual |
| Light / dark mode | CSS tokens compatibles |
| Teclado | Sin cambios en focus; FAQ mantiene `aria-expanded` |
| `prefers-reduced-motion` | `MotionProvider` + CSS `@media` |
| Navegación entre páginas | `RouteTransition` < 300 ms |
| Loading / error / empty | Sin regresión (CSS states intactos) |
| **Build producción** | `npm run build` ✓ (iter. 4: main ~930 KB, `motion` ~80 KB chunk) |

### Smoke test manual sugerido

1. Home: recargar → secuencia hero; scroll secciones; quick band stagger.
2. Afiliaciones: hover credencial (desktop); benefits 3D.
3. FAQ home: abrir/cerrar ítems.
4. Admin: abrir action drawer; cerrar con Escape.
5. Navegar home → eventos → volver: transición suave.
6. Activar reduced motion en SO → contenido inmediato, sin tilt.

---

## Próximos pasos

1. ~~Pitbull / Eventos: placa + máscara foto.~~ **Hecho (iter. 2)**
2. ~~Resultados: podio + filtros.~~ **Hecho (iter. 3)**
3. ~~`AnimatedSectionHeader` en Reglamento.~~ **Hecho (iter. 3)**
4. ~~Code-split `motion` en chunk async.~~ **Hecho (iter. 4)**
5. Slot `HeroVisual3D` cuando se incorpore R3F.

### Iteración 4 — aplicado (jul 2026)

| Área | Cambio |
|------|--------|
| Records | `AnimatedSectionHeader` + `StaggerGroup` en cards distinción |
| Community | `CommunitySectionHeader` + `AnimatedNumber` en stats rail + stagger gyms/stories |
| App | `React.lazy` en páginas secundarias + `PageLoadFallback` |
| Build | `manualChunks` para `motion` y `html2canvas` en `vite.config.js` |

Nuevos: `CommunitySectionHeader.jsx`, `PageLoadFallback.jsx`

Smoke test sugerido (iter. 4):

1. Navegar a Records → header con regla animada + cards en stagger.
2. Navegar a Community → métricas hero cuentan; secciones revelan al scroll.
3. DevTools → Network: chunks `motion-*.js` y páginas lazy al primer visit.
4. Activar reduced motion → headers y números sin animación.

### Iteración 3 — aplicado (jul 2026)

| Área | Cambio |
|------|--------|
| Resultados | `MotionContentSwap` filtro/orden/búsqueda |
| Resultados | Panel detalle `AnimatePresence` |
| Resultados | Hero métricas `AnimatedNumber` |
| Eventos | `MotionContentSwap` al cambiar filtro |
| Reglamento | `AnimatedSectionHeader` + `MotionTabPanel` + stagger resumen |

Nuevos: `MotionContentSwap.tsx`, `MotionTabPanel.tsx`

### Iteración 2 — aplicado (jul 2026)

| Área | Cambio |
|------|--------|
| Pitbull hero | `PitbullHeroRail` con `TiltCard` (placa operativa) |
| Pitbull spotlight | `MaskReveal` en fotos + `EventDatePlate` + stagger en ficha |
| Pitbull quick facts | `StaggerReveal` en grilla |
| Eventos hero | Secuencia Motion en `EventsPluHero` |
| Eventos spotlight | Misma mejora vía `PitbullSpotlight--events` |
| Resultados podio | `AnimatedNumber` en totales; `TiltCard` + línea dorada en 1° |

Nuevos: `MaskReveal.tsx`, `EventDatePlate.tsx`, `parseAthleteTotal.js`

---

## Reglas de uso para el equipo

- **CSS**: hover, focus, bordes, elevación, icon drift.
- **Motion**: reveal, stagger, drawers, modales, tabs, cambio de estado.
- **CSS 3D**: solo elementos premium (credencial, placa, récord).
- **No**: blobs, glows permanentes, parallax agresivo, animar filas de tablas grandes.
- Siempre respetar `prefers-reduced-motion`.
