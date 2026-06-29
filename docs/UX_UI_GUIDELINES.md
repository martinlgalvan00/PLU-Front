# UX/UI Guidelines — PLU ARG / Maximal

## Tipografía

- **Poppins** en todo el proyecto (pesos 300–900).
- Títulos: uppercase o semibold, letter-spacing display.
- Cuerpo: 400–500, line-height generoso en mobile.

## Temas

- **Dark (default):** premium, alto contraste, federación nocturna.
- **Light:** institucional claro, legible en exterior/día.
- Toggle en navbar pública y sidebar admin.
- Tokens en `src/styles/themes/dark.css` y `light.css`.

## i18n

- Locales: `es` (default), `en`.
- Provider: `src/i18n/I18nProvider.jsx`.
- Agregar strings en `src/i18n/locales/*.js`, nunca hardcodear CTAs críticos en componentes nuevos.

## Paleta

| Uso | Token |
|-----|-------|
| Fondo | `--color-bg-primary` |
| Superficie | `--color-bg-surface` |
| CTA principal | `--color-brand-red` |
| Acento AR | `--color-brand-celeste` (sutil) |
| Premium/records | `--color-brand-gold` |
| Éxito | success tokens |
| Pendiente | warning tokens |
| Error | danger tokens |

## Regla de 2 clics (público)

Desde home, máximo 2 clics a:

1. Afiliarme → `register`
2. Pitbull Classic → `pitbull` o `register`
3. Eventos → `events`
4. Resultados → `results`
5. Panel → `login`

Hero expone 4 CTAs directos.

## Componentes obligatorios

| Componente | Ubicación |
|------------|-----------|
| NavbarPublic | `components/layout/NavbarPublic.jsx` |
| HeroSection | `components/layout/HeroSection.jsx` |
| CTAButton | `components/ui/CTAButton.jsx` |
| StatusBadge | `StatusPill.jsx` |
| LoadingState / ErrorState | `components/ui/` |
| PaymentStatusCard | `components/ui/` |
| ConfirmationScreen | `components/ui/` |
| AuditTimeline | `components/ui/` |
| MemberProfileCard | `components/ui/` |
| AdminShell + AdminTopBar | `components/layout/` |

## Estados por pantalla

Toda pantalla nueva debe contemplar:

- Loading
- Empty
- Error
- Success (cuando aplique)

## Mobile

- Navbar colapsable
- CTAs full-width en formularios
- Tablas con scroll horizontal o cards
- Touch targets ≥ 44px

## Motion

- `Reveal` para secciones públicas
- `PageTransition` entre vistas
- Respetar `prefers-reduced-motion`

## Anti-copia

Inspirarse en Powerlifting United y JoinIt. No copiar layout, textos ni branding literal.
