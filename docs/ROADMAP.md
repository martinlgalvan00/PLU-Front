# Roadmap — PLU ARG / Maximal

> Las fases 0–7 de abajo son el plan original y quedaron como historial: casi todo lo que
> listan ya existe en el código. Esta sección es el estado verificable (oct 2026).

## Estado real (oct 2026)

**Ya está:** persistencia en Supabase (`supabase/migrations/`), login y roles, Mercado Pago
(OAuth, perfiles, webhooks), transferencia y efectivo con validación manual, emails vía Brevo,
exportaciones, check-in, tienda, entradas y landing por evento (plantillas, paleta, bloques).
CI en `.github/workflows/ci.yml`: auditoría de dependencias, lint, tests, build, validación de
Prisma, `supabase db reset` + lint de esquemas, tests de integración y e2e de Playwright.

**Lo que se edita desde el panel:** eventos completos (datos, cobros, oferta por evento,
Google Form, landing). **Lo que sigue en código:** Home, FAQ, Equipo, Sponsors
(`src/data/sponsors.js`), textos institucionales (`src/i18n`) y plantillas de email.

**Próximos pasos, en orden:**
1. Alta de evento con presets y checklist de contenido para publicar.
2. Ajustes del sitio (marca global, contacto, SEO): tabla nueva `site_settings`. El aviso "Pronto habrá novedades" ya existe (`site_teasers`); los interruptores operativos siguen por RPC (`staff_*_platform_feature_toggle`).
3. Contenido editable de páginas fijas (`site_content`: bloques tipados, borrador/publicado).
4. Plantillas de email editables con vista previa.
5. Automatizaciones: recordatorios de pago pendiente, cierre de inscripción por cupo/fecha.

## Plan original (historial)

## Fase 0 — Infraestructura ✅
- Estructura modular Vite + React + CSS
- Agent skills (14)
- Docs base, Docker, Prisma schema, API scaffold
- Tests Vitest

## Fase 1 — Datos y auth
- [ ] Migraciones Prisma
- [ ] Seeds (Pitbull Classic, usuarios admin)
- [ ] API CRUD atletas/afiliaciones
- [ ] Login panel + JWT

## Fase 2 — Landing completa
- [ ] FAQ, reglamento, resultados
- [ ] Assets propios (logo, imágenes)

## Fase 3 — Core negocio backend
- [ ] Persistencia real (reemplazar localStorage)
- [ ] Panel CRUD completo

## Fase 4 — Mercado Pago
- [ ] Preferencias reales
- [ ] Webhooks + idempotencia
- [ ] Tests con mocks MP

## Fase 5 — Brevo
- [ ] Templates en Brevo
- [ ] Envío real + email_logs en DB

## Fase 6 — Export/import
- [ ] XLSX
- [ ] Import LiftingCast con preview

## Fase 7 — QA producción
- [ ] E2E Playwright
- [ ] Deploy
