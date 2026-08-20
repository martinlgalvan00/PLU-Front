-- Zonas de seguridad del evento.
--
-- El equipo de seguridad de un meet era una lista plana de cuentas colgadas del
-- evento: todas con el mismo alcance y sin horario. Esta tabla agrupa esas
-- cuentas por zona física (puerta, pesaje, calentamiento, plataforma) y le da a
-- cada grupo un alcance de escaneo y un turno.
--
-- eventId/eventSlug apuntan a public.events de Supabase, igual que en "User":
-- sin FK, porque la tabla Prisma "Event" es legacy y no se puebla.

CREATE TYPE "EventSecurityZoneScope" AS ENUM (
  'gate_tickets',
  'athletes_only',
  'athletes_coaches',
  'staff_only'
);

CREATE TABLE "EventSecurityZone" (
  "id"         TEXT NOT NULL,
  "eventId"    TEXT NOT NULL,
  "eventSlug"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "scope"      "EventSecurityZoneScope" NOT NULL DEFAULT 'gate_tickets',
  "shiftStart" TIMESTAMP(3),
  "shiftEnd"   TIMESTAMP(3),
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventSecurityZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventSecurityZone_eventId_name_key"
  ON "EventSecurityZone" ("eventId", "name");

CREATE INDEX "EventSecurityZone_eventId_sortOrder_idx"
  ON "EventSecurityZone" ("eventId", "sortOrder");

-- Asignación de la cuenta de seguridad a su zona. ON DELETE SET NULL: borrar
-- una zona no puede borrar cuentas ni dejarlas huérfanas de evento; quedan sin
-- zona y el panel las muestra como pendientes de asignar.
ALTER TABLE "User" ADD COLUMN "securityZoneId" TEXT;

CREATE INDEX "User_securityZoneId_idx" ON "User" ("securityZoneId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_securityZoneId_fkey"
  FOREIGN KEY ("securityZoneId") REFERENCES "EventSecurityZone" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
