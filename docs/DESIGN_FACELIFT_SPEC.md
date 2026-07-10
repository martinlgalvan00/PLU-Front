# PLU ARG — Spec técnica de facelift visual

Documento de implementación para refactor visual del frontend existente
(Vite + React + CSS modular con custom properties). **No introduce Tailwind**
ni ninguna dependencia nueva: el repo ya tiene un sistema de design tokens
equivalente en `src/styles/variables.css` + `src/styles/themes/*.css`, y
agregar un segundo sistema (Tailwind) encima duplicaría la fuente de verdad
y violaría la restricción de "no dependencias innecesarias". Esta spec
**extiende y depura** el sistema de tokens que ya existe, no lo reemplaza.

Objetivo: minimalista, humano, premium, institucional — menos "SaaS
generado por IA", más alineado al ecosistema Powerlifting United (sobrio,
funcional, con identidad deportiva real).

---

## 1. Design tokens — ubicación real

Ya existen y son la fuente de verdad. No se crean archivos de tokens nuevos.

| Token group | Archivo |
|---|---|
| Paleta primitiva (`--plu-*`) | `src/styles/tokens/palette.css` |
| Tokens semánticos compartidos (glow, elevación, tipografía, spacing, radios) | `src/styles/variables.css` |
| Tokens de tema oscuro (`--color-*`) | `src/styles/themes/dark.css` |
| Tokens de tema claro (`--color-*`) | `src/styles/themes/light.css` |
| Tokens específicos de páginas "design" (hero, login, spotlight) | `src/styles/themes/design-pages-theme.css` |

## 2. Paleta

Primitivos ya definidos en `palette.css` (no se tocan los valores hex, solo
se audita su USO):

- **Rojo marca**: `--plu-red-500 #e10600` (acción primaria, único acento
  "urgente" — CTAs, estados live, badges de alerta)
- **Celeste**: `--plu-celeste-400 #74acdf` (acento secundario/link, no
  competir con el rojo — usar en foco, links, iconografía informativa)
- **Dorado**: `--plu-gold-500 #c9b978` (reservado para momentos premium:
  medallas, membresía, resultados — no usar como color de acción genérico)
- **Neutros dark**: `--plu-cool-950/900/800/750` (superficies dark, de más
  a menos profundo)
- **Neutros light**: `--plu-warm-50/100` + `--plu-ink-900` (superficies y
  texto light)

**Regla de disciplina nueva**: máximo un acento de color por bloque visual
(card, sección, banner). No mezclar rojo+celeste+dorado en el mismo
elemento salvo la línea de acento de 1.5px (`--gradient-brand`) que ya
funciona como firma de marca — esa se mantiene, es sutil y funcional.

## 3. Tipografía

Ya definida en `variables.css`, sin cambios de familia:

```css
--font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif;
--font-display: 'Poppins', ui-sans-serif, system-ui, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

**Ajuste de uso** (no de token): reducir el uso de `text-transform: uppercase`
+ `letter-spacing: wide` a headings de sección y badges de estado
exclusivamente. Hoy aparece en demasiados lugares (h3 de cards, eyebrows,
labels) y es uno de los tells más "genéricos". Jerarquía objetivo:

| Nivel | Tamaño | Peso | Transform |
|---|---|---|---|
| H1 hero/página | `clamp(28px,4.2vw,46px)` | 700 | ninguno |
| H2 sección | `clamp(22px,3.2vw,36px)` | 700 | ninguno |
| H3 card | 16–18px | 600 (bajar de 700) | ninguno (bajar de uppercase) |
| Eyebrow/badge | 10–11px | 600–700 | uppercase (único lugar permitido) |
| Body | 14–15px | 400 | ninguno |

## 4. Spacing

Sin cambios de escala — ya es coherente (`variables.css`):

```css
--space-xs: 4px;  --space-sm: 8px;  --space-md: 16px;  --space-lg: 24px;
--space-xl: 32px; --space-2xl: 48px; --space-3xl: 72px; --space-4xl: 96px;
```

Uso recomendado: secciones de página en `--space-3xl`/`--space-4xl`
vertical (ya se usa así), cards internas en `--space-lg`/`--space-xl`.

## 5. Radios

Sin cambios de escala:

```css
--border-radius-sm: 6px;  --border-radius-md: 10px; --border-radius-lg: 14px;
--border-radius-xl: 18px; --border-radius-2xl: 24px; --border-radius-pill: 999px;
```

Regla: botones y inputs → `md`; cards → `lg`/`xl`; badges/pills → `pill`.
Ya se respeta en la mayoría del código — mantener.

## 6. Sombras / elevación

Consolidar sobre los tokens que ya existen (`--elevation-sm/md/lg` en
`variables.css`) y **dejar de declarar `box-shadow` ad hoc** con valores
tipo `0 32px 80px rgba(0,0,0,0.32)` sueltos en componentes individuales
(aparece repetido con variaciones ligeras en `plu-ui.css`, `cards.css`,
`design-phase2.css`). Regla nueva:

- Hover de card/botón → `--elevation-sm` o `--elevation-md` (nunca inventar
  un shadow nuevo por componente).
- Modal/overlay flotante → `--elevation-lg`.
- Glow de color (`--glow-red/gold/celeste`) → **solo** en hover de CTA
  primario, nunca como decoración estática de fondo.

## 7. Estados hover / focus

Ya hay una base correcta en `buttons.css` (`:focus-visible` con outline
celeste + ring) — **extender el mismo patrón a todo elemento interactivo**
que hoy no lo tiene explícito (cards clickeables, links de nav, filtros).

```css
/* patrón único de foco — reutilizar, no reinventar por componente */
.is-focusable:focus-visible {
  outline: 2px solid var(--color-brand-celeste);
  outline-offset: 3px;
  box-shadow: 0 0 0 4px rgba(116, 172, 223, 0.2);
}
```

Hover: elevar (`translateY(-1px)` a `-3px` según tamaño del elemento) +
`--elevation-sm/md`, sin gradientes de color nuevos. Ya es el patrón
dominante — solo hay que quitar las excepciones con blobs radiales.

## 8. Estructura de la Home

Sin cambios estructurales (no se reordenan ni eliminan secciones — son
contenido real, no decorativo). Componentes usados hoy, en orden:

1. `HeroSection` (`src/components/layout/HeroSection.jsx`)
2. `AboutSection` (pilares "Estándar internacional / Gestión sin planillas /
   Comunidad en crecimiento")
3. `PitbullSpotlight` (variant `home`)
4. `HomeMembershipBand`
5. `HomeResultsTeaser` + `HomeRulebookTeaser` (par de teasers)
6. `CommunitySpotlight`
7. `FAQAccordion` (home preview)
8. `Footer`

**Cambio de tratamiento, no de estructura**: reducir la repetición mecánica
de "eyebrow + título + descripción + CTA" idéntica en cada sección. Variar
al menos el ritmo visual entre secciones consecutivas (alternar alineación
izquierda/centrada, alternar si el eyebrow lleva punto animado o no —
hoy el punto pulsante aparece en casi todos lados y pierde su función de
señalar "en vivo").

## 9. Estructura del admin

Sin cambios estructurales — `AdminShell` (sidebar + contenido) ya es un
patrón de dashboard estándar y funcional, no tiene los tells de "AI
generado" que sí tiene el sitio público (no usa gradientes decorativos).
Fase 3 se limita a:

- Auditar `admin.css` por los mismos shadows/gradientes ad hoc que se
  limpiaron en fase 1 (mismo patrón, aplicar la misma regla del §6).
- `DataTable`, `StatusPill`, `EmptyState`, `LoadingState`, `ErrorState`:
  confirmar que usan los tokens de §2–7 sin valores hardcodeados propios.
- No tocar lógica de permisos, roles ni fetch de datos.

## 10. Componentes a modificar

Solo estilo (`className`/CSS), cero cambio de props, cero componente nuevo:

| Componente | Archivo | Motivo |
|---|---|---|
| `LoginPage` | `src/pages/LoginPage.jsx` + `design-phase2.css` | ✅ hecho — wash de gradiente eliminado |
| `DesignPageHero` | `src/components/layout/DesignPageHero.jsx` + `design-phase2.css`, `design-pages-theme.css` | ✅ hecho — surface plano |
| `CTASection` | `src/components/ui/CTASection.jsx` + `plu-ui.css`, `effects.css` | ✅ hecho — blob duplicado eliminado |
| `SectionHeading` | `src/components/ui/SectionHeading.jsx` + su CSS | Fase 1 — bajar peso visual del eyebrow-dot |
| `Button` (`.btn*`) | `src/components/ui/Button.jsx` + `buttons.css` | Fase 1 — auditar consistencia de shadow (§6) |
| `Cards` (`BenefitCard`/`InfoCard`) | `src/components/ui/Cards.jsx` + `cards.css` | Fase 1 — bajar `uppercase` de h3 (§3) |
| `NavbarPublic` | `src/components/layout/NavbarPublic.jsx` + `header.css` | Fase 1 — ya limpio, solo auditoría de foco (§7) |
| `Footer` | `src/components/layout/Footer.jsx` + estilos en `design-phase2.css`/`home.css` (footer.css fue removido en una limpieza previa) | Fase 1 — confirmar que no quedó CSS huérfano |
| `EventCard`, `ResultCard` | `src/components/ui/*.jsx` + `home.css`/`results.css` | Fase 2 |
| `AdminShell`, `DataTable` | `src/components/layout/AdminShell.jsx`, `src/components/ui/DataTable.jsx` + `admin-shell.css`, `admin.css` | Fase 3 |
| PLU USA partner view | `src/pages/admin/*` (secciones con `restrictedNav`) | Fase 4 |

## 11. CSS sugerido (patrones, no archivos nuevos)

```css
/* Eyebrow más discreto — el punto pulsante queda solo para estados
   realmente "en vivo" (ej. transmisión), no decorativo por defecto */
.section-heading__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em; /* bajar de 0.2em */
}

/* H3 de card — sin mayúsculas forzadas */
.benefit-card h3, .info-card h3 {
  text-transform: none;
  font-weight: 600; /* bajar de 700 */
  letter-spacing: -0.01em;
}

/* Shadow consolidado — reemplaza valores ad hoc por el token existente */
.cta-section__inner:hover {
  box-shadow: var(--elevation-md); /* antes: var(--glow-red-soft), 0 32px 80px rgba(0,0,0,.32) */
}
```

## 12. Responsive / mobile

Sin cambios de breakpoints (ya usa `clamp()` fluido + media queries
puntuales, es un enfoque correcto). Verificar únicamente que los fixes de
gradiente/opacity de fase 1 no rompan los overrides mobile existentes en
`design-phase2.css` (líneas ~1927–2013 para login, equivalentes para
design-hero) — son overrides de *layout*, no de color, así que no deberían
verse afectados, pero se re-testea en viewport 375px como parte del
checklist.

## 13. Diferencias respecto a la app actual

| Antes | Después | Estado |
|---|---|---|
| `.login-page--design::before/::after` con radial-gradient rojo/celeste + grid de puntos | Canvas plano `var(--color-page-canvas)` | ✅ hecho |
| `--design-hero-surface` con 2 radiales + diagonal en light theme | `var(--plu-warm-50)` plano | ✅ hecho |
| `.cta-section__inner::before` duplicado en `plu-ui.css` **y** `effects.css` (el segundo literalmente comentado "glassmorphism") | Una sola declaración, sin blobs, con la línea de acento superior | ✅ hecho |
| H3 de card en `uppercase` + peso 700 | `none` + peso 600 | Fase 1 |
| Eyebrow-dot pulsante en cada sección | Reservado a estados live reales | Fase 1 |
| Shadows ad hoc por componente | Tokens `--elevation-*` | Fase 1–3 |
| Sin Tailwind | Sin Tailwind (se descarta explícitamente) | — |

## 14. Checklist de implementación

**Fase 1 — Home + navbar + hero + cards + botones + footer**
- [x] Login: quitar wash de gradiente
- [x] DesignPageHero: surface plano
- [x] CTASection: quitar blob duplicado
- [x] SectionHeading: auditado — ya estaba en 10px/0.14em sin dot pulsante, no necesitaba cambio (el dot pulsante solo existe en `.design-hero__eyebrow-dot`, componente distinto, fuera del scope de Home)
- [x] Cards (`BenefitCard`/`InfoCard`): h3 sin uppercase, peso 700→600, letter-spacing -0.01em
- [x] Botones: shadows ad hoc (`.btn--secondary`, `.btn--outline`, `.export-btn`) consolidados a `--elevation-sm`; `.cta-section__inner:hover` a `--elevation-md`
- [x] NavbarPublic: auditado — foco visible ya cubre logo, links, dropdown trigger (hereda de `.site-header__link`), dropdown items, mobile chips y drawer items. Sin cambios necesarios
- [x] Footer: auditado — estilos viven en `design-phase2.css` (consolidados ahí tras borrar `footer.css` en una limpieza previa), sin reglas huérfanas
- [x] `npm run build` limpio
- [x] Captura visual confirmada a resolución real: login, hero/records, y tarjetas "Resultados de evento / Récords oficiales" (antes uppercase+700, ahora sentence-case+600)

**Fase 2 — Landings públicas** (Events, Results, Records, Rulebook, Community, FAQ, Contact, Pitbull, Members)
- [x] Auditado visualmente (Playwright, no solo CSS) — las 9 páginas ya quedaron limpias porque todas usan `DesignPageHero`/`CTASection` (fase 1), no tenían wash de gradiente propio adicional
- [x] `EventCard`: ya estaba en sentence-case/700, sin cambios
- [x] `ResultCard`: `.result-card__athlete` (nombre del atleta) estaba en uppercase + peso 800 — bajado a sentence-case/700, igual que las tarjetas de Records. Nota: `ResultCard` no está importado en ninguna página todavía (componente con stories pero sin uso real actual) — el fix queda listo para cuando se conecte
- [x] `npm run build` limpio

**Fase 3 — Admin dashboard + tablas + sidebar**
- [x] `AdminShell`/`admin-shell.css`: auditado (jul. 2026) — sin gradientes decorativos, sidebar y
      topbar ya usan tokens; único hallazgo fue el dorado apagado en `admin.css` (14 declaraciones),
      corregido en la auditoría anti-IA — ver `PLU_BRAND_ALIGNMENT.md` §7
- [x] `DataTable`, `StatusPill`, `EmptyState`, `LoadingState`, `ErrorState`: confirmado — sin colores
      hardcodeados en JS, todo vía clases + tokens CSS
- [x] Sin cambios de permisos/roles/fetch

**Fase 4 — Vista PLU USA**
- [x] Auditado (jul. 2026) — `PluUsaSection.jsx` ya usa tokens, sin acciones de escritura, tag
      "read-only" visible, export CSV funcional. Sin hallazgos.

**Restricciones activas en las 4 fases**: sin Mercado Pago, sin lógica de
negocio nueva, sin componentes fantasma, sin dependencias nuevas, build
limpio en cada fase.

## 15. Hero de Home — rediseño real (post-Fase 2)

El hero del Home nunca había recibido una pasada de diseño propia — solo
heredaba fixes de componentes compartidos. Al revisarlo en el navegador
real se encontraron dos problemas genuinos, no cosméticos:

1. **Espacio vacío enorme**: la grilla ya reservaba una columna derecha de
   340–480px (`@media (min-width:1200px) .hero__copy-inner`) pero solo
   tenía `HeroStatusCard` (una tarjeta chica) flotando ahí — el resto del
   alto quedaba vacío. En mobile/tablet (`<1200px`) el problema era el
   mismo alto forzado (`min-height: min(72vh,680px)`) sin nada que lo
   llenara.
2. **Cero energía humana/fotográfica** en la primera pantalla del sitio de
   una federación deportiva — solo tipografía sobre un fondo plano (y en
   tema claro, el mismo wash de gradiente que ya se había eliminado en
   otros lugares, sin que yo lo hubiera revisado acá).

**Fix**: se reutiliza `powerlifting-hero.png` (mismo asset que ya usa
`PitbullSpotlight`, sin importar nada nuevo) como fondo de la columna
derecha vía `--home-hero-copy-bg` (`design-pages-theme.css`), con un
degradé lateral que protege la legibilidad del texto a la izquierda.
Ambos temas actualizados. Alto máximo del hero recortado de
`min(100svh,960px)` a `min(92svh,860px)`.

**Bug de contraste real, encontrado y arreglado antes de dar por
terminado**: a `<1200px` el layout colapsa a una sola columna — el texto
pasa a ocupar todo el ancho, así que el degradé lateral (pensado para 2
columnas) dejaba título/texto oscuro (tema claro) directamente sobre la
foto, con contraste roto. Se agregó un scrim uniforme + override de los
tokens de texto del hero (`--home-hero-title`, `--home-hero-lead`, etc.)
para que en ese ancho el tema claro tome prestados los mismos valores que
ya usa el tema oscuro — son los correctos para texto sobre foto,
reutilizados, no inventados. Verificado en 390px (mobile) y confirmado
legible.

Verificado: `npm run build` limpio, captura real en mobile (390px),
desktop tema claro y desktop tema oscuro.

## 16. Resto de secciones del Home — auditoría sección por sección

Se revisó cada sección restante del Home en el navegador real (no solo
CSS): About/pilares 01-02-03, PitbullSpotlight (variant `home`), banda de
afiliación, teasers de resultados/reglamento, Community spotlight, FAQ
preview.

**Único hallazgo real**: `CommunitySpotlight` — el panel visual (mientras
no hay foto real) mostraba un caption en `font-family: var(--font-mono)`
con el texto `"foto — comunidad, gimnasio, magnesio en tarima"`
(`src/lib/content/es.js` / `en.js`) — literalmente un brief de foto de
diseño (Figma) que quedó pegado en producción y se le mostraba al
usuario final. Fix:
- Copy cambiado a un mensaje real: *"Galería de la comunidad —
  próximamente"* (ES) / *"Community gallery — coming soon"* (EN).
- Tipografía del caption pasada de monoespaciada a la fuente normal del
  sitio.
- Agregado un ícono `Users` (lucide-react, ya es dependencia — sin
  paquetes nuevos) centrado en el panel para que se lea como un
  placeholder de contenido intencional, no como una caja vacía.

**Resto de secciones**: ya estaban bien diseñadas — sin espacios vacíos,
sin problemas de contraste, sin tells de "IA genérica". No se tocaron.

Verificado: `npm run build` limpio, captura real de Community
post-fix.

## 17. Rediseño inspirado en powerliftingunited.com (federación madre)

Se auditó el sitio real (WebFetch + captura visual real, no solo texto) y
se adaptaron 3 patrones concretos — sin copiar literalmente (foto, logo,
copy y bandera propios en todo momento):

**Hero → foto full-bleed + texto centrado.** Antes: split 2 columnas
(texto | tarjeta de stats flotando en una columna vacía). Ahora: la misma
foto (`powerlifting-hero.png`, mismo asset que ya usaba `PitbullSpotlight`)
cubre todo el hero, texto centrado encima, tarjeta de stats centrada abajo
como franja horizontal. Cambios en `home.css`/`design-pages-theme.css`:
- `--home-hero-copy-bg` unificado (mismo scrim + foto en los dos temas —
  el hero ya no depende del canvas claro/oscuro del resto del sitio,
  igual que en el sitio real).
- Grid de 2 columnas eliminado en los 3 breakpoints (`≥1200px`,
  `641–1199px`, `≥1600px`) → flex-column centrado.
- Líneas de acento rojas decorativas (`.hero__editorial::before`,
  `.hero__actions::before`) eliminadas — ya no tenían sentido centradas y
  avanzan el punto de disciplina de color.

**Bugs reales encontrados y arreglados en el camino** (no cosméticos):
- `.hero__editorial` tiene `container-type: inline-size` pero quedó sin
  `width` explícito al pasar a flex-column — el *containment* colapsaba
  el ancho al mínimo (título partido en una columna de ~70px). Fix:
  `width: 100%`.
- Tarjeta de stats en mobile (≤480px): grid de 2 columnas + columna de
  marca no entraban sin solaparse. Fix: agregado
  `@media (max-width: 480px)` que apila todo en una columna.
- `letter-spacing: -0.03em` en el título a peso 800 colisionaba trazos en
  ciertas palabras ("fuerza") a tamaños de mobile — confirmado real (no
  artefacto de animación) probando con animaciones desactivadas. Relajado
  a `-0.01em` en ese breakpoint.

**Accesos rápidos → grid de cards con ícono.** Antes: barra de pills
horizontal angosta (scroll horizontal, sin jerarquía visual). Ahora: grid
de cards (ícono en círculo + label), como el grid Events/Rulebook/Records/
Shop del sitio real — adaptado a nuestros 5 accesos (Afiliación, Pitbull
Classic, Eventos, Resultados, Reglamento) en vez de forzar a 4.
Implementado con clases nuevas (`__grid`/`__card`) en vez de reescribir
`__link`/`__track`/`__shell` existentes (quedan sin uso, intactos) — el
archivo estaba en edición activa en paralelo y esto minimizó el riesgo de
choque. Bug encontrado en el camino: el grid heredaba `align-items:stretch`
del contexto flex y estiraba las cards a la altura completa del contenedor
(~540px vacíos) — fix con `grid-auto-rows: min-content` + `align-self: start`.

**Disciplina de color**: en paralelo a este trabajo, la paleta de botones
por defecto y el CTA primario del hero pasaron de rojo a celeste/dorado
(edición directa del usuario en `buttons.css`/`home.css` — no revertida).
El resultado combinado deja el rojo reservado casi exclusivamente a
contenido real (marcas/discos en las fotos) y al botón "Acceder", muy en
línea con el uso disciplinado del sitio real.

Verificado: `npm run build` limpio; capturas reales en desktop claro,
desktop oscuro, tablet (900px) y mobile (390px).
