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

## Pendiente (Fase 3)

- Páginas restantes: Resultados, Reglamento, Comunidad, FAQ internas al 100% del HTML
- Auth real (email/password) reemplazando demo login
- Animaciones scroll reveal del artifact
