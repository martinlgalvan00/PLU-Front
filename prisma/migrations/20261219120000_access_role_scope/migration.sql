-- Alcance del AccessRole: global (panel) vs event (solo UserEventAccess).
-- Aditivo e idempotente. Default `global` para que un backend nuevo conviva con
-- una base sin migrar: el JS sigue aceptando la clave `organizador_evento` como
-- respaldo hasta que esta columna exista y esté seteada.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessRoleScope') THEN
    CREATE TYPE "AccessRoleScope" AS ENUM ('global', 'event');
  END IF;
END $$;

ALTER TABLE "AccessRole"
  ADD COLUMN IF NOT EXISTS "scope" "AccessRoleScope" NOT NULL DEFAULT 'global';

UPDATE "AccessRole"
SET "scope" = 'event'
WHERE "key" = 'organizador_evento';

CREATE INDEX IF NOT EXISTS "AccessRole_scope_idx" ON "AccessRole" ("scope");
