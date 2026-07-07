# Design Artifact — PLU ARG / Maximal (v2)

Documento maestro de referencia visual, navegación y experiencia.  
**Última actualización:** implementación afiliación anual premium, mapa de plataforma, eventos interactivos y admin operativo.

---

## 1. Visión

PLU ARG debe sentirse como una **federación argentina de powerlifting premium**: fuerte, institucional, moderna, clara y lista para operar afiliaciones, eventos y pagos.

| Capa | Tono | Objetivo |
|------|------|----------|
| **Pública** | Emocional + conversión | Impacto, confianza, CTAs |
| **Conversión** | Directa, sin fricción | Afiliación, inscripción, registro |
| **Privada (admin)** | Sobria, operativa | Velocidad, tablas, acciones |
| **Portal atleta** | Personal, claro | Estado, pagos, perfil |

**Referencias estructurales (no copiar):** Powerlifting United, Join It (patrones UX admin/CRM).

---

## 2. Mapa de navegación

### Navbar público (`NavbarPublic`)

| Grupo | Vista | Ruta interna | Componente | Estado diseño |
|-------|-------|--------------|------------|---------------|
| — | Inicio | `home` | `HomePage` | ✅ Mejorado |
| Competencia | Afiliación | `members` | `MembersPage` | ✅ v2 afiliación anual |
| Competencia | Pitbull Classic | `pitbull` | `PitbullPage` | 🟡 Base |
| Competencia | Eventos | `events` | `EventsPage` | ✅ Calendario + lista |
| Competencia | Resultados | `results` | `ResultsPage` | 🟡 Base |
| Institucional | Reglamento | `rulebook` | `RulebookPage` | 🟡 Base |
| Institucional | Comunidad | `community` | `CommunityPage` | 🟡 Base |
| Institucional | FAQ | `faq` | `FAQPage` | 🟡 Base |
| Institucional | Contacto | `contact` | `ContactPage` | 🟡 Base |
| Acción | Login | `login` | `LoginPage` | ✅ |
| Acción | Registro | `register` | `RegisterPage` | 🟡 Base |

**Mobile:** menú drawer + prefs (tema/idioma) en header, no en drawer.

### Flujos privados

| Vista | Rol | Componente |
|-------|-----|------------|
| Panel admin | `admin_plu` | `AdminPage` + secciones |
| Perfil atleta | `athlete_plu` | `AthleteProfilePage` |
| Afiliación (flujo) | atleta | `RegisterPage` flow membership |
| Inscripción evento | atleta | `RegisterPage` flow competition |

### Admin (`ADMIN_NAV_GROUPS`)

| Grupo | Módulo | Estado |
|-------|--------|--------|
| Gestión | Dashboard, Atletas, Afiliaciones | ✅ Funcional |
| Eventos | Eventos, Inscripciones, Resultados | 🟡 Parcial |
| Finanzas | Pagos, Exportaciones | 🔲 Placeholder |
| Sistema | Usuarios, Auditoría | 🔲 Placeholder |

---

## 3. Paleta y tokens

Archivo fuente: `src/styles/variables.css`

| Token | Uso |
|-------|-----|
| `--color-bg-primary` | Fondo global |
| `--color-bg-surface` | Cards, paneles |
| `--color-brand-red` | CTA primario, urgencia |
| `--color-brand-celeste` | Identidad AR, acentos |
| `--color-brand-gold` | Premium, precios, records |
| `--font-display` | Títulos (Barlow Condensed) |
| `--font-family` | Cuerpo (Poppins) |

**Regla:** identidad argentina sutil. No patriótica excesiva.

---

## 4. Componentes del design system

| Componente | Archivo | Uso |
|------------|---------|-----|
| `PageHero` | layout | Cabecera de páginas internas |
| `SectionHeading` | ui | Títulos de sección |
| `MembershipCard` | ui | Planes de afiliación |
| `PitbullSpotlight` | ui | Hero evento insignia (home) |
| `EventCalendar` | ui | Calendario interactivo |
| `EventCard` | ui | Tarjeta de meet |
| `PlatformMap` | ui | Mapa de navegación (home) |
| `StatBlock` / `AdminMetricCard` | ui | Métricas |
| `StatusPill` | ui | Estados de negocio |
| `Reveal` | ui | Motion scroll |
| `AdminShell` | layout | Panel admin |

Estilos por dominio:

```
src/styles/pages/home.css      → Landing
src/styles/pages/members.css   → Afiliación
src/styles/pages/events.css    → Eventos
src/styles/pages/admin.css     → Panel admin
src/styles/layout/header.css   → Navbar
```

---

## 5. Página de afiliación anual (`MembersPage`)

### Estructura visual

1. **PageHero** — “Afiliación anual 2026”
2. **Stats** — 3 planes · desde $28.000 · vigencia 2026
3. **Intro split** — copy + mock tarjeta digital PLU ARG
4. **Beneficios** — 4 iconos (código, eventos, estándar, respaldo)
5. **Pasos** — 4 pasos (`MEMBERSHIP_ANNUAL_STEPS`)
6. **Planes** — `MembershipCard` × 3
7. **Comparativa** — tabla Atleta / Juvenil / Combo
8. **CTA final** — afiliación o eventos

### Planes (`MEMBERSHIP_PLANS`)

| Plan | Precio | Destacado |
|------|--------|-----------|
| Atleta | $38.000/año | Celeste |
| Juvenil | $28.000/año | Gold |
| Combo Pitbull | $78.000/temporada | Rojo, featured |

### Criterios de calidad

- [ ] Jerarquía clara: qué es afiliación anual vs inscripción a evento
- [ ] Comparativa legible en mobile (scroll horizontal)
- [ ] CTA visible en hero, intro y footer
- [ ] Tarjeta digital como promesa visual (futuro: QR real)

---

## 6. Home — mapa de plataforma

Sección **“Explorá toda la plataforma”** con `PlatformMap` + `PLATFORM_SECTIONS`:

- Agrupa Competencia vs Institucional
- Cards clickeables → navegación directa
- Iconos por sección, hover celeste

---

## 7. Eventos (`EventsPage`)

- Stats del calendario
- Calendario sticky + lista sincronizada
- Filtros y panel de evento seleccionado
- Cards con estado `selected`

---

## 8. Panel admin

- Sidebar agrupada con badges
- Dashboard con cola de acciones
- Ficha atleta CRM (tabs)
- Toolbar minimalista (sin redundancia de alertas)

---

## 9. Responsive

| Breakpoint | Comportamiento |
|------------|----------------|
| ≤640px | Grids 1 columna, CTAs full-width |
| ≤900px | Calendario arriba, lista abajo |
| ≤1024px | Admin sidebar drawer, navbar mobile |
| ≥1080px | Nav desktop completo |

---

## 10. Checklist por pantalla

Antes de cerrar cualquier pantalla:

1. ¿Acción principal evidente?
2. ¿Mobile usable sin zoom?
3. ¿Usa tokens CSS (no hex sueltos)?
4. ¿Estados vacío/error considerados?
5. ¿Coherente con identidad PLU ARG?
6. ¿Conectado al flujo de negocio (`BUSINESS_RULES.md`)?

---

## 11. Roadmap visual (prioridad)

| # | Pantalla | Prioridad |
|---|----------|-----------|
| 1 | Afiliación anual | ✅ Hecho v2 |
| 2 | Home + PlatformMap | ✅ Hecho |
| 3 | Eventos | ✅ Hecho |
| 4 | Pitbull Classic page | Alta |
| 5 | Registro / flujo pago | Alta |
| 6 | Resultados | Media |
| 7 | Reglamento, Comunidad, FAQ, Contacto | Media |
| 8 | Admin: Pagos, Eventos CRUD | Alta operativa |
| 9 | Tarjeta digital afiliado (QR) | Diferenciador |

---

## 12. Cómo usar este artifact

1. **Diseñadores / devs:** leer antes de tocar UI.
2. **Agentes:** seguir `agent-skills/design-upgrade` + este doc.
3. **QA visual:** recorrer mapa §2 y validar checklist §10.
4. **Iteración:** actualizar estado (✅/🟡/🔲) al cerrar cada pantalla.

---

## 13. Resultado esperado

Una plataforma que se vea y opere como producto federativo premium: conversión clara en afiliación, exploración intuitiva de todas las secciones, y panel admin al estilo CRM moderno (Join It) con identidad PLU ARG propia.
