# Patrones CSS — PLU ARG

Catálogo de patrones **ya usados** en el proyecto. Reutilizar antes de inventar.

## 1. Regla editorial tricolor

Barra vertical rojo · neutro · celeste al costado del copy.

```css
.hero__editorial {
  padding-left: clamp(16px, 2.2vw, 26px);
  position: relative;
}

.hero__editorial::before {
  background: var(--home-hero-editorial-rule);
  border-radius: 99px;
  bottom: 6px;
  content: '';
  left: 0;
  position: absolute;
  top: 6px;
  width: 2px;
}
```

**Token:** `--home-hero-editorial-rule`  
**Archivo:** `src/styles/pages/home.css`, `design-pages-theme.css`

---

## 2. Eyebrow pill (glass)

Label institucional en pastilla, sin subrayado.

```css
.hero__eyebrow--design {
  backdrop-filter: blur(8px);
  background: var(--home-hero-eyebrow-bg);
  border: 1px solid var(--home-hero-eyebrow-border);
  border-radius: var(--border-radius-pill);
  letter-spacing: 0.18em;
  padding: 8px 14px 8px 12px;
}
```

---

## 3. Dock glass (accesos rápidos)

Navegación secundaria: label fijo + track en shell pill.

```css
.home-quick-band__shell {
  background: var(--home-quick-band-shell-bg);
  border: 1px solid var(--home-quick-band-shell-border);
  border-radius: var(--border-radius-pill);
  box-shadow: var(--home-quick-band-shell-shadow);
  padding: 4px;
}

.home-quick-band__stripe {
  background: var(--home-quick-band-stripe);
  height: 1px;
  opacity: 0.55;
}
```

**Componente:** `HomeQuickBand.jsx` (`variant="dock"`)  
**Tokens:** `--home-quick-band-shell-*`, `--home-quick-band-stripe`

---

## 4. Barra de acciones (hero)

CTAs + links secundarios separados por borde superior.

```css
.hero__actions {
  border-top: 1px solid var(--home-hero-metrics-border);
  display: grid;
  gap: clamp(14px, 2vh, 18px);
  margin-top: clamp(20px, 2.8vh, 28px);
  padding-top: clamp(16px, 2.2vh, 22px);
}

@media (min-width: 720px) {
  .hero__actions {
    align-items: center;
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
```

---

## 5. Panel credibilidad (status card)

Glass con gradiente sutil en esquina.

```css
.hero-status-card__panel {
  backdrop-filter: blur(12px);
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.04) 0%, transparent 42%),
    var(--home-hero-proof-bg);
  border: 1px solid var(--home-hero-metrics-border);
  border-radius: calc(var(--border-radius-lg) + 2px);
}
```

---

## 6. Título con acento degradado

Lead en peso 600; acento en gradiente tokenizado (no rojo puro).

```css
.hero__title-accent {
  background: var(--home-hero-title-accent);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 700;
}
```

---

## 7. Entrada stagger (hero)

Hijos con opacity + translateY; delays escalonados. **Una sola pasada.**

```css
.hero--design.is-animate .hero__copy-inner .hero__editorial > .hero__title {
  opacity: 1;
  transform: none;
  transition-delay: 0.12s;
}
```

Siempre incluir:

```css
@media (prefers-reduced-motion: reduce) {
  .hero--design.is-animate .home-quick-band--dock {
    animation: none;
  }
}
```

---

## 8. Scroll horizontal de chips

Para tracks en mobile:

```css
.home-quick-band__track {
  -webkit-overflow-scrolling: touch;
  overflow-x: auto;
  scrollbar-width: none;
}

.home-quick-band__track::-webkit-scrollbar {
  display: none;
}
```

---

## 9. Tema claro / oscuro

Tokens de página en `design-pages-theme.css`:

- Bloque `[data-theme='dark']` o selector raíz dark
- Bloque `[data-theme='light']` con **mismos nombres** de variable

Overrides puntuales al final del CSS del componente si hace falta.

---

## 10. Showcase credential + tilt (motion premium)

Objeto “producto” grafito con TiltCard, parallax por capas y entrada one-shot.

**Skill:** [`motion-premium`](../motion-premium/SKILL.md)  
**Referencia:** `HomeMembershipCredential.jsx`, `.home-credential*` en `home.css`, `TiltCard.tsx`

Reglas cortas:

- Shell enter: `y` 12–16 + `scale(0.985)` + `blur(sm)` — no rotación agresiva
- Tilt ≤3–4° en home; settle CSS vía `data-tilt-active`
- Nunca `translateY` hover en el mismo nodo que `rotateX/Y`
- Stagger de contenido 50–70ms; stripe/chip one-shot; sin loops

---

## 11. Checklist rápido al copiar un patrón

1. ¿Los tokens existen en **ambos** temas?
2. ¿El JSX tiene wrappers mínimos (`__shell`, `__editorial`)?
3. ¿Mobile probado con scroll?
4. ¿Solo 1 animación loop en la sección?
5. ¿Build OK?
6. ¿Motion pasó el gate de `motion-premium` / review-animations?
