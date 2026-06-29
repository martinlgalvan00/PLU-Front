# Events & Registrations — Pitbull Classic

## Objetivo

Gestionar **eventos de competencia** y sus **inscripciones** en PLU ARG: cupos, categorías, divisiones, requisito de afiliación activa y flujo de estados desde borrador hasta confirmada — con **Pitbull Classic** como evento MVP.

## Cuándo usarla

- Crear o editar eventos en seed/DB.
- Modificar lógica de inscripción en `athleteService.js`.
- Actualizar `EventsPage.jsx` o filtros admin por evento.
- Validar cupos y elegibilidad (afiliación, división por edad).
- Preparar multi-evento más allá del MVP.

## Entradas requeridas

| Entrada | Descripción |
|---------|-------------|
| Evento | slug, título, fecha, venue, capacity |
| Atleta | datos + estado afiliación |
| Categoría | Raw, Classic Raw, Equipped |
| División | Open, Junior, Sub-Junior, Master I/II |
| procedureType | `event` o `both` en registro |

## Salidas esperadas

- `EventRegistration` con estados correctos.
- Respeto de `requiresMembership` del evento.
- Cupos no excedidos (cuando se implemente contador).
- Filtros admin por evento funcionando.
- UI de eventos alineada con `UPCOMING_EVENTS`.

## Procedimiento paso a paso

### 1. Evento MVP — Pitbull Classic

| Atributo | Valor |
|----------|-------|
| Título | Pitbull Classic |
| Slug | `pitbull-classic-2026` |
| Fecha | 15 Ago 2026 (seed) |
| Venue | Maximal Strength Club |
| Location | Buenos Aires |
| Capacity | 120 (sugerido en seed) |
| requiresMembership | `true` |

Referencias en código:

- `UPCOMING_EVENTS[0]` en `constants.js`
- `createRegistrationFromForm` hardcodea `event: 'Pitbull Classic'`
- Dashboard admin: métrica "Pitbull Classic"

### 2. Modelo de datos

**Prisma `Event`:**

```prisma
model Event {
  slug               String  @unique
  title              String
  venue              String
  location           String
  eventDate          DateTime
  capacity           Int?
  status             String  @default("draft")  // draft | published | closed
  requiresMembership Boolean @default(true)
  registrations      EventRegistration[]
}
```

**Prisma `EventRegistration`:**

```prisma
model EventRegistration {
  athleteId     String
  eventId       String
  category      String
  division      String
  bodyweight    String?
  status        RegistrationStatus @default(borrador)
  paymentStatus String?
  notes         String?
}
```

### 3. Categorías y divisiones

Definidas en `FORM_OPTIONS`:

**Categoría (equipamiento):**

- `Raw` — sin equipamiento
- `Classic Raw` — rodilleras + cinturón
- `Equipped` — squat/deadlift suit

**División (edad):**

- `Open`, `Junior`, `Sub-Junior`, `Master I`, `Master II`

**Regla futura:** validar división según `birthDate` vs fecha del evento (IPF rules).

### 4. Flujo de inscripción

```
1. Atleta elige procedureType: event | both
2. Si both → crea Membership (pendiente) + EventRegistration
3. Si event only → solo EventRegistration
4. Registration.status = pendiente_pago
5. Tras pago aprobado → confirmada
6. Si requiresMembership:
   - Verificar Membership.status = activa antes de confirmada
   - Si solo event sin afiliación activa → observada o bloquear (definir política)
```

### 5. Cupos

Implementación sugerida:

```javascript
async function canRegisterToEvent(eventId) {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event.capacity) return true
  const count = await prisma.eventRegistration.count({
    where: { eventId, status: { in: ['confirmada', 'pagada', 'pendiente_pago'] } },
  })
  return count < event.capacity
}
```

UI: deshabilitar inscripción y mostrar "Cupos agotados" en `EventsPage`.

### 6. Vista pública — `EventsPage.jsx`

- Listar `UPCOMING_EVENTS` con fecha, venue, CTA a registro.
- CTA navega a `register` con evento preseleccionado (mejora futura).
- No duplicar datos: eventualmente fetch desde API/DB.

### 7. Panel admin — filtros

En `useAppData.js`:

```javascript
filters: { status: 'all', event: 'all', query: '' }
// eventMatch: registration.event === filters.event
```

Valores de evento hoy: string `'Pitbull Classic'` — migrar a `eventId` o slug.

### 8. Estados de inscripción

| Estado | Significado | Visible para atleta |
|--------|-------------|---------------------|
| borrador | Incompleta | No |
| pendiente_pago | Esperando MP/manual | Sí |
| pagada | Cobrada, falta revisión | Admin |
| confirmada | Lista para competir | Sí |
| observada | Requiere acción admin | Sí |
| cancelada | Baja | Sí |

## Validaciones

- No inscribir si cupo lleno.
- `requiresMembership` → afiliación `activa` para `confirmada`.
- Una inscripción activa por atleta/evento (unique constraint sugerido).
- Categoría y división dentro de `FORM_OPTIONS`.
- Filtro admin por evento devuelve subset correcto.
- Evento `closed` no acepta nuevas inscripciones.

## Errores comunes

| Error | Impacto | Fix |
|-------|---------|-----|
| Evento hardcodeado en servicio | No escala multi-evento | Parametrizar eventId/slug |
| Ignorar requiresMembership | Inscripción sin afiliación | Validar en confirmación |
| Cupos sin atomicidad | Overbooking | Transacción DB al confirmar |
| Nombre evento inconsistente | Filtros rotos | Usar slug como FK |
| División incorrecta por edad | DQ en competencia | Validar birthDate vs eventDate |

## Checklist de aceptación

- [ ] Pitbull Classic en seed/DB con `requiresMembership: true`
- [ ] Inscripción crea `EventRegistration` con categoría/división del form
- [ ] Estados siguen enum `RegistrationStatus`
- [ ] Admin filtra por evento
- [ ] EventsPage muestra eventos próximos
- [ ] (Futuro) Validación de cupos
- [ ] (Futuro) Validación afiliación activa
- [ ] Tests de registro con `procedureType: event`

## Referencias oficiales

- `docs/BUSINESS_RULES.md`
- [IPF — Weight classes & divisions](https://www.powerlifting.sport/rules/)
- `prisma/schema.prisma` — Event, EventRegistration

## Archivos del proyecto relacionados

| Archivo | Rol |
|---------|-----|
| `src/pages/EventsPage.jsx` | Listado público |
| `src/pages/RegisterPage.jsx` | Formulario inscripción |
| `src/services/athleteService.js` | Crea registrations |
| `src/hooks/useAppData.js` | Filtros, dashboard |
| `src/pages/AdminPage.jsx` | Tabla inscripciones |
| `src/lib/constants.js` | UPCOMING_EVENTS, FORM_OPTIONS |
| `prisma/schema.prisma` | Modelos Event |
