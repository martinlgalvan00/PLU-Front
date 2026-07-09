# PLU Brand Alignment — Argentina × Powerlifting United

Documento vivo. Registra qué se tomó de referencia de `powerliftingunited.com`, qué se adapta
literalmente y qué decisiones quedan abiertas hasta recibir brand guidelines oficiales de PLU USA.

**Actualización jul. 2026:** decisión de producto revertida respecto a la versión anterior de
este documento. Hasta esta fecha, la política era "solo estructura y tono, copy 100% propio".
A partir de ahora, el copy institucional (nav, hero, misión, beneficios, FAQ, contacto) se
**traduce/adapta fielmente** del contenido real de `powerliftingunited.com` en ES y EN. Se
mantiene un único carve-out: los datos de negocio propios de PLU ARG (precios en ARS, fechas y
cupos de Pitbull Classic, red de gimnasios afiliados, códigos de socio) no se tocan, porque no
tienen equivalente real en el sitio de EE.UU. — no es "copy institucional", es dato operativo.

**Contexto de negocio (jul. 2026):** PLU USA tiene developer in-house y guidelines con restricciones
que todavía no compartieron. Evalúan un subdominio oficial bajo Powerlifting United (el `.com.ar`
quedaría como redirect) y la posibilidad de integrar Argentina a su records management global.
Hasta que llegue ese material, este proyecto trabaja con **alineación visual prudente**: se acerca
al tono e institucionalidad de PLU USA sin adoptar nada que después haya que deshacer si las
guidelines dicen otra cosa.

---

## 1. Qué se tomó como referencia de Powerlifting United

Solo estructura, jerarquía y tono — nunca literal:

| Referencia | Cómo se aplicó en PLU ARG |
|---|---|
| Nav con Membresías / Eventos / Records / Rulebook como secciones de primer nivel | `NAV_EVENTOS` agrupa Pitbull/Eventos/Resultados/Records; Rulebook vive en "Recursos" |
| Fotografía real de atletas como recurso de credibilidad | Ver §4 — pendiente de banco propio, slot documentado en §6 |
| Iconografía de línea, sin relleno, sin glow | `lucide-react` en todo el proyecto, `strokeWidth` 1.5–1.75 |
| CTA de membresía siempre visible desde home | Hero + banda de afiliación + footer, regla de 2 clics ya documentada en `UX_UI_GUIDELINES.md` |
| Separación clara entre resultados de evento y récords históricos | `/records` (nuevo, Fase 5) explícitamente distingue ambos conceptos |
| Tono institucional, no de producto SaaS | Copy factual en todo el sitio — ver auditoría de copy en Fase 5.5, no se encontró lenguaje marketinero |

## 2. Qué se adapta literalmente (desde jul. 2026) y qué se evitó copiar

- **Logo** — PLU ARG usa el logo oficial de Powerlifting United (`plu-official-logo.png`) junto a un
  emblema circular propio de Argentina. No se diseñó un logo alternativo ni se modificó el oficial.
- **Textos** — el copy institucional (hero, misión, nav, beneficios de afiliación, FAQ, contacto,
  "Get Involved"/Comunidad) se traduce/adapta fielmente del contenido real de
  `powerliftingunited.com` en ES y EN. **Excepción:** datos de negocio propios de PLU ARG (precios
  en ARS, fechas/cupos de Pitbull Classic, red de gimnasios, códigos de afiliado) se mantienen
  intactos — no tienen equivalente real del lado de EE.UU.
- **Imágenes** — cero assets de powerliftingunited.com en este repo.
- **Colores exactos** — la paleta (`--plu-red`, `--plu-celeste`, `--plu-gold`) es propia de PLU ARG,
  con la celeste como guiño sutil a la bandera argentina. No se tomó la paleta de PLU USA porque no
  la conocemos con certeza — ver §5.
- **Layout / componentes exactos** — ningún componente de este repo es una copia de un componente de
  powerliftingunited.com. Los parecidos (nav con dropdowns, hero con CTA, cards de planes) son
  convenciones genéricas del rubro federativo, no imitación directa.

## 3. Archivos que controlan cada superficie (mapa de referencia rápida)

| Superficie | Componente | Estilos |
|---|---|---|
| Home | `src/pages/HomePage.jsx` | `src/styles/pages/home.css` |
| Navbar pública | `src/components/layout/NavbarPublic.jsx` | `src/styles/layout/header.css` |
| Hero | `src/components/layout/HeroSection.jsx` | `src/styles/pages/home.css` (`.hero__*`) |
| Cards (genéricas) | `src/components/ui/Cards.jsx` (no usado hoy — ver nota), clases sueltas `.info-card`/`.benefit-card` | `src/styles/components/cards.css` |
| Footer | `src/components/layout/Footer.jsx` | clases `.site-footer__*` en `header.css`/`home.css` |
| Records | `src/pages/RecordsPage.jsx` | `src/styles/pages/design-phase2.css` (`.records-*`) |
| Admin shell | `src/components/layout/AdminShell.jsx` | `src/styles/layout/admin-shell.css` |
| Admin dashboard | `src/pages/admin/DashboardSection.jsx` | `src/styles/pages/admin.css` |
| Vista PLU USA | `src/pages/admin/PluUsaSection.jsx` | `.admin-list-shell--plu-usa` en `admin.css` |

**Nota sobre `cards.css`:** hasta esta fase, `src/styles/components/cards.css` no estaba importado en
`src/styles/index.css` — quedó huérfano de una iteración anterior. Se corrigió en Fase 5.5. Es la
única página que depende de él hoy es `RecordsPage.jsx` — si vas a tocar `.info-card`/`.benefit-card`,
verificá con captura real, no solo lectura de código (así se encontró el bug).

## 4. Fotografía — estado y decisión

Decisión vigente desde Fase 2 (confirmada con el usuario): **tratamiento tipográfico/editorial, sin
fotos de stock genéricas**, mientras no exista un banco propio de fotografía de atletas/eventos PLU
ARG. Excepción ya en producción: `PitbullSpotlight.jsx` usa `src/assets/powerlifting-hero.png` (una
foto real de plataforma/barra) tanto en Eventos como en Home — es el único asset fotográfico real del
proyecto hoy.

**Pendiente:** cuando exista foto de atleta/podio real, el punto de integración es el hero de Home
(`HeroSection.jsx`) — hoy es 100% texto + status card, sin ningún `<img>`. No se agregó un slot de
imagen especulativo en esta fase a propósito: este proyecto ya tiene varios componentes "preparados"
que nadie conectó (`LoadingState`, `ErrorState`, el antiguo `PageHero`) y sumar otro sin uso real
sería repetir el mismo error. Cuando haya foto real, agregarla directamente junto con el `<img>` que
la muestra, no antes.

## 5. Pendiente hasta brand guidelines oficiales de PLU USA

No se resuelve en este repo hasta tener el material real:

- Naming exacto que PLU USA prefiera para el capítulo ("Powerlifting United Argentina" es el supuesto
  actual, usado en header/footer/meta desde Fase 5 — documentado como *supuesto*, no como decisión
  final).
- Si el crédito a "Maximal" (operador/administrador de la plataforma) debe aparecer en el sitio
  público en absoluto, o solo en términos legales/facturación.
- Paleta compartida: si PLU USA exige un rojo/azul "master brand" específico en vez de los tokens
  actuales (`--plu-red-500: #e10600`, etc.).
- Tipografía: si Poppins es aceptable a nivel de marca madre para piezas con el logo de PLU USA, o
  si exigen una fuente propia para lockups oficiales.
- Lockup de logo conjunto oficial (PLU USA × PLU ARG) y espacios de resguardo mínimos.
- Convención de mayúsculas en CTAs (PLU USA las usa consistentemente en su sitio; PLU ARG hoy no).
- Requisitos técnicos/legales del subdominio oficial (SSL, política de privacidad compartida, uso de
  marca registrada en footer) si el `.com.ar` pasa a ser redirect.
- Estándar real de records management (campos, cadencia, fuente de verdad) — `/records` está
  preparado estructuralmente (ver `DESIGN_ARTIFACT_PLU_ARG.md` §Records), sin lógica final.

## 6. Subdomain readiness — estado actual

| Ítem | Estado |
|---|---|
| Logo oficial PLU visible en header/footer | ✅ |
| Naming "Powerlifting United Argentina" en meta/header/footer/hero | ✅ (supuesto, ver §5) |
| Vista PLU USA como portal separado, sin acciones de escritura | ✅ |
| Records diferenciado de Resultados, con estado "Coming soon" | ✅ |
| Slot de foto real en hero | 🔲 pendiente de asset — ver §4 |
| Paleta/tipografía confirmada por PLU USA | 🔲 pendiente de guidelines |
| SSL / legal del subdominio | 🔲 fuera del alcance de este repo (infraestructura) |
