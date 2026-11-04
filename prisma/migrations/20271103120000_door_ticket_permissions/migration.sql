-- Habilitar entradas y forzar un ingreso, sin abrir Finanzas ni la edición
-- del evento. Aditivo: no reescribe la migración del coordinador.
--
-- El DELETE del coordinador repite la lista permitida con las claves nuevas.
-- Si no, una matriz que se recorta a los tres permisos viejos se las saca.

INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES
  (
    'admin.tickets.enable',
    'checkin',
    'approve',
    'Habilitar entradas',
    'Aprobar o rechazar una orden de entradas pendiente del evento asignado.',
    101
  ),
  (
    'admin.checkin.override',
    'checkin',
    'override',
    'Excepción de ingreso',
    'Forzar el ingreso de una entrada ya paga fuera de vigencia o de zona.',
    102
  )
ON CONFLICT ("key") DO UPDATE SET
  "module" = EXCLUDED."module",
  "action" = EXCLUDED."action",
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT r."id", p."key"
FROM "AccessRole" r
CROSS JOIN "AccessPermission" p
WHERE r."key" IN (
  'admin_maximal',
  'admin_plu_arg',
  'seguridad_plu_arg',
  'coordinador_seguridad'
)
  AND p."key" IN ('admin.tickets.enable', 'admin.checkin.override')
ON CONFLICT ("roleId", "permissionKey") DO NOTHING;

UPDATE "AccessRole"
SET
  "description" = 'Coordina la puerta de los eventos que se le asignan: equipo, zonas, quién compró, habilitación de entradas y excepciones de ingreso.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'coordinador_seguridad';

DELETE FROM "AccessRolePermission"
WHERE "roleId" IN (SELECT "id" FROM "AccessRole" WHERE "key" = 'coordinador_seguridad')
  AND "permissionKey" NOT IN (
    'admin.events.read',
    'admin.checkin.execute',
    'admin.event_team.write',
    'admin.tickets.enable',
    'admin.checkin.override'
  );
