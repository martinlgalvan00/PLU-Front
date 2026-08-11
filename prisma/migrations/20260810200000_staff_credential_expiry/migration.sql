-- Vencimiento de la credencial temporal de staff.
--
-- Hasta ahora la contraseña emitida en el alta no caducaba: una invitación que
-- nunca se usó, o un mail reenviado por error, seguía abriendo la cuenta
-- indefinidamente. El corte de `mustChangePassword` limita lo que se puede
-- hacer con ella, pero no cuánto tiempo vive.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordExpiresAt" TIMESTAMP(3);
