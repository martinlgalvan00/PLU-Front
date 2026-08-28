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
--
-- "Organization" y "OrganizationMember" son tablas del esquema legado de Prisma:
-- existen en la base hosteada, pero NO las crea ninguna migracion de este corpus
-- (ver el modelo de datos dual del README). Sin guarda, `supabase db reset`
-- -local y el de CI- se corta aca con 42P01 y ninguna migracion posterior se
-- aplica. La guarda no cambia nada en produccion, donde las dos tablas estan.
do $gym_fk$
begin
  if to_regclass('public."Organization"') is not null then
    alter table "public"."Gym"
      add constraint "Gym_organizationId_fkey" foreign key ("organizationId")
      references "public"."Organization"("id") on delete cascade on update cascade;
  else
    raise notice 'Sin "Organization" (esquema Prisma): "Gym" queda sin la foreign key.';
  end if;
end
$gym_fk$;

-- Enable RLS
ALTER TABLE "public"."Gym" ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Public gyms are viewable by everyone" ON "public"."Gym" FOR SELECT USING (true);
CREATE POLICY "Gyms are insertable by authenticated users" ON "public"."Gym" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
-- Misma guarda, por el mismo motivo: la politica referencia "OrganizationMember".
do $gym_policy$
begin
  if to_regclass('public."OrganizationMember"') is not null then
    create policy "Gyms are updatable by admins" on "public"."Gym" for update using (
      exists (
        select 1 from "public"."OrganizationMember"
        where "organizationId" = "Gym"."organizationId"
          and "personId" = auth.uid()
          and "role" in ('admin', 'owner')
      )
    );
  else
    raise notice 'Sin "OrganizationMember" (esquema Prisma): "Gym" queda sin la politica de admins.';
  end if;
end
$gym_policy$;
