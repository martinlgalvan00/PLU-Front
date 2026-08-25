-- CreateTable
CREATE TABLE "public"."Gym" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coreName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gym_organizationId_idx" ON "public"."Gym"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Gym_organizationId_coreName_key" ON "public"."Gym"("organizationId", "coreName");

-- AddForeignKey
ALTER TABLE "public"."Gym" ADD CONSTRAINT "Gym_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "public"."Gym" ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Public gyms are viewable by everyone" ON "public"."Gym" FOR SELECT USING (true);
CREATE POLICY "Gyms are insertable by authenticated users" ON "public"."Gym" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Gyms are updatable by admins" ON "public"."Gym" FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM "public"."OrganizationMember"
    WHERE "organizationId" = "Gym"."organizationId"
    AND "personId" = auth.uid()
    AND "role" IN ('admin', 'owner')
  )
);
