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

**Referencias (jul. 2026 — actualizado):** Powerlifting United (`powerliftingunited.com`) es
ahora la fuente de contenido — títulos, misión, nav y copy institucional se traducen/adaptan
fielmente al ES/EN, ver `docs/PLU_BRAND_ALIGNMENT.md` §2. Excepción: datos de negocio propios de
PLU ARG (precios ARS, fechas y cupos de Pitbull Classic, gimnasios afiliados) no se reemplazan
por no tener equivalente real en el sitio de EE.UU. Join It sigue siendo solo referencia
estructural de patrones UX admin/CRM, no de contenido.

---

## 2. Mapa de navegación

### Navbar público (`NavbarPublic`)

| Grupo | Vista | Ruta interna | Componente | Estado diseño |
|-------|-------|--------------|------------|---------------|
| — | Inicio | `home` | `HomePage` | ✅ Mejorado |
| Competencia | Afiliación | `members` | `MembersPage` | ✅ v2 afiliación anual |
| Competencia | Pitbull Classic | `pitbull` | `PitbullPage` | ✅ Dossier editorial (`pitbull-dossier--minimal`) — doc estaba desactualizado, ver auditoría jul. 2026 |
| Competencia | Eventos | `events` | `EventsPage` | ✅ Calendario + lista |
| Competencia | Resultados | `results` | `ResultsPage` | ✅ Archivo + empty-state ya premium — doc estaba desactualizado |
| Institucional | Reglamento | `rulebook` | `RulebookPage` | ✅ Tabs + contenido real ya premium — doc estaba desactualizado |
| Institucional | Comunidad | `community` | `CommunityPage` | 🟡 Base |
| Institucional | FAQ | `faq` | `FAQPage` | ✅ Ya en acordeón (`FAQAccordion`) agrupado por categoría — doc estaba desactualizado |
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
| Gestión | Dashboard, Atletas, Afiliaciones | ✅ Funcional — shell/sidebar/topbar/KPI tiles/tablas auditados jul. 2026, ya cumplen la gramática visual |
| Eventos | Eventos, Inscripciones | ✅ Funcional |
| Eventos | Resultados (admin) | 🔲 Placeholder — `PlaceholderSection.jsx` |
| Finanzas | Pagos | ✅ Funcional — `TicketOrdersSection` (dejó de ser placeholder) |
| Finanzas | Exportaciones | 🔲 Placeholder |
| Sistema | Usuarios | ✅ Funcional |
| Sistema | Auditoría | 🔲 Placeholder |

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
| `--font-display` | Títulos — Poppins 700/800, tracking ajustado (no es una familia distinta) |
| `--font-family` | Cuerpo e interfaz — Poppins 400/500/600 |

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

### Estructura visual (actualizada jul. 2026 — refleja `MembersPage.jsx`)

1. **DesignPageHero** compacto — “Afiliación anual 2026” + `MembersHeroRail` (métricas + CTA)
2. **Intro** — copy + lista de beneficios numerada (`members-benefit-list`)
3. **Requisitos** — lista editorial + panel de vigencia
4. **Proceso** — 4 pasos (`MEMBERSHIP_ANNUAL_STEPS`)
5. **Planes** — `MembershipCard` × 3 en grid (sin tabla comparativa aparte — la grilla de 3 planes ya
   colapsa a 1 columna en mobile, ver `membership-grid--editorial`)
6. **FAQ** — `FAQAccordion`

### Planes (`MEMBERSHIP_PLANS`)

| Plan | Precio | Destacado |
|------|--------|-----------|
| Atleta | $38.000/año | Celeste |
| Juvenil | $28.000/año | Gold |
| Combo Pitbull | $78.000/temporada | Rojo, featured |

### Criterios de calidad

- [x] Comparativa legible en mobile — no aplica: se sacó la tabla comparativa, la grilla de planes ya es legible en 1 columna
- [x] CTA visible en hero, intro y footer
- [ ] Jerarquía clara: qué es afiliación anual vs inscripción a evento — la ambigüedad real está en
      `RegisterPage.jsx` (flujo compartido membership/competition), no en esta landing. Pendiente para
      cuando se toque el flujo de checkout (Fase 4): agregar un badge de flujo visible ("Afiliación" vs
      "Inscripción a evento") al entrar a `RegisterPage`.
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
| 0 | Design system base (efectos, glassmorphism, font-display) | ✅ Hecho jul 2026 — ver `UX_UI_GUIDELINES.md` §Gramática visual |
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
