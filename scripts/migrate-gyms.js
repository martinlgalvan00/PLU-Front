/**
 * One-shot: consolida variantes de gym en tabla Gym y reescribe atletas al canónico.
 *
 * Uso (manual, con DATABASE_URL o SUPABASE_DATABASE_URL):
 *   node scripts/migrate-gyms.js
 */
import { config } from 'dotenv'
config()

if (!process.env.DATABASE_URL && process.env.SUPABASE_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.SUPABASE_DATABASE_URL
}

import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import {
  getCoreName,
  isSimilarCore,
  mergeGymVariants,
  preferGymName,
} from '../server/lib/gymNormalize.js'

const prisma = new PrismaClient()

async function resolveAthleteTable(orgId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT gym, COUNT(gym)::int as count
      FROM "athletes"
      WHERE "organization_id" = $1::uuid AND gym IS NOT NULL AND gym != ''
      GROUP BY gym
    `,
      orgId,
    )
    return { table: 'athletes', orgColumn: 'organization_id', rows, uuidOrg: true }
  } catch {
    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT gym, COUNT(gym)::int as count
      FROM "OrganizationAthlete"
      WHERE "organizationId" = $1 AND gym IS NOT NULL AND gym != ''
      GROUP BY gym
    `,
      orgId,
    )
    return {
      table: 'OrganizationAthlete',
      orgColumn: 'organizationId',
      rows,
      uuidOrg: false,
    }
  }
}

async function rewriteAthleteGyms(source, orgId, anchors) {
  let updated = 0
  for (const row of source.rows) {
    if (!row.gym) continue
    const core = getCoreName(row.gym)
    const anchor = anchors.find((a) => isSimilarCore(core, a.core))
    if (!anchor || anchor.name === row.gym) continue

    try {
      if (source.table === 'athletes') {
        await prisma.$executeRawUnsafe(
          `
          UPDATE "athletes"
          SET gym = $1
          WHERE "organization_id" = $2::uuid AND gym = $3
        `,
          anchor.name,
          orgId,
          row.gym,
        )
      } else {
        await prisma.$executeRawUnsafe(
          `
          UPDATE "OrganizationAthlete"
          SET gym = $1
          WHERE "organizationId" = $2 AND gym = $3
        `,
          anchor.name,
          orgId,
          row.gym,
        )
      }
      updated += Number(row.count) || 1
      console.log(`  ${row.gym} → ${anchor.name} (${row.count})`)
    } catch (error) {
      console.error(`  Error reescribiendo "${row.gym}":`, error.message)
    }
  }
  return updated
}

async function run() {
  console.log('Detectando tablas en la base de datos...')
  try {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)
    console.log(
      'Tablas encontradas:',
      tables.map((t) => t.table_name),
    )
  } catch (e) {
    console.error('Error detectando tablas:', e.message)
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "public"."Gym" (
          "id" TEXT NOT NULL,
          "organizationId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "coreName" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Gym_pkey" PRIMARY KEY ("id")
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Gym_organizationId_idx" ON "public"."Gym"("organizationId");
    `)
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = 'Gym_organizationId_coreName_key'
          ) THEN
              ALTER TABLE "public"."Gym" ADD CONSTRAINT "Gym_organizationId_coreName_key" UNIQUE ("organizationId", "coreName");
          END IF;
      END $$;
    `)
  } catch (e) {
    console.error('Error creando tabla Gym:', e.message)
  }

  console.log('Migrando gimnasios...')

  let orgs = []
  try {
    orgs = await prisma.$queryRawUnsafe(`SELECT id, name FROM "organizations"`)
  } catch {
    console.log('No se encontró "organizations", intentando "Organization"...')
    orgs = await prisma.$queryRawUnsafe(`SELECT id, name FROM "Organization"`)
  }

  for (const org of orgs) {
    console.log(`Procesando organizacion: ${org.name}`)

    const source = await resolveAthleteTable(org.id)
    const anchors = mergeGymVariants(
      source.rows.map((row) => ({ name: row.gym, count: row.count })),
    )

    // Si ya hay canónicos en Gym, preferir el nombre más largo entre ancla y catálogo
    try {
      const catalog = await prisma.$queryRawUnsafe(
        `SELECT name, "coreName" FROM "Gym" WHERE "organizationId" = $1`,
        String(org.id),
      )
      for (const gym of catalog) {
        const match = anchors.find((a) => isSimilarCore(a.core, gym.coreName))
        if (match) {
          match.name = preferGymName(match.name, gym.name, match.count, 0)
          match.core = match.core.length >= gym.coreName.length ? match.core : gym.coreName
        } else {
          anchors.push({ core: gym.coreName, name: gym.name, count: 0 })
        }
      }
    } catch {
      // Catálogo ausente: seguimos con anclas de atletas
    }

    console.log(
      `Encontrados ${anchors.length} gimnasios unicos de ${source.rows.length} variaciones. Upsert...`,
    )

    let inserted = 0
    for (const anchor of anchors) {
      try {
        await prisma.$executeRawUnsafe(
          `
          INSERT INTO "Gym" ("id", "organizationId", "name", "coreName", "createdAt")
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT ("organizationId", "coreName")
          DO UPDATE SET name = EXCLUDED.name
        `,
          randomUUID(),
          String(org.id),
          anchor.name,
          anchor.core,
        )
        inserted++
      } catch (error) {
        console.error(`Error insertando ${anchor.name}:`, error.message)
      }
    }
    console.log(`Upserted ${inserted} gimnasios en catálogo.`)

    console.log('Reescribiendo gyms de atletas al canónico...')
    const rewritten = await rewriteAthleteGyms(source, org.id, anchors)
    console.log(`Atletas actualizados (filas afectadas aprox.): ${rewritten}`)
  }

  console.log('Migracion completada.')
  await prisma.$disconnect()
  process.exit(0)
}

run().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
