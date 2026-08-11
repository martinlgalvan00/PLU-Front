-- Tokens de recuperación de contraseña para usuarios staff.
--
-- ARCHIVO RECONSTRUIDO (2026-08-10): la migración original se aplicó a la
-- base remota el 2026-08-06 15:48 UTC pero nunca se commiteó, y el modelo se
-- descartó del schema cuando el flujo de reset quedó resuelto por otro lado
-- (atletas: public.athlete_password_reset_tokens vía Supabase; staff: tokens
-- firmados stateless en server/services/). Este archivo reproduce la
-- definición real de la tabla tal como quedó registrada en la base para que
-- el historial de migraciones sea consistente de nuevo. El checksum de la
-- fila en _prisma_migrations se realineó con este contenido.
-- La tabla la elimina la migración posterior `drop_password_reset_tokens`.

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_usedAt_idx" ON "PasswordResetToken"("usedAt");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
