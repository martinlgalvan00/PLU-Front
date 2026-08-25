import { config } from 'dotenv'
config()

if (!process.env.DATABASE_URL && process.env.SUPABASE_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.SUPABASE_DATABASE_URL
}

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const stopWords = [
  'gym', 'club', 'barbell', 'crossfit', 'box', 'team',
  'powerlifting', 'fitness', 'centro', 'entrenamiento',
  'strength', 'de', 'el', 'la', 'los', 'las',
]

const normalize = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const getCoreName = (norm) => {
  const words = norm.split(' ').filter(Boolean)
  const filtered = words.filter((w) => !stopWords.includes(w))
  return filtered.length > 0 ? filtered.join(' ') : norm
}

const levenshtein = (a, b) => {
  if (a === b) return 0
  const matrix = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

const isSimilarCore = (coreA, coreB) => {
  if (coreA === coreB) return true
  const aNoSpace = coreA.replace(/\s+/g, '')
  const bNoSpace = coreB.replace(/\s+/g, '')
  if (aNoSpace === bNoSpace) return true

  const dist = levenshtein(coreA, coreB)
  const maxLen = Math.max(coreA.length, coreB.length)
  if (maxLen >= 10 && dist <= 2) return true
  if (maxLen >= 5 && dist <= 1) return true

  if (coreA.length >= 4 && coreB.startsWith(coreA + ' ')) return true
  if (coreB.length >= 4 && coreA.startsWith(coreB + ' ')) return true

  return false
}

async function run() {
  console.log('Detectando tablas en la base de datos...')
  try {
    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `)
    console.log('Tablas encontradas:', tables)
  } catch(e) {
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
  } catch(e) {
    console.log('No se encontró "organizations", intentando "Organization"...')
    orgs = await prisma.$queryRawUnsafe(`SELECT id, name FROM "Organization"`)
  }

  for (const org of orgs) {
    console.log(`Procesando organizacion: ${org.name}`)
    
    let rows = []
    try {
      rows = await prisma.$queryRawUnsafe(`
        SELECT gym, COUNT(gym)::int as count 
        FROM "athletes" 
        WHERE "organization_id" = $1::uuid AND gym IS NOT NULL AND gym != ''
        GROUP BY gym
      `, org.id)
    } catch(e) {
      rows = await prisma.$queryRawUnsafe(`
        SELECT gym, COUNT(gym)::int as count 
        FROM "OrganizationAthlete" 
        WHERE "organizationId" = $1 AND gym IS NOT NULL AND gym != ''
        GROUP BY gym
      `, org.id)
    }

    const exactGrouped = {}
    for (const row of rows) {
      if (!row.gym) continue
      const norm = normalize(row.gym)
      if (!exactGrouped[norm]) {
        exactGrouped[norm] = { name: row.gym, count: row.count }
      } else {
        if (row.count > exactGrouped[norm].count) {
          exactGrouped[norm].name = row.gym
        }
        exactGrouped[norm].count += row.count
      }
    }

    const sortedGroups = Object.entries(exactGrouped).sort((a, b) => b[1].count - a[1].count)
    const anchors = []

    for (const [norm, data] of sortedGroups) {
      const core = getCoreName(norm)
      let merged = false
      for (const anchor of anchors) {
        if (isSimilarCore(core, anchor.core)) {
          anchor.count += data.count
          merged = true
          break
        }
      }
      if (!merged) {
        anchors.push({ core, name: data.name, count: data.count })
      }
    }

    console.log(`Encontrados ${anchors.length} gimnasios unicos de ${sortedGroups.length} variaciones. Insertando...`)
    
    let inserted = 0
    for (const anchor of anchors) {
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "Gym" ("id", "organizationId", "name", "coreName", "createdAt")
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT ("organizationId", "coreName") 
          DO UPDATE SET name = EXCLUDED.name
        `, Math.random().toString(36).substr(2, 9), org.id, anchor.name, anchor.core)
        inserted++
      } catch (error) {
        console.error(`Error insertando ${anchor.name}:`, error.message)
      }
    }
    console.log(`Insertados ${inserted} gimnasios.`)
  }

  console.log('Migracion completada.')
  process.exit(0)
}

run().catch(console.error)
