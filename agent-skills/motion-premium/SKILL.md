---
name: motion-premium
description: >-
  Gramática de motion elegante para PLU ARG (showcases, TiltCard, entradas
  cinematográficas, reduced-motion). Usar al pulir credenciales, heroes,
  cards premium o cuando el usuario pida transiciones más refinadas.
---

# Motion premium — PLU ARG

Skill táctica para **motion de presencia** (no decoración infinita). Complementa:

- [`design-ux-ui`](../design-ux-ui/SKILL.md) — estructura CSS / patrón visual
- [`design-upgrade`](../design-upgrade/SKILL.md) — QA por pantalla
- `.agents/skills/review-animations` + `find-animation-opportunities` — gate de restricción

**Principio:** premium = menos capas animadas a la vez, curvas fuertes, settle suave, `prefers-reduced-motion` siempre.

## Cuándo usarla

- Credencial / showcase (`HomeMembershipCredential`, Members cred, hero cards)
- `TiltCard` o parallax por capas
- Entradas `whileInView` cinematográficas
- El usuario pide “más elegante / fluido / premium” en motion

## Tokens canónicos

Fuente: `src/motion/tokens.ts` + `src/styles/motion.css` / `variables.css`.

| Token | Uso |
|-------|-----|
| `MOTION_DURATION.fast` (0.16s) | Press, hover color |
| `MOTION_DURATION.base` (0.24s) | Layer stagger items |
| `MOTION_DURATION.slow` (0.48s) | Shell de showcase |
| `MOTION_DURATION.cinematic` (0.7s) | Solo heroes mayores; preferí `slow` en cards |
| `MOTION_EASE.out` / `cinematic` | Entradas |
| `MOTION_EASE.spring` | Micro confirmación — **nunca** entrada de sección |
| `MOTION_BLUR.sm` (2px) | Máximo en entradas; evitar ≥4px |
| `MOTION_DEPTH` | ≤4 niveles Z en una credencial |
| `TILT_MAX_DEG` default 6; showcase home **3** | Menos = más lujoso |

## Gate (obligatorio)

Antes de animar, responder:

1. **Frequency** — ¿el usuario lo ve decenas de veces/día? → no animar o solo 100–160ms
2. **Purpose** — feedback / spatial / state / anti-jank / explanation / delight (delight solo rare)
3. **Budget** — UI ≤300ms; marketing/showcase shell ≤500–700ms
4. **Conflict** — ¿dos `transform` pelean en el mismo nodo? (tilt rotate vs hover translateY)

Si falla el gate → no implementar.

## Receta: Showcase credential (referencia)

Código canónico: `src/components/ui/HomeMembershipCredential.jsx` + `.home-credential*` en `home.css`.

### Capas (orden)

1. **Shell enter** — opacity + y(12–16) + scale(0.985) + blur(sm). Una vez (`viewport.once`).
2. **Tilt 3D** — `TiltCard` con `maxTilt={3}`; `data-tilt-active` para settle 420ms al salir.
3. **Parallax** — watermark / plates / grain / content con `--tilt-px/py`; deltas chicos (6–18px).
4. **Stagger content** — head → identity → meta → footer (50–70ms).
5. **Remates one-shot** — stripe scaleX, chip shine; **nunca loop**.
6. **CTA** — hover underline + arrow 160ms; `:active scale(0.97)`.

### Anti-patrones

| Evitar | Hacer |
|--------|-------|
| `translateY` hover en el mismo nodo que `rotateX/Y` | Solo sombra / glare |
| `blur(5px+)` en enter | `MOTION_BLUR.sm` |
| Tilt >6° en marketing denso | 2.5–4° |
| Keyframes en tracking de cursor | CSS vars + `transition` interruptible |
| 5+ animaciones simultáneas | Shell + stagger + 1 remate |
| Ignorar `reducedMotion` | Rama estática sin Motion / sin tilt |

### Checklist implementación

```
- [ ] Tokens de src/motion/tokens.ts (no magic numbers sueltos)
- [ ] whileInView once + amount ~0.3–0.4
- [ ] TiltCard: fine pointer + reduced motion off
- [ ] Settle tilt más lento que tracking (data-tilt-active)
- [ ] Sin loop infinito salvo 1 pulse dot institucional
- [ ] Light/dark: sombra ambiental; el objeto grafito puede ser fijo
- [ ] Mobile: parallax ok; tilt off en coarse pointer (TiltCard ya lo hace)
```

## Receta: TiltCard genérico

Archivo: `src/motion/TiltCard.tsx`.

- Actualizar vars en rAF
- `data-tilt-active="0|1"` para CSS
- Tracking ~140ms; settle ~420ms ease-out
- No agregar hover lift al root

## Incorporación en otras skills

- `design-ux-ui` §3: patrón **Showcase credential** → esta skill
- `AGENTS.md`: invocar `motion-premium` en tareas de motion/showcase

## Handoff

Reportar: archivos, qué motion se agregó/quitó, cómo probar (hover desktop + reduced-motion), riesgos (GPU blur, conflicto transform).
