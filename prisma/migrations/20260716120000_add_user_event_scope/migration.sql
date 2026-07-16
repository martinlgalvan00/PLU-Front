-- Un usuario con rol seguridad_plu_arg queda atado a un unico evento (login
-- y check-in server-side validan esta relacion, ver server/routes/auth.js
-- y server/routes/tickets.js). Para el resto de los roles queda en null.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "eventId" TEXT;

-- CreateIndex
CREATE INDEX "User_eventId_idx" ON "User"("eventId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
