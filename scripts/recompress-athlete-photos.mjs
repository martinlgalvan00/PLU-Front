#!/usr/bin/env node
/**
 * Recomprime retratos ya subidos a `athlete-photos` (lado largo 720, WebP).
 * Las fotos viejas siguen en ~1 MB; cada visita las vuelve a contar como
 * egress. Este script las achica in-place y actualiza `athletes.photo_path`.
 *
 * Uso: node scripts/recompress-athlete-photos.mjs
 * Dry-run: node scripts/recompress-athlete-photos.mjs --dry-run
 */
import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

try {
  loadEnvFile()
} catch {
  // CI o el entorno ya exportó las vars.
}

const DRY_RUN = process.argv.includes('--dry-run')
const MAX_EDGE = 720
const WEBP_QUALITY = 72
const SKIP_UNDER_BYTES = 120 * 1024
const BUCKET = 'athlete-photos'

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: athletes, error: listError } = await admin
  .from('athletes')
  .select('id, full_name, photo_path')
  .not('photo_path', 'is', null)

if (listError) {
  console.error(listError.message)
  process.exit(1)
}

const rows = (athletes ?? []).filter((row) => row.photo_path)
if (rows.length === 0) {
  console.log('No hay retratos para recomprimir.')
  process.exit(0)
}

let rewritten = 0
let skipped = 0

for (const athlete of rows) {
  const { data: file, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(athlete.photo_path)
  if (downloadError || !file) {
    console.warn(`✗ ${athlete.full_name}: no se pudo leer ${athlete.photo_path}`)
    continue
  }

  const input = Buffer.from(await file.arrayBuffer())
  const image = sharp(input, { failOn: 'none' })
  const meta = await image.metadata()
  const alreadySmall =
    athlete.photo_path.endsWith('.webp') &&
    input.length <= SKIP_UNDER_BYTES &&
    (meta.width ?? 0) <= MAX_EDGE &&
    (meta.height ?? 0) <= MAX_EDGE

  if (alreadySmall) {
    skipped += 1
    console.log(`= ${athlete.full_name}: ${input.length} bytes, ya entra`)
    continue
  }

  const output = await image
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  if (output.length < 4 * 1024 && input.length > 50 * 1024) {
    skipped += 1
    console.warn(`✗ ${athlete.full_name}: el resultado quedó demasiado chico, se deja el original`)
    continue
  }

  console.log(
    `${DRY_RUN ? '~' : '✓'} ${athlete.full_name}: ${input.length} → ${output.length} bytes`,
  )
  if (DRY_RUN) {
    rewritten += 1
    continue
  }

  const nextPath = `${athlete.id}/${Date.now()}-portrait.webp`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(nextPath, output, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (uploadError) {
    console.warn(`✗ ${athlete.full_name}: no se pudo subir ${nextPath}: ${uploadError.message}`)
    continue
  }

  const { error: updateError } = await admin
    .from('athletes')
    .update({ photo_path: nextPath, updated_at: new Date().toISOString() })
    .eq('id', athlete.id)
  if (updateError) {
    console.warn(`✗ ${athlete.full_name}: no se pudo actualizar photo_path: ${updateError.message}`)
    await admin.storage.from(BUCKET).remove([nextPath])
    continue
  }

  if (athlete.photo_path !== nextPath) {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([athlete.photo_path])
    if (removeError) {
      console.warn(`! ${athlete.full_name}: quedó el original ${athlete.photo_path}`)
    }
  }
  rewritten += 1
}

console.log(
  DRY_RUN
    ? `Dry-run: ${rewritten} para achicar, ${skipped} ya estaban bien.`
    : `Listo: ${rewritten} recomprimidas, ${skipped} sin cambios.`,
)
