-- Un CheckIn tiene que apuntar a exactamente uno de los dos targets
-- (un ticket de espectador o una inscripción de atleta), nunca ninguno
-- y nunca los dos. Prisma no expresa CHECK constraints declarativamente
-- (sin preview features), así que se agrega a mano.
ALTER TABLE "CheckIn"
  ADD CONSTRAINT "CheckIn_exactly_one_target"
  CHECK (
    (("ticketId" IS NOT NULL)::int + ("registrationId" IS NOT NULL)::int) = 1
  );
