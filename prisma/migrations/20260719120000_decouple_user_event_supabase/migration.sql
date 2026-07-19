-- Los eventos son canonicos en Supabase (public.events, id uuid). La tabla
-- Prisma "Event" es legacy y nunca se puebla, asi que la FK User.eventId ->
-- Event impedia atar una cuenta de seguridad a un evento real (el panel
-- entrega el uuid de Supabase, que no existe en "Event"). Se desacopla:
-- eventId pasa a guardar el uuid de Supabase sin FK, y se agrega eventSlug
-- desnormalizado para el scoping de login y las credenciales de puerta.

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_eventId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "eventSlug" TEXT;
