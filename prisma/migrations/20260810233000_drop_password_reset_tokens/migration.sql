-- Limpieza del spike de reset de contraseña vía Prisma (20260806120000).
--
-- La tabla PasswordResetToken quedó sin dueño: el reset de atletas persiste
-- en public.athlete_password_reset_tokens (Supabase) y el de staff usa tokens
-- firmados stateless (server/services/), así que ningún código la lee ni la
-- escribe. Las 3 filas que tenía eran tokens de prueba del 2026-08-06,
-- expirados ese mismo día y nunca usados. Sin este DROP, el próximo
-- `migrate dev` detectaría la tabla como drift y propondría borrarla igual.
DROP TABLE IF EXISTS "PasswordResetToken";
