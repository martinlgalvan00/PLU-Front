# Inputs de negocio — autoridad federativa (Ola 2)

Checklist para cerrar el gap de contenido frente a WRPF / APL.
Ingeniería ya dejó la superficie lista (`/resultados`, `/records`, `/estandares`);
falta la fuente oficial del equipo PLU.

## 1. Meets a publicar en Resultados

- [x] Archivo demo con 2 meets (`spring-classic-2025`, `winter-open-2025`) para densidad UI.
- [ ] Lista de meets históricos **oficiales** a cargar (slug, fecha, sede, planilla).
- [ ] Formato de origen: LiftingCast export / CSV / JSON.
- [ ] Owner que valida publicación (quién aprueba “published”).
- [ ] Cadencia post-meet (ej. 48–72 h hábiles).

Estado actual en código: `src/data/results/*.json` + registro en `src/services/resultsService.js`.

## 2. Fuente de récords oficiales

- [ ] Confirmar si el padrón se deriva solo de planillas publicadas (comportamiento actual)
      o si llega un estándar / tabla PLU USA.
- [ ] Qué marcas son oficiales (total / por levantamiento / por división).
- [ ] Política de empates y superseding.
- [ ] Copy institucional cuando el estándar global aún no esté disponible.

Servicio actual: `src/services/recordsService.js` (deriva de resultados publicados).

## 3. PDF / tabla de estándares de clasificación

- [x] Slot de PDF en `/estandares` (`src/data/classificationStandards.js` → `pdfUrl`).
- [ ] PDF oficial PLU ARG o enlace PLU USA.
- [ ] Totales / requisitos por sexo, edad, peso y modalidad (si aplican).
- [ ] Idiomas (ES / EN).
- [ ] Fecha de vigencia y canal de actualización.

## 4. Alcance del padrón / lookup de atletas

- [x] Lookup solo sobre planillas publicadas (implementado).
- [ ] ¿Padrón de afiliados con estado de membresía? Requiere consentimiento y
      campos públicos permitidos.
- [ ] Qué datos nunca se exponen (DNI, email, teléfono, dirección).

Servicio actual: `src/services/lifterLookupService.js`.

## 5. Sponsors

- [x] Catálogo vacío listo (`src/data/sponsors.js`) — agregar partners firmados ahí.
- [ ] Lista firmada de partners por tier (title / official / support).
- [ ] Logos (SVG/PNG) + URL + copy corto.
- [ ] Fecha de vigencia de cada acuerdo.

Página: `/sponsors`.

## 6. SEO / share (hecho en código)

- [x] Titles / description / Open Graph por vista (`DocumentMetaSync`).
- [x] `public/sitemap.xml` + `public/robots.txt`.

## Contacto operativo

Canal sugerido: `hola@pluarg.com.ar` + owner de contenido del staff PLU ARG.
