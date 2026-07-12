# Infraestructura de Datos V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar un contrato de datos multi-organizacion, normalizado y eficiente para Supabase.

**Architecture:** Prisma define el core normalizado de escritura. Supabase debe exponer RLS, RPCs y read models encima de ese core para consultas rapidas.

**Tech Stack:** PostgreSQL 16, Supabase, Prisma, Vitest.

---

### Task 1: Prisma Contract

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/prismaSchema.test.js`

- [x] Escribir tests de contrato para `Organization`, `Person`, afiliaciones por periodo, tickets por ventana, pagos con items y `OutboxEvent`.
- [x] Verificar que los tests fallen contra el modelo anterior.
- [x] Actualizar `prisma/schema.prisma` con el modelo v3.
- [x] Verificar `npm.cmd test -- tests/prismaSchema.test.js`.
- [x] Verificar `$env:DATABASE_URL='postgresql://plu:plu_dev@localhost:5432/plu_arg'; npx.cmd prisma validate`.

### Task 2: Documentation

**Files:**
- Modify: `docs/DATABASE_MODEL.md`
- Create: `docs/superpowers/specs/2026-07-11-infraestructura-datos-v3-design.md`
- Create: `docs/superpowers/plans/2026-07-11-infraestructura-datos-v3.md`

- [x] Documentar entidades por dominio.
- [x] Documentar indices principales.
- [x] Documentar read models recomendados para Supabase.
- [x] Documentar fases de migracion.

### Task 3: Pending Supabase Migration

**Files:**
- Future: `supabase/migrations/<timestamp>_data_infrastructure_v3.sql`

- [ ] Generar migracion SQL desde el schema Prisma v3.
- [ ] Revisar manualmente drops/renames antes de aplicarla.
- [ ] Agregar RLS basada en `organization_members`.
- [ ] Agregar RPCs transaccionales para compra de tickets, afiliacion, pago y check-in.
- [ ] Agregar vistas `public_events_view`, `admin_event_overview`, `membership_roster_view`, `ticket_sales_summary`, `payment_reconciliation_view` y `checkin_activity_view`.
