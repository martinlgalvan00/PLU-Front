# PLU ARG — Implementation spec: Alternativa A (Institucional premium)

Spec de implementación para Claude Code. Ejecuta la Alternativa A elegida
sobre Home pública y Pitbull Classic (ver propuesta visual completa,
artifact "PLU Argentina — Dirección visual"). **No introduce Tailwind ni
dependencias nuevas** — extiende el sistema de tokens que ya existe en
`src/styles/tokens/palette.css`, `src/styles/variables.css` y
`src/styles/themes/*.css`, siguiendo la misma convención que
`DESIGN_FACELIFT_SPEC.md`.

## 0. Contexto que esta spec ya tiene en cuenta

Antes de escribir esta spec se releyeron `PLU_USA_VISUAL_REVIEW.md`,
`PLU_BRAND_ALIGNMENT.md` y `DESIGN_FACELIFT_SPEC.md`, y se verificó el
código actual (no solo esos documentos) para no proponer trabajo ya hecho
ni pasar por alto una regresión real:

- La paleta (`palette.css`), la eliminación de rojo decorativo y el drift
  de dorado apagado **ya están resueltos** (fase anti-IA de jul. 2026). No
  se tocan valores hex de marca en esta spec.
- El hero de Home tuvo una iteración con foto full-bleed (§17 de
  `DESIGN_FACELIFT_SPEC.md`) que **fue revertida**: hoy
  `design-pages-theme.css:131` dice explícitamente *"Fondo editorial del
  hero — sin foto, solo gradientes de marca"*, y `.hero__copy-bg` queda
  definido en `home.css:64-70` pero apagado con `display:none` en
  **ambos** temas (`home.css:3968-3970` dark, `home.css:4368-4370`
  light). Es código muerto — no un bug de reciente introducción, sino una
  decisión de producto que dejó el layer huérfano.
- El fondo del hero en tema oscuro (`--home-hero-bg`,
  `design-pages-theme.css:126-131`) es 2 `radial-gradient` + un
  `repeating-linear-gradient` diagonal de ruido + un `linear-gradient`
  vertical. Esto es la "viñeta artificial" que reportaste — no una
  sombra decorativa aislada, es el fondo completo del hero en dark mode.
- Restricciones activas que se heredan de la fase anterior y siguen
  vigentes en esta spec: sin Mercado Pago ni lógica de negocio nueva, sin
  componentes fantasma, sin dependencias nuevas, **sin slot de imagen
  especulativo sin asset real** (regla explícita en
  `PLU_BRAND_ALIGNMENT.md` §4 — no se agrega ningún `<img>` a la derecha
  del hero a menos que exista un archivo de imagen real para mostrar en
  él), un acento de color por bloque visual, glow **solo** en hover de CTA
  primario, `npm run build` limpio en cada fase.

## 1. Fase 1 — Home

### 1.1 Hero — `src/components/layout/HeroSection.jsx` + `src/styles/pages/home.css` + `src/styles/themes/design-pages-theme.css`

- **Retirar código muerto**: eliminar el `<div className="hero__copy-bg" aria-hidden />`
  de `HeroSection.jsx:35` y las reglas asociadas
  (`home.css:64-70`, `home.css:72-76`, `home.css:3968-3970`,
  `home.css:4368-4370`) y los tokens `--home-hero-copy-bg`
  (`design-pages-theme.css:132`, `:594`) que ya no se usan.
- **Reemplazar `--home-hero-bg` dark** (`design-pages-theme.css:126-130`)
  por un fondo sólido con intención: `var(--plu-cool-950)` plano, o como
  máximo un `linear-gradient` vertical de 2 stops sutil (ink → ink un
  tono más claro), sin `radial-gradient` ni `repeating-linear-gradient`.
  El tema claro (`design-pages-theme.css:593`, `--plu-warm-50` plano) ya
  cumple el objetivo — usarlo como referencia de "cuánto ruido es cero".
- **`HeroStatusCard` (`src/components/ui/HeroStatusCard.jsx`)**: hoy es
  una sola línea de texto (`hero-meta__line` + `hero-meta__note`) — es lo
  que hoy "llena" el lado derecho/inferior del hero y se siente
  insuficiente. Dale peso real: borde fino (`1px solid var(--hairline)`
  o el token de borde que corresponda por tema), padding generoso,
  cifras en `var(--font-mono)` con `font-variant-numeric: tabular-nums`.
  Usar únicamente datos reales ya disponibles vía `useContent`/i18n (no
  inventar cifras) — si no hay más datos reales que los 3 actuales
  (PLU USA · 2026 · próximo meet), no se agregan campos ficticios; se
  invierte en tipografía y espaciado, no en contenido inventado.
- **CTAs**: bajar peso visual de `hero__secondary-links` (link "Ver
  eventos" + pill "Mi cuenta") para que quede claro que hay 1 CTA
  primario (Afiliarme, dorado) + 1 secundario (Pitbull Classic, outline
  celeste) y el resto es navegación terciaria, no CTAs compitiendo.
  Reducir tamaño de fuente/opacidad de `.hero__secondary-link` y
  `.hero__account-pill`, sin quitar funcionalidad.

### 1.2 Fondo global de Home (dark) — `home.css:4050-4131`

- Eliminar los 3 `radial-gradient` de `[data-theme='dark'] .home-page::before`
  (`home.css:4056-4062`).
- Eliminar los blobs con `blur(56px)` de
  `.home-section--immersive::before` (`4101-4113`),
  `.home-section--pitbull-home::before` (`4115-4119`) y
  `.home-section--community::before` (`4125-4131`).
- Mantener el `border-top: 1px solid rgba(255,255,255,.05)` que ya separa
  secciones (`4075`) — ese es el separador sobrio que reemplaza a los
  blobs.
- Tema claro: aplicar el mismo criterio al radial suave de
  `[data-theme='light'] .home-section--community` (`home.css:3247-3251`,
  ~0.08 de opacidad) — bajo impacto pero inconsistente con "cero aurora"
  si el oscuro queda limpio y el claro no.

### 1.3 Números de "Quiénes somos" — `home.css:2419-2439`

- Quitar el `background-clip: text` en degradado celeste→dorado de
  `.about-pillar-card__index` en ambos temas. Reemplazar por color sólido
  `var(--color-brand-celeste)`, peso 700, sin degradado.

### 1.4 Accesos rápidos — `src/components/ui/HomeQuickBand.jsx` (`variant="dock"`) + `home.css` (bloque `~920-960`)

- Retirar `backdrop-filter: blur(12px) saturate(1.25)` y la sombra doble
  (`--home-quick-band-shell-shadow` + `--home-quick-band-shell-glow`).
  Reemplazar por superficie sólida (`var(--paper-raised)`/equivalente
  del tema) + borde superior de 1px. Sin blur, sin glow.

### 1.5 Unificar cards ad hoc

- `about-pillar-card`, `home-teaser-card` (`HomeResultsTeaser`/
  `HomeRulebookTeaser`), `home-membership-card`: alinear border, radio y
  sombra a una única receta (`border: 1px solid var(--hairline-token)`,
  `border-radius: var(--border-radius-lg)`, sombra **solo** en hover vía
  `var(--elevation-sm)`). No requiere migrar a un componente `Card`
  compartido nuevo — ajustar los valores en cada selector existente
  alcanza y es de menor riesgo.

### 1.6 Resultados/récords y afiliación

- `HomeResultsTeaser`: si hay datos reales de récords disponibles vía
  `useContent` (confirmar contra `RecordsPage.jsx`), mostrar 2-3 filas
  reales en formato tabular mono (disciplina / atleta / marca) en vez de
  card decorativa. Si no hay datos reales accesibles desde Home hoy,
  mantener como teaser de link pero con el tratamiento de card de §1.5
  (no inventar datos para llenar la tabla).
- `HomeMembershipBand`: pasar de "cards de precio" a tabla comparativa de
  categorías si el dato ya existe en `useContent` (confirmar contra la
  página de Afiliación, que según `PLU_USA_VISUAL_REVIEW.md` §8 ya tiene
  comparación de 3 planes correcta) — si migrar la tabla completa es
  desproporcionado para esta fase, dejar como nota para Fase 3 y no
  bloquear el resto.

### 1.7 Footer

- Verificar visualmente antes de tocar: por diagnóstico previo no
  presenta problemas mayores. Confirmar que no quede ningún
  `--gradient-brand`/stripe decorativo sin función y que el borde
  superior sea una línea sólida de 1px. Si ya cumple, no modificar.

## 2. Fase 2 — Pitbull Classic

### 2.1 Hero propio — `src/pages/PitbullPage.jsx:678-700` + nuevo bloque CSS scopeado a `.pitbull-hero`

`DesignPageHero` es compartido con Reglamento/FAQ/Comunidad/Records — no
se modifica su CSS base (afectaría a esas páginas). Se agrega un bloque
de reglas scopeadas a `.design-hero.pitbull-hero` (el `className`
que `PitbullPage.jsx:678` ya pasa) en `pitbull.css`:

- Fondo sólido propio (ink o azul marca muy oscuro), distinto del canvas
  compartido de `design-hero`.
- Título más grande que el de las páginas institucionales genéricas.
- El breadcrumb y el badge (ver 2.2) heredan la jerarquía visual de
  evento, no de página secundaria.

### 2.2 Badge "Meet oficial" real

Hoy `eyebrow` renderiza `.design-hero__eyebrow` con
`.design-hero__eyebrow-dot` (`DesignPageHero.jsx:34-39`,
`design-phase2.css:185-203`) — mismo tratamiento que cualquier otra
página. Sin tocar la regla base (la usan otras páginas), agregar
`.pitbull-hero .design-hero__eyebrow`:

```css
.pitbull-hero .design-hero__eyebrow {
  background: var(--ink-token); /* sólido, no transparente */
  color: var(--gold-token);
  border: 1px solid var(--gold-token);
  border-bottom: none; /* sin heredar el border-bottom de la regla base */
  padding: 6px 12px;
  letter-spacing: 0.08em;
}
.pitbull-hero .design-hero__eyebrow-dot {
  display: none; /* el sello no necesita el punto "en vivo" */
}
```

Reemplazar `--ink-token`/`--gold-token` por los tokens reales de tema
vigentes en `pitbull.css` (mismo patrón `[data-theme='dark']`/
`[data-theme='light']` que el resto del archivo).

### 2.3 Ficha técnica — `PitbullQuickFactsSection` (`PitbullPage.jsx:106-176`) + clase `.pitbull-fact-grid`

Convertir el grid de "fact cards" en una lista de definición tabular
(`<dl>` con filas separadas por línea fina, o `<table>` si el dato lo
amerita): término en mono/uppercase pequeño, valor en fuente de cuerpo.
Mismo dato, distinto envoltorio — no cambia `useContent`.

### 2.4 Contador de cupos — `PitbullInscriptionCounter` (`PitbullPage.jsx:72-103`)

Mantener el dot si representa un estado realmente vivo (cupos que
cambian en tiempo real) — coherente con la regla ya escrita en
`DESIGN_FACELIFT_SPEC.md` §"eyebrow-dot reservado a estados live
reales". Rediseñar el envoltorio: barra de progreso de 1px de alto,
relleno sólido sin glow, cifra en mono tabular ("42 de 120 cupos").

### 2.5 Panel de inscripción — `PitbullInscriptionSection` (`PitbullPage.jsx:400-490`)

Alinear el tratamiento de pricing al mismo patrón de tabla que se defina
en 1.6 para la banda de membresía de Home — mismo lenguaje visual para
"cuánto cuesta ser socio" y "cuánto cuesta inscribirse al evento".

### 2.6 Atletas — `PitbullAthletesSection` (`PitbullPage.jsx:178-218`)

Ya usa `<dl>` agrupado por categoría — es la estructura correcta. Pasada
de estilo únicamente: separadores de línea fina, mono para
categoría/número si aplica.

### 2.7 Timeline — `PitbullScheduleStrip` (`PitbullPage.jsx:259-288`)

De grid de día×horario a lista tabular hora/actividad con
`font-variant-numeric: tabular-nums`, filas separadas por línea fina en
vez de cards de grid.

### 2.8 FAQ

Sin cambios estructurales — mismo `FAQAccordion` que Home. Confirmar
paridad visual con la instancia de Home tras los cambios de §1.

### 2.9 Mobile

Confirmar que la ficha técnica tabular y el timeline colapsan a una sola
columna sin necesitar un layout mobile alternativo (el patrón de filas
con línea fina ya es mobile-first). Verificar `StickyMobileCta` en
Pitbull (confirmar si ya está montado o si es exclusivo de Home).

## 3. Fase 3 — Tokens transversales

- Auditar `variables.css` (`--glow-*`) y confirmar que ninguno se usa
  como decoración estática de fondo — solo en `:hover` de CTA primario
  (regla ya vigente, esta fase solo verifica que no haya excepciones
  nuevas introducidas por las fases 1-2).
- Si aparecen 3+ usos del mismo valor `rgba()` de borde/hairline suelto
  durante la implementación de 1.5/2.3/2.6/2.7, consolidar en un token
  nombrado (`--hairline` o el que ya exista más cercano) en vez de
  repetir el literal — evita reintroducir el mismo tipo de drift que
  motivó la auditoría anti-IA de dorado.

## 4. Checklist de verificación

- [ ] `npm run build` limpio después de cada fase.
- [ ] Captura real (no solo lectura de CSS) en desktop tema claro,
      desktop tema oscuro y mobile 390px: Home hero, Home scroll
      completo, Pitbull hero, Pitbull ficha técnica + inscripción,
      Pitbull mobile.
- [ ] Grep dirigido post-cambio confirmando cero
      `radial-gradient|blur\(|backdrop-filter` decorativo remanente en
      `home.css`/`pitbull.css` fuera de los usos permitidos (glow en
      hover de CTA primario).
- [ ] Contraste de texto sobre el nuevo fondo sólido del hero (dark
      theme) verificado, no asumido.
- [ ] Sin componentes fantasma, sin dependencias nuevas, sin Mercado
      Pago ni lógica de negocio nueva (restricciones heredadas).

## 5. Fuera de alcance de esta fase

- Alternativa B (fotografía real) queda pendiente de banco de fotos
  propio de PLU ARG — no se agrega ningún `<img>` ni slot especulativo
  en esta implementación, por la regla ya vigente en
  `PLU_BRAND_ALIGNMENT.md` §4.
- Brand guidelines oficiales de PLU USA pendientes (tipografía,
  mayúsculas en CTA, lockup conjunto) — no se resuelven acá, ver
  `PLU_BRAND_ALIGNMENT.md` §5.
