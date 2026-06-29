# Design Artifact — PLU ARG / Maximal

Documento de referencia visual y de experiencia para la plataforma PLU ARG.  
**Estado en código:** Poppins integrada, calendario de eventos, badges de estado, motion system y páginas públicas/admin alineadas a este artefacto.

---

## 1. Visión visual

PLU ARG / Maximal debe verse como una federación argentina de powerlifting moderna, fuerte, confiable y con estándar internacional.

La web pública debe generar impacto y conversión. El panel privado debe permitir operar con claridad y velocidad.

**Referencia base:** Powerlifting United.

**Dirección propia:**

- Más moderna.
- Más premium.
- Más argentina.
- Más clara.
- Más eficiente.
- Más integrada al negocio.

---

## 2. Concepto

> Powerlifting argentino con estándar internacional.

La plataforma debe comunicar:

- Fuerza.
- Orden.
- Comunidad.
- Competencia.
- Profesionalismo.
- Transparencia.
- Crecimiento del deporte.
- Conexión con PLU USA.

---

## 3. Personalidad visual

**Debe sentirse:** fuerte, técnica, institucional, competitiva, premium, argentina, directa, confiable, moderna.

**No debe sentirse:** amateur, genérica, copiada, infantil, saturada, desordenada, demasiado fitness comercial.

---

## 4. Paleta

### Base

| Token CSS | Uso |
|-----------|-----|
| `--color-bg-primary` | Fondo principal (negro carbón) |
| `--color-bg-surface` | Bloques secundarios (grafito) |
| `--color-text-primary` | Textos principales (blanco) |
| `--color-border` | Bordes y separadores (gris acero) |

### Acentos

| Token | Uso |
|-------|-----|
| `--color-brand-red` | CTAs principales |
| `--color-brand-celeste` | Identidad argentina sutil |
| `--color-brand-gold` | Logros, records, premium |
| Estados success/warning/danger | Aprobados, pendientes, rechazados |

**Regla:** no abusar del celeste y blanco. Identidad argentina sutil, no patriótica excesiva.

---

## 5. Tipografía

### Implementación actual

- **Familia única:** [Poppins](https://fonts.google.com/specimen/Poppins) (`index.html`, `--font-family`, `--font-display`).
- **Títulos:** peso 700–800, mayúsculas, `--letter-spacing-display`.
- **Cuerpo:** peso 400–500, legible en mobile y panel admin.

### Archivos

- `index.html` — carga Google Fonts
- `src/styles/variables.css` — tokens tipográficos
- `src/styles/base.css` — jerarquía de headings

---

## 6. Estilo de layout

### Landing pública

- Alto contraste, hero grande, CTAs claros.
- Secciones con aire, cards con bordes fuertes.
- Texturas sutiles vía `effects.css` (grain, glow, shimmer).
- Motion: `Reveal`, `PageTransition`, `animations.css`.

### Panel privado

- Sidebar fija (`AdminShell`).
- Header funcional con buscador y alertas (`AdminTopBar`).
- Cards de resumen, tablas limpias, badges de estado.

---

## 7. Estructura pública

| Ruta / vista | Componente / página |
|--------------|---------------------|
| Inicio | `HomePage.jsx` |
| Afiliación | `MembersPage.jsx` |
| Pitbull Classic | `PitbullPage.jsx` |
| Eventos + calendario | `EventsPage.jsx` + `EventCalendar.jsx` |
| Resultados | `ResultsPage.jsx` |
| Reglamento | `RulebookPage.jsx` |
| Comunidad | `CommunityPage.jsx` |
| FAQ | `FAQPage.jsx` |
| Contacto | `ContactPage.jsx` |
| Login | `LoginPage.jsx` |
| Registro | `RegisterPage.jsx` |

**Navbar:** `NAV_ITEMS` en `src/lib/constants.js`.

---

## 8. Panel privado

**Módulos:** definidos en `ADMIN_SECTIONS` (`src/lib/content.js`).

| Módulo | Estado |
|--------|--------|
| Dashboard | Funcional |
| Atletas | Funcional |
| Inscripciones | Funcional |
| Afiliaciones, Eventos, Pagos, Resultados, Exportaciones, Usuarios, Auditoría | Placeholder (`EmptyState`) |

---

## 9. Componentes

| Componente | Archivo |
|------------|---------|
| StatusBadge / StatusPill | `src/components/ui/StatusPill.jsx` |
| DataTable | `src/components/ui/DataTable.jsx` |
| EventCard | `src/components/ui/EventCard.jsx` |
| EventCalendar | `src/components/ui/EventCalendar.jsx` |
| MembershipCard, ResultCard, StatBlock | `src/components/ui/` |
| LoadingState, ErrorState | `src/components/ui/` |
| FormSection | `src/components/ui/FormSection.jsx` |
| Reveal, PageTransition | motion system |

### Estados de evento

Definidos en `src/lib/events.js` → `EVENT_STATUS`:

- Próximamente
- Inscripción abierta
- Cupos limitados
- Cerrado
- Finalizado

---

## 10. Mobile

- Navbar colapsable (`Header`).
- Cards apiladas, grids responsivos.
- Calendario y formularios adaptados (`events-layout`, `form-grid`).
- CTAs de tamaño táctil (`buttons.css`).

---

## 11. Microcopy

Tono: claro, directo, profesional, deportivo, argentino sin exceso informal.

Ver textos en `src/lib/content.js`, `FAQ_ITEMS`, botones en páginas y `status.js`.

---

## 12. Reglas anti-copia

No copiar logos, imágenes, textos, estructura exacta ni colores exactos de Powerlifting United.

Sí tomar: idea de federación, jerarquía institucional, secciones principales, CTAs, portal de miembros, eventos, resultados, rulebook, comunidad, FAQ.

---

## 13. Checklist de diseño (por pantalla)

- [ ] ¿Acción principal clara?
- [ ] ¿Se entiende en mobile?
- [ ] ¿Se ve profesional?
- [ ] ¿Identidad PLU ARG?
- [ ] ¿Mejora la referencia sin copiar?
- [ ] ¿Estados vacíos, error y loading?
- [ ] ¿Jerarquía y componentes reutilizables?
- [ ] ¿Roles respetados en panel?
- [ ] ¿Conectado al flujo de negocio?

---

## 14. Prioridad de mejora

1. Home PLU ARG — **en progreso**
2. Página de afiliación
3. Página Pitbull Classic
4. Login — **mejorado**
5. Dashboard admin — **mejorado**
6. Atletas
7. Afiliaciones
8. Inscripciones
9. Pagos
10. Exportaciones
11. Resultados
12. PLU USA read-only
13. FAQ / Contacto
14. Estados vacíos y errores — **componentes base creados**

---

## 15. Resultado esperado

Plataforma real de federación: visualmente fuerte, operativamente clara, escalable, argentina, integrada a Maximal, profesional frente a PLU USA y más moderna que la referencia.

---

## 16. Cómo seguir mejorando (próximos pasos técnicos)

1. **Hero con imagen real** de competencia y video loop sutil.
2. **PaymentStatusCard** en panel y post-registro.
3. **ConfirmationScreen** tras pago exitoso.
4. **Módulo Eventos admin** con el mismo `EventCalendar` editable.
5. **Skeleton loaders** en tablas mientras carga API real.
6. **Dark/light** no requerido — mantener dark premium.
7. **Backend** reemplazando localStorage para estados reales de pago/evento.
8. **Accesibilidad:** focus visible, `aria-live` en cambios de estado de pago.

Para iterar pantallas usar la skill `agent-skills/design-upgrade/SKILL.md`.
