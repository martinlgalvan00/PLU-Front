-- Alta de staff con contraseña temporal.
--
-- Hasta ahora `POST /api/users` creaba la cuenta sin passwordHash, esperando
-- que entrara por Auth0 (nunca configurado): el usuario dado de alta no podía
-- entrar por ningún lado. Ahora se crea con una clave temporal que sólo
-- habilita a cambiarla, y esta bandera es la que sostiene ese corte.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
