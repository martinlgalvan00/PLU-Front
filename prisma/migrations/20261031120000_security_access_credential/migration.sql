-- Credencial vigente del puesto de seguridad.
--
-- El QR de acceso dejó de meter un HMAC largo en la URL. El código XXX-XXX
-- vive en la cuenta: abrirlo de nuevo muestra el mismo, y regenerar sube la
-- versión para que el link anterior deje de entrar. Los HMAC ya enviados
-- (sin `ver`) siguen valiendo mientras securityAccessVersion sea 0.

ALTER TABLE "User" ADD COLUMN "securityAccessCode" TEXT;
ALTER TABLE "User" ADD COLUMN "securityAccessExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "securityAccessVersion" INTEGER NOT NULL DEFAULT 0;

-- Varias cuentas sin código (NULL) conviven: Postgres no trata NULL como igual.
CREATE UNIQUE INDEX "User_eventId_securityAccessCode_key"
  ON "User" ("eventId", "securityAccessCode");
