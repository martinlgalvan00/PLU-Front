# Design reference — PLU ARG Sitio Público

Archivo fuente: `PLU ARG - Sitio Publico (standalone).html` (export Claude Design).

## Extracción

```bash
node scripts/extract-design-ref.mjs
```

Genera `extracted-design.html` (~170 KB) con el markup interno del bundle.

## Implementado (Fase 1)

| Área | Archivos |
|------|----------|
| Nav stripe + dropdowns Eventos/Recursos | `NavbarPublic.jsx`, `header.css` |
| Hero copy, CTAs pill, métricas | `HeroSection.jsx`, `home.css`, i18n |
| Hero panel lateral + links secundarios | `HeroStatusCard.jsx`, `HeroSection.jsx`, `home.css` |
| Banda accesos rápidos post-hero | `HomeQuickBand.jsx`, `content.js`, `home.css` |
| About 3 pilares cards blancas | `content.js`, `AboutSection.jsx`, `home.css` |
| Pitbull spotlight diseño | `PitbullSpotlight.jsx`, `home.css` |
| Tokens OKLCH aproximados | `dark.css`, `variables.css` |
| Tipografía JetBrains Mono | `index.html` |

## Implementado (Fase 2)

| Área | Archivos |
|------|----------|
| Afiliación (hero, beneficios, requisitos, proceso, FAQ) | `MembersPage.jsx`, `design-phase2.css` |
| Eventos (filtros pill, card Pitbull, calendario sidebar) | `EventsPage.jsx`, `events.js` |
| Login (formulario + demo) | `LoginPage.jsx` |
| Cuenta atleta | `AthleteProfilePage.jsx` |
| Contacto (form + pills motivo) | `ContactPage.jsx`, `ContactForm.jsx` |
| Footer simplificado | `Footer.jsx` |
| Nav indicator deslizante | `NavbarPublic.jsx` |
| Canvas claro páginas internas + light theme | `design-phase2.css`, `light.css` |
| Componentes compartidos | `DesignPageHero.jsx`, `FilterPills.jsx` |

## Implementado (Fase 4 — auditoría visual home)

| Área | Archivos |
|------|----------|
| About — pilares numerados 01/02/03 en cards blancas | `AboutSection.jsx`, `home.css`, `content.js` |
| Pitbull — variante home oscura full-bleed | `PitbullSpotlight.jsx`, `home.css` |
| Afiliación — grid 2 cols copy + card precio | `HomeMembershipBand.jsx`, `home.css` |
| Resultados — teaser pre-lanzamiento | `HomeResultsTeaser.jsx`, `home.css` |
| Reglamento — caja bordeada + CTA pill | `HomeRulebookTeaser.jsx`, `home.css` |
| Comunidad — bloque oscuro centrado | `CommunitySpotlight.jsx`, `home.css` |
| FAQ — título centrado + link ver todas | `HomePage.jsx`, `home.css` |
| Canvas claro fijo (no invierte con tema) | `home.css` |


| Área | Archivos |
|------|----------|
| Reglamento y FAQ con breadcrumb + hero oscuro | `RulebookPage.jsx`, `FAQPage.jsx`, `DesignPageHero.jsx` |
| Comunidad — hero inmersivo full-bleed oscuro | `CommunityPage.jsx`, `plu-ui.css` |
| Resultados — estado pre-lanzamiento (tabla de evento, empty-state, info) | `ResultsPage.jsx`, `results.css`, `events.js` |

## Pendiente

- Auth real (email/password) ya implementada contra backend en `LoginPage.jsx`; queda el atajo demo (`login-demo`) a criterio del equipo
- Animaciones scroll reveal del artifact (`pulseGlow`, `livePulse`, `spinSlow`) no portadas 1:1 — el proyecto ya tiene equivalentes propios (spinner, animaciones de podio)
- `Podium.jsx` / `ResultCard.jsx` / `RECENT_RESULTS` quedan listos para reactivarse en `ResultsPage.jsx` cuando haya resultados reales publicados
