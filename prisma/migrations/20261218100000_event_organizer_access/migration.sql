-- Rol "Organizador": cuentas que solo operan sobre los eventos que se les asignan.
--
-- 1) UserEventAccess lista los eventos de cada cuenta (eventId es el uuid de
--    public.events en Supabase; no hay FK porque esa tabla vive en otra base).
-- 2) Permiso nuevo `admin.event_team.write`: alta de equipo de puerta dentro de un
--    evento asignado. Es distinto de `admin.users.write` a propósito: ese está
--    reservado a Super Admin y Administrador y permite crear cualquier cuenta.
-- 3) El rol de sistema `organizador_evento` con sus permisos.
--
-- Todo es aditivo e idempotente, y NO agrega columnas a tablas existentes: que un
-- rol sea "por evento" se deriva de su clave en el código, y UserEventAccess solo se
-- consulta para cuentas con ese rol. Así el backend nuevo convive con una base sin
-- migrar (ninguna cuenta tiene el rol todavía) y el orden de despliegue no puede
-- romper el login del resto del staff.

CREATE TABLE IF NOT EXISTS "UserEventAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventSlug" TEXT NOT NULL,
  "grantedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserEventAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserEventAccess_userId_eventId_key"
  ON "UserEventAccess" ("userId", "eventId");
CREATE INDEX IF NOT EXISTS "UserEventAccess_eventId_idx"
  ON "UserEventAccess" ("eventId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserEventAccess_userId_fkey'
  ) THEN
    ALTER TABLE "UserEventAccess"
      ADD CONSTRAINT "UserEventAccess_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES (
  'admin.event_team.write',
  'event_team',
  'write',
  'Gestionar equipo de puerta del evento',
  'Crear y asignar cuentas de seguridad dentro de un evento asignado.',
  133
)
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "AccessRole" (
  "id", "key", "name", "description", "baseRole",
  "isSystem", "isProtected", "assignableByAdmin", "active", "updatedAt"
)
VALUES (
  'organizador_evento',
  'organizador_evento',
  'Organizador',
  'Gestiona solo los eventos que se le asignan: ventas, cobros y equipo de puerta.',
  'operador_plu_arg',
  true, false, true, true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "baseRole" = EXCLUDED."baseRole",
  "isSystem" = EXCLUDED."isSystem",
  "assignableByAdmin" = EXCLUDED."assignableByAdmin",
  "active" = true;

-- Super Admin y Administrador reciben el permiso nuevo como todos los demás.
INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT r."id", 'admin.event_team.write'
FROM "AccessRole" r
WHERE r."key" IN ('admin_maximal', 'admin_plu_arg')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'organizador_evento', p."key"
FROM "AccessPermission" p
WHERE p."key" IN (
  'admin.events.read',
  'admin.events.write',
  'admin.registrations.read',
  'admin.payments.read',
  'admin.payments.approve',
  'admin.event_team.write'
)
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;
