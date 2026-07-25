# Design System PLU ARG

> **Autoridad de marca:** ver [`.claude/skills/plu-frontend-design`](../../.claude/skills/plu-frontend-design/SKILL.md)
> primero — es la fuente operativa vigente. Esta skill sigue siendo útil para el inventario de
> componentes y la arquitectura CSS, pero su tabla de paleta original quedaba desactualizada
> (describía rojo como acento/CTA); se corrigió abajo para reflejar el ground truth real de
> `src/styles/tokens/palette.css` (paleta confirmada por PLU USA en jul. 2026: negro, azul,
> blanco, amarillo — rojo exclusivo de error).

## Objetivo

Mantener una identidad visual **propia de PLU ARG / Maximal** — oscura, atlética, con acentos
azul y dorado, negro/grafito de base — usando tokens CSS centralizados y componentes
reutilizables. **No copiar literalmente** el sitio de PLU USA; tomar inspiración en jerarquía y
claridad, no en assets, copy ni layout idéntico.

Para el **proceso de mejora visual por pantalla** (auditoría, UX, responsive, QA), usar también [`design-upgrade`](../design-upgrade/SKILL.md).

Para **refinar una sección concreta** (hero dock, cards, nav) con patrones CSS modernos, usar [`design-ux-ui`](../design-ux-ui/SKILL.md).

## Cuándo usarla

- Crear o modificar páginas en `src/pages/`.
- Agregar componentes UI en `src/components/`.
- Ajustar estilos en `src/styles/`.
- Cuando un agente proponga colores, tipografías o espaciados fuera del sistema.
- Al implementar secciones: Hero, Cards, CTA, Navbar, Footer, Membership, Event, FAQ, Admin.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Sección a diseñar | Hero, pricing, tabla admin, etc. |
| Tokens existentes | `src/styles/variables.css` |
| Componentes base | `Button`, `Cards`, `FormFields`, `StatusPill` |
| Iconografía | `lucide-react` (ya en dependencias) |
| Referencia de marca | Logo en `public/`, paleta definida en variables |

## Salidas esperadas

- Estilos que consumen **solo variables CSS**, no hex sueltos en componentes.
- Componentes presentacionales sin lógica de negocio.
- CSS modular por dominio (`components/`, `layout/`, `pages/`).
- UI responsive y accesible (contraste, focus visible, labels en forms).
- Coherencia visual entre Inicio, Registro, Eventos y Admin.

## Procedimiento paso a paso

### 1. Tokens — fuente única de verdad

Archivo: `src/styles/variables.css`

**Paleta marca PLU ARG:**

| Token | Uso |
|-------|-----|
| `--color-bg-primary` | Fondo principal (dark, `--plu-cool-950`) |
| `--color-brand-action` (oro, `--plu-gold-500`) | CTA primario, botones de acción |
| `--color-brand-celeste` | Identidad/navegación, focus, links |
| `--color-brand-gold` | Momentos premium: membresía, medallas, resultados |
| `--color-brand-red` | **Solo error/peligro** — nunca CTA ni acento decorativo |
| `--color-text-primary` | Texto principal sobre fondo oscuro |
| `--color-text-muted` | Texto de apoyo |

**Regla:** si necesitás un color nuevo, agregalo como variable en `:root` antes de usarlo en cualquier `.css`.

### 2. Arquitectura CSS

```
src/styles/
  variables.css      # tokens
  base.css           # reset, tipografía global
  index.css          # imports ordenados
  layout/header.css  # navbar
  components/        # botones, cards, forms, tables, status
  pages/             # home, register, admin, content
```

Import chain: `main.jsx` → `styles/index.css` → partials.

### 3. Componentes del design system

| Componente | Ubicación | Responsabilidad |
|------------|-----------|-----------------|
| **Navbar** | `Header.jsx` + `layout/header.css` | Navegación, logo, links `NAV_ITEMS` |
| **Hero** | `HomePage.jsx` + `pages/home.css` | Headline, gradiente, CTA principal |
| **Cards** | `Cards.jsx` + `components/cards.css` | `BenefitCard`, `PricingCard`, `InfoCard` |
| **CTA** | Botones `.btn`, `.btn--gold`, `.btn--secondary` | Acciones primarias/secundarias |
| **Footer** | `PageFrame.jsx` o sección en páginas | Links, contacto, legal |
| **Membership** | `MembersPage.jsx`, `PricingCard` | Planes y beneficios afiliación |
| **Event** | `EventsPage.jsx`, cards de `UPCOMING_EVENTS` | Listado y detalle de eventos |
| **FAQ** | Sección en `ContactPage` o `TeamPage` | Acordeón o lista Q&A |
| **Admin** | `AdminPage.jsx` + `pages/admin.css` | Métricas, tabla, filtros, exports |
| **Forms** | `FormFields.jsx` + `components/forms.css` | `Field`, `Select` con labels |
| **Status** | `StatusPill.jsx` + `components/status.css` | Pills por estado de negocio |

### 4. Patrones de implementación

**Botones** (`components/buttons.css`):

```css
.btn { /* base: borde, padding, transición */ }
.btn--gold { /* afiliación premium */ }
.btn--secondary { /* acciones secundarias */ }
.btn--small { /* toolbar admin */ }
```

**Cards:** usar clases semánticas (`benefit-card`, `pricing-card`, `metric-card`) — no inline styles.

**Hero:** fondo oscuro + `var(--color-hero-gradient)` + tipografía `--font-weight-black`.

### 5. Diferenciación vs PLU USA

| Hacer | No hacer |
|-------|----------|
| Paleta azul/dorado sobre negro (confirmada por PLU USA, jul. 2026) | Usar rojo como acento de marca o CTA |
| Copy institucional traducido/adaptado fielmente de PLU USA (decisión vigente desde jul. 2026, ver `PLU_BRAND_ALIGNMENT.md` §2) | Inventar datos de negocio propios (precios, fechas, cupos) que no tienen equivalente real del lado de EE.UU. |
| Eventos argentinos (Pitbull Classic) | Nombres de meets USA |
| Precios en ARS | USD |
| Logo `public/PLU Argentina.jpg` | Assets de federación USA |

### 6. Flujo para nueva sección

1. Definir estructura JSX en página correspondiente.
2. Reutilizar componentes de `src/components/ui/`.
3. Crear o extender CSS en `src/styles/pages/` o `components/`.
4. Usar variables existentes; proponer nuevas solo si justificado.
5. Verificar en viewport móvil (~375px) y desktop (~1200px).

## Validaciones

- Cero colores hex hardcodeados en JSX (salvo SVG inline justificado).
- Focus visible con `--color-focus-ring`.
- Botones con `type="button"` o `type="submit"` explícito.
- Formularios con `<label>` asociado a cada input.
- Contraste mínimo WCAG AA en texto principal sobre fondos oscuros.
- `npm run build` sin warnings de CSS.

## Errores comunes

| Error | Consecuencia | Fix |
|-------|--------------|-----|
| Estilos inline en páginas | Inconsistencia | Mover a `.css` modular |
| Duplicar tokens | Dos rojos distintos | Centralizar en `variables.css` |
| Mezclar `App.css` legacy con sistema nuevo | Conflictos | Preferir `src/styles/` |
| Iconos de otra librería | Bundle extra | Solo `lucide-react` |
| Copiar layout PLU USA pixel-perfect | Deuda de marca | Rediseñar con tokens propios |

## Checklist de aceptación

- [ ] Nuevos estilos usan variables de `variables.css`
- [ ] Componente UI reutilizable si el patrón se repite ≥2 veces
- [ ] CSS en archivo correcto (`components/` vs `pages/`)
- [ ] Navbar y CTAs coherentes en todas las vistas
- [ ] Admin legible: tablas, filtros, métricas alineadas
- [ ] Sin regresión visual en Home y Register
- [ ] Responsive básico verificado

## Referencias oficiales

- [MDN — CSS custom properties](https://developer.mozilla.org/es/docs/Web/CSS/Using_CSS_custom_properties)
- [Lucide Icons](https://lucide.dev/icons/)
- Inspiración de jerarquía (no copia): sitios de federaciones de powerlifting

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/styles/variables.css` | Design tokens |
| `src/styles/index.css` | Entry de estilos |
| `src/styles/base.css` | Reset y globals |
| `src/components/ui/Button.jsx` | Botón (si existe lógica) |
| `src/components/ui/Cards.jsx` | Cards reutilizables |
| `src/components/ui/FormFields.jsx` | Inputs y selects |
| `src/components/ui/StatusPill.jsx` | Estados visuales |
| `src/components/layout/Header.jsx` | Navbar |
| `src/components/layout/PageFrame.jsx` | Layout wrapper |
| `src/lib/constants.js` | `NAV_ITEMS`, eventos |
| `public/PLU Argentina.jpg` | Logo marca |
| `public/favicon.svg` | Favicon |
