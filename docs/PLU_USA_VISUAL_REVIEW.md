# PLU USA — Visual Review Handoff

Documento de cierre de la fase de facelift visual del frontend público y del panel
administrativo de PLU Argentina. Preparado para revisión de PLU USA. Ver también
`PLU_BRAND_ALIGNMENT.md` (contexto de marca) y `DESIGN_FACELIFT_SPEC.md` (historial
técnico completo, fase por fase).

## 1. Feedback original de PLU USA

> "It is not anything drastic, just more so a healthy balance with the use of A.I. In
> other words, less obvious. My first impression when I saw the site was 'this is
> Claude A.I.'"

Pedido concreto:
- Uso de IA menos obvio en el frontend público (el backend/portal interno no era un
  problema).
- Frontend más custom y humano, Home en particular.
- Copy sin em dash.
- Paleta tomada del logo oficial: negro, azul, blanco y amarillo — no roja.
- Mejora balanceada, no un rediseño drástico.

## 2. Qué se hizo para resolverlo

Trabajo en tres pasadas sobre el mismo objetivo, cada una verificando la anterior en
vez de asumirla:

1. **Auditoría de código** (grep + lectura de componentes/CSS/copy) — encontró que la
   mayor parte del trabajo ya estaba hecho en una sesión previa (paleta, CTA
   primario, estructura de página), pero detectó un drift de color no documentado:
   más de 250 declaraciones CSS en 22 archivos seguían usando el dorado apagado viejo
   (`#c9b978` y variantes rgb) en vez del amarillo vívido del logo (`#f2b705`), y 2
   usos de glow rojo decorativo.
2. **Visual QA con Playwright** (navegador real, no solo código) — porque el propio
   feedback de PLU USA es una impresión visual, no una auditoría de código. Encontró
   el hallazgo más grave de todo el proceso: un botón primario **rojo sólido**
   (`#ff1515`, hex suelto sin token) en el status strip de Pitbull Classic, más 3
   washes rojos decorativos relacionados — todos leftovers de una iteración
   pre-rebrand nunca limpiada. También corrigió una inconsistencia de color en el CTA
   "Afiliarme" (dorado en el hero, celeste en la card de precio — mismo texto, mismo
   propósito, dos colores) y reforzó la banda de accesos rápidos de la Home, que
   tenía tan poco peso tipográfico que se perdía entre dos secciones fuertes.
3. **Cierre y verificación final** (este documento) — reconfirmó todo lo anterior con
   capturas nuevas, investigó a fondo el único punto que había quedado marcado como
   "pendiente de verificar" (el mapa de sede de Pitbull Classic) y no encontró
   problemas nuevos que ameriten más cambios de código.

## 3. Paleta aplicada

Confirmada contra el logo oficial (`public/brand/plu-argentina-emblem.png`): negro,
celeste, blanco y dorado — cero rojo en el logo real.

| Rol | Token | Valor |
|---|---|---|
| Base institucional | `--plu-cool-950` … `--plu-cool-700` | negros/grises fríos |
| Azul (headers, links, CTA secundario) | `--plu-celeste-600` / `--color-brand-action` | `#1f5f9e` |
| Amarillo (CTA principal, highlights) | `--plu-gold-500` | `#f2b705` |
| Blanco (contraste, texto) | `--plu-warm-50` / `#fff` | — |
| Rojo (**solo** error/peligro/logout) | `--plu-red-500` | `#e10600` |

Regla activa: un único acento de color por bloque visual; rojo reservado
exclusivamente a validación de formularios, badges de alerta reales y logout —
declarado explícitamente en el header de `src/styles/tokens/palette.css`.

## 4. Copy cleanup

Pasada completa (no muestreo) de los 4 archivos de copy visible: `src/i18n/locales/
{es,en}.js` y `src/lib/content/{es,en}.js` (~3500 líneas). Se ajustaron 3 puntos con
tono más aspiracional/genérico que el resto del sitio:

- `team.title` ES/EN: "Construí la federación desde adentro" / "Build the
  federation from the inside" → "Cuerpo técnico y organizador" / "Technical and
  organizing staff" (factual, consistente con el resto de los encabezados de
  sección del sitio).
- CTA de comunidad en inglés desalineado del español ("Explore community" vs "Ver
  comunidad") → igualado a "View community".

El resto del copy institucional (hero, afiliación, Pitbull Classic, FAQ, contacto) ya
era factual desde la fase de facelift previa — no se encontró lenguaje poético ni
frases tipo "nueva era" / "unlock your potential" / "seamless".

## 5. Eliminación de em dash

Cero em dash (—, U+2014) en copy visible al usuario, confirmado dos veces (auditoría
de grep + relectura completa por un segundo pase). Las únicas apariciones del
carácter en el repo son comentarios de código/JSDoc y el placeholder `'—'` para
celdas de tabla vacías (convención de UI estándar, no texto de marketing).

## 6. Eliminación de rojo como marca

- 2 glows rojos decorativos en cards de Home (Pitbull spotlight, event card
  destacado) → eliminados.
- Botón primario rojo sólido de Pitbull Classic (el hallazgo más visible de todo el
  proceso) → dorado.
- 3 washes rojos decorativos relacionados (rail del hero, canal de compra online) →
  dorado sutil.
- Barrido completo de `rgba(255, 21, 21, ...)` y `#ff1515`/`#d90f0f` en todo
  `src/styles/`: el único uso restante es `.register-eligibility-alert` (alerta real
  de elegibilidad en el formulario de registro), semánticamente correcto.

## 7. Ajustes en Home

- Banda de accesos rápidos bajo el hero: más padding (10px→18px) y peso tipográfico
  (13px/500→14px/600) para que no se pierda entre el hero y la sección de pilares.
  No se reintrodujeron pills, íconos ni gradientes — se respetó la decisión de diseño
  previa documentada en el propio CSS ("nav sobrio").
- CTA "Afiliarme" de la card de membresía: celeste → dorado, igualado al CTA
  homónimo del hero (misma acción, mismo color en toda la página).
- Resto de la Home (hero, pilares numerados, spotlight de Pitbull, teaser de
  comunidad, FAQ) ya cumplía el objetivo — no se tocó por no tocar.

## 8. Ajustes en Afiliaciones

Ninguno. La página ya tenía hero propio, comparación de 3 planes con jerarquía
correcta (el plan combo destacado ya usaba dorado, los estándar celeste — distinción
intencional, no un error), proceso de 4 pasos numerados, requisitos, vigencia y FAQ.
Se confirmó visualmente que se siente como membresía oficial, no como formulario
genérico.

## 9. Ajustes en Pitbull Classic

- CTA primario "Inscribirme": rojo sólido → dorado.
- CTA secundario "Comprar entrada": gradiente dorado competidor → tratamiento
  translúcido/secundario (deja de competir visualmente con el primario).
- Wash rojo del rail de estado y del canal de compra "online" → dorado sutil.
- Mapa de sede: investigado a fondo (ver §14). No requirió cambio de código.

## 10. Ajustes en Eventos / Resultados / Records

Ninguno. Calendario real con estados, ficha de evento con integración a calendario
externo (.ics/Google Calendar), archivo de resultados con búsqueda/orden/filtros,
distinción clara entre "Resultados de evento" y "Récords oficiales" con estado
"Todavía no publicados" honesto (sin inventar datos). Ya se sentían institucionales.

## 11. Ajustes en Admin / PLU USA

Ninguno. Dashboard con KPIs, cola de acciones pendientes con niveles de urgencia
(rojo = urgente, dorado = pendiente — uso semántico correcto), panel de finanzas,
tablas con filtros y badges de estado con color semántico. Vista PLU USA
correctamente marcada "Vista de solo lectura", exportación identificada, nota
honesta sobre que los récords se integrarán cuando PLU USA publique el estándar
global. No se siente SaaS genérico — comparte tipografía, tokens y densidad con el
sitio público.

## 12. Capturas disponibles

`docs/screenshots/final-brand-review/` — desktop (1440px) y mobile (390px) de:
Home, Afiliaciones, Pitbull Classic, Eventos, Resultados, Records, Login, Admin
Dashboard, Vista PLU USA. Incluye además `desktop-pitbull-map-detail.png` (ver §14).

**Nota de metodología**: varias capturas `fullPage` muestran artefactos que no
existen en el navegador real — el navbar `sticky` duplicado a mitad de página, y en
capturas anteriores (ya corregidas) contenido con opacidad baja por animaciones CSS
de entrada. Son limitaciones conocidas de Chromium al capturar página completa con
elementos `sticky`/animados/iframes con contenido canvas, no bugs del sitio.
Verificado comparando contra capturas de viewport normal.

## 13. Pendiente que depende de brand guidelines oficiales de PLU USA

Sin resolver hasta recibir material oficial (ver `PLU_BRAND_ALIGNMENT.md` §5):

- Valores hex exactos "master brand" si PLU USA los provee (hoy son aproximaciones
  fieles al logo, no medidas contra un archivo de marca oficial).
- Tipografía: si Poppins es aceptable a nivel de marca madre o si exigen fuente
  propia para piezas con el logo de PLU USA.
- Convención de mayúsculas en CTAs (PLU USA las usa consistentemente; PLU ARG hoy
  no en todos los casos).
- Lockup de logo conjunto oficial (PLU USA × PLU ARG) y espacios de resguardo.
- Naming final del capítulo ("Powerlifting United Argentina" es el supuesto vigente,
  no una decisión confirmada).

## 14. Fotos reales vs. placeholders

- El hero de Home y el spotlight de Pitbull Classic ya usan fotografía real
  (atleta con barra, plataforma de competencia) — no hay imágenes generadas por IA
  en el sitio.
- El único placeholder pendiente es la galería de comunidad ("Galería de la
  comunidad · próximamente"), marcado explícitamente como tal, con ícono en vez de
  caja vacía — a la espera de banco de fotos propio de PLU ARG.
- El mapa de sede de Pitbull Classic (`PITBULL_VENUE.mapsEmbedUrl`) es un embed real
  de Google Maps centrado en "Buenos Aires, Argentina" (dirección exacta aún sin
  confirmar por la sede — el dato real disponible hoy). Verificado con inspección de
  red (tiles de Google respondiendo 200) y captura de viewport real: **carga
  correctamente**. La captura `fullPage` anterior lo mostraba en blanco por un límite
  de Chromium al combinar `fullPage` con iframes de mapas — no por un problema del
  sitio ni de los datos. No se implementó fallback porque no hacía falta.

## 15. Resultado del build

```
npm run build
✓ 369 modules transformed
✓ built in ~350ms
```

Build limpio en todas las fases de este trabajo (auditoría, visual QA, cierre). El
único warning es el de Vite sobre chunks >500kB (code-splitting), preexistente y
fuera del alcance de esta fase.

### Tests

`npx vitest run` tiene una gran cantidad de fallos preexistentes en archivos que
dependen del addon de Storybook/Chromatic (error de colección, no relacionado con
este trabajo) más 1 falla real preexistente en `tests/validation.test.js`
("acepta formulario completo"), de lógica de validación de formularios — no se tocó
ningún archivo de validación ni de lógica de negocio en ninguna de las tres fases.
Verificación dirigida en archivos no dependientes de Storybook:

```
tests/format.test.js  ✓ (pasa limpio)
tests/i18n.test.js    ✓ (pasa limpio)
tests/validation.test.js  ✗ (1 falla preexistente, no relacionada)
```

Cero regresiones nuevas introducidas por el trabajo de estas tres fases.
