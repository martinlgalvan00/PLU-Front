-- Roles y permisos configurables del panel.
-- User.role se conserva como rol base para compatibilidad con Auth/Supabase;
-- AccessRole define el rol visible y los permisos efectivos.

CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRole" "UserRole" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "assignableByAdmin" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessPermission" (
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AccessPermission_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "AccessRolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

ALTER TABLE "User" ADD COLUMN "accessRoleId" TEXT;

CREATE UNIQUE INDEX "AccessRole_key_key" ON "AccessRole"("key");
CREATE INDEX "AccessRole_active_name_idx" ON "AccessRole"("active", "name");
CREATE INDEX "AccessRole_baseRole_idx" ON "AccessRole"("baseRole");
CREATE INDEX "AccessPermission_module_sortOrder_idx" ON "AccessPermission"("module", "sortOrder");
CREATE INDEX "AccessRolePermission_permissionKey_idx" ON "AccessRolePermission"("permissionKey");
CREATE INDEX "User_accessRoleId_status_idx" ON "User"("accessRoleId", "status");

ALTER TABLE "AccessRolePermission"
ADD CONSTRAINT "AccessRolePermission_roleId_fkey"
FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccessRolePermission"
ADD CONSTRAINT "AccessRolePermission_permissionKey_fkey"
FOREIGN KEY ("permissionKey") REFERENCES "AccessPermission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_accessRoleId_fkey"
FOREIGN KEY ("accessRoleId") REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "AccessRole"
  ("id", "key", "name", "description", "baseRole", "isSystem", "isProtected", "assignableByAdmin", "active", "updatedAt")
VALUES
  ('admin_maximal', 'admin_maximal', 'Super Admin', 'Control total del panel, roles y permisos.', 'admin_maximal', true, true, false, true, CURRENT_TIMESTAMP),
  ('admin_plu_arg', 'admin_plu_arg', 'Administrador', 'Operacion completa y alta de cuentas, sin modificar permisos.', 'admin_plu_arg', true, true, false, true, CURRENT_TIMESTAMP),
  ('operador_plu_arg', 'operador_plu_arg', 'Operador', 'Lectura y escritura operativa sin gestion de accesos.', 'operador_plu_arg', true, false, true, true, CURRENT_TIMESTAMP),
  ('viewer_plu_usa', 'viewer_plu_usa', 'PLU USA lectura', 'Consulta y exportacion autorizada para PLU USA.', 'viewer_plu_usa', true, false, true, true, CURRENT_TIMESTAMP),
  ('seguridad_plu_arg', 'seguridad_plu_arg', 'Seguridad', 'Check-in y control de acceso acotado a un evento.', 'seguridad_plu_arg', true, true, true, true, CURRENT_TIMESTAMP),
  ('federacion_plu_arg', 'federacion_plu_arg', 'Federacion', 'Lectura institucional de atletas, afiliaciones, eventos y resultados.', 'operador_plu_arg', true, false, true, true, CURRENT_TIMESTAMP),
  ('economia_plu_arg', 'economia_plu_arg', 'Economia', 'Consulta financiera, exportacion y aprobacion de pagos manuales.', 'operador_plu_arg', true, false, true, true, CURRENT_TIMESTAMP);

INSERT INTO "AccessPermission" ("key", "module", "action", "label", "description", "sortOrder")
VALUES
  ('admin.dashboard.read', 'dashboard', 'read', 'Ver resumen', 'Ver indicadores y actividad reciente del panel.', 10),
  ('admin.athletes.read', 'athletes', 'read', 'Leer atletas', 'Consultar el padron y el detalle de atletas.', 20),
  ('admin.athletes.write', 'athletes', 'write', 'Editar atletas', 'Editar datos y credenciales de atletas.', 21),
  ('admin.memberships.read', 'memberships', 'read', 'Leer afiliaciones', 'Consultar afiliaciones, vigencias y estados.', 30),
  ('admin.memberships.write', 'memberships', 'write', 'Editar afiliaciones', 'Gestionar afiliaciones y renovaciones.', 31),
  ('admin.events.read', 'events', 'read', 'Leer eventos', 'Consultar eventos, capacidad y configuracion.', 40),
  ('admin.events.write', 'events', 'write', 'Editar eventos', 'Crear y modificar eventos.', 41),
  ('admin.registrations.read', 'registrations', 'read', 'Leer inscripciones', 'Consultar inscripciones y sus estados.', 50),
  ('admin.registrations.write', 'registrations', 'write', 'Editar inscripciones', 'Modificar el estado operativo de inscripciones.', 51),
  ('admin.payments.read', 'payments', 'read', 'Leer pagos', 'Consultar ordenes, conciliaciones y comprobantes.', 60),
  ('admin.payments.approve', 'payments', 'approve', 'Aprobar pagos', 'Aprobar pagos manuales y reintentar operaciones.', 61),
  ('admin.shop.read', 'shop', 'read', 'Leer shop', 'Consultar el catalogo y el stock.', 70),
  ('admin.shop.write', 'shop', 'write', 'Editar shop', 'Crear, editar y archivar productos.', 71),
  ('admin.results.read', 'results', 'read', 'Leer resultados', 'Consultar resultados y planillas.', 80),
  ('admin.results.write', 'results', 'write', 'Editar resultados', 'Importar y publicar resultados.', 81),
  ('admin.exports.admin', 'exports', 'write', 'Exportar operacion', 'Descargar exportaciones internas de PLU ARG.', 90),
  ('admin.exports.plu_usa', 'exports', 'read', 'Exportar PLU USA', 'Descargar el consolidado autorizado para PLU USA.', 91),
  ('admin.checkin.execute', 'checkin', 'execute', 'Operar check-in', 'Escanear credenciales y registrar ingresos.', 100),
  ('admin.users.read', 'users', 'read', 'Leer usuarios', 'Consultar cuentas del panel.', 110),
  ('admin.users.write', 'users', 'write', 'Gestionar usuarios', 'Crear cuentas y asignar roles permitidos.', 111),
  ('admin.roles.read', 'roles', 'read', 'Leer roles', 'Consultar roles y su matriz de permisos.', 120),
  ('admin.roles.write', 'roles', 'write', 'Gestionar roles', 'Crear roles y modificar sus permisos.', 121),
  ('admin.audit.read', 'audit', 'read', 'Leer auditoria', 'Consultar cambios sensibles del sistema.', 130);

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'admin_maximal', "key" FROM "AccessPermission";

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'admin_plu_arg', "key"
FROM "AccessPermission"
WHERE "key" <> 'admin.roles.write';

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey")
SELECT 'operador_plu_arg', "key"
FROM "AccessPermission"
WHERE "key" NOT LIKE 'admin.users.%'
  AND "key" NOT LIKE 'admin.roles.%'
  AND "key" <> 'admin.audit.read';

INSERT INTO "AccessRolePermission" ("roleId", "permissionKey") VALUES
  ('viewer_plu_usa', 'admin.dashboard.read'),
  ('viewer_plu_usa', 'admin.athletes.read'),
  ('viewer_plu_usa', 'admin.memberships.read'),
  ('viewer_plu_usa', 'admin.events.read'),
  ('viewer_plu_usa', 'admin.registrations.read'),
  ('viewer_plu_usa', 'admin.results.read'),
  ('viewer_plu_usa', 'admin.exports.plu_usa'),
  ('seguridad_plu_arg', 'admin.events.read'),
  ('seguridad_plu_arg', 'admin.checkin.execute'),
  ('federacion_plu_arg', 'admin.dashboard.read'),
  ('federacion_plu_arg', 'admin.athletes.read'),
  ('federacion_plu_arg', 'admin.memberships.read'),
  ('federacion_plu_arg', 'admin.events.read'),
  ('federacion_plu_arg', 'admin.registrations.read'),
  ('federacion_plu_arg', 'admin.results.read'),
  ('federacion_plu_arg', 'admin.exports.admin'),
  ('economia_plu_arg', 'admin.dashboard.read'),
  ('economia_plu_arg', 'admin.athletes.read'),
  ('economia_plu_arg', 'admin.memberships.read'),
  ('economia_plu_arg', 'admin.registrations.read'),
  ('economia_plu_arg', 'admin.payments.read'),
  ('economia_plu_arg', 'admin.payments.approve'),
  ('economia_plu_arg', 'admin.exports.admin');

UPDATE "User"
SET "accessRoleId" = "role"::text
WHERE "accessRoleId" IS NULL;
