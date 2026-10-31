-- Equipo o gimnasio de la planilla de resultados. No se rellena si el CSV
-- no lo trae y el atleta no matchea con una sola ficha.
ALTER TABLE "LiftingResult" ADD COLUMN "teamName" TEXT;
