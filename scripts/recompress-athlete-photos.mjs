#!/usr/bin/env node
/**
 * Recomprime retratos ya subidos a `athlete-photos` al mismo presupuesto
 * que el upload del browser (512px, WebP ~0.65, tope ~100 KB).
 *
 * Las fotos viejas (~1 MB) siguen contando egress en cada miss de cache.
 * Este script las achica, sube un path nuevo con cacheControl largo y
 * actualiza `athletes.photo_path` (borra el original).
 *
 * Uso:
 *   npm run photos:recompress -- --dry-run
 *   npm run photos:recompress
 */
import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import {
  ATHLETE_PHOTO_MAX_EDGE,
  ATHLETE_PHOTO_TARGET_MAX_BYTES,
  ATHLETE_PHOTO_WEBP_QUALITY,
} from '../src/lib/compressImageFile.js'

try {
  loadEnvFile()
} catch {
  // CI o el entorno ya exportó las vars.
}

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.slice('--limit='.length)) : null
const MAX_EDGE = ATHLETE_PHOTO_MAX_EDGE
const WEBP_QUALITY = Math.round(ATHLETE_PHOTO_WEBP_QUALITY * 100)
const SKIP_UNDER_BYTES = ATHLETE_PHOTO_TARGET_MAX_BYTES
const BUCKET = 'athlete-photos'
const OBJECT_CACHE_CONTROL = '31536000'

const url = process.env.SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let listQuery = admin
  .from('athletes')
  .select('id, full_name, photo_path')
  .not('photo_path', 'is', null)
  .order('updated_at', { ascending: false })

if (Number.isFinite(LIMIT) && LIMIT > 0) {
  listQuery = listQuery.limit(LIMIT)
}

const { data: athletes, error: listError } = await listQuery

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
let failed = 0
let bytesIn = 0
let bytesOut = 0

async function encodeWebp(input) {
  let quality = WEBP_QUALITY
  let output = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer()

  for (const passQuality of [55, 45]) {
    if (output.length <= SKIP_UNDER_BYTES) break
    quality = passQuality
    output = await sharp(input, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer()
  }
  return output
}

for (const athlete of rows) {
  const { data: file, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(athlete.photo_path)
  if (downloadError || !file) {
    failed += 1
    console.warn(`✗ ${athlete.full_name}: no se pudo leer ${athlete.photo_path}`)
    continue
  }

  const input = Buffer.from(await file.arrayBuffer())
  bytesIn += input.length
  const image = sharp(input, { failOn: 'none' })
  const meta = await image.metadata()
  const alreadySmall =
    athlete.photo_path.endsWith('.webp') &&
    input.length <= SKIP_UNDER_BYTES &&
    (meta.width ?? 0) <= MAX_EDGE &&
    (meta.height ?? 0) <= MAX_EDGE

  if (alreadySmall) {
    skipped += 1
    bytesOut += input.length
    console.log(`= ${athlete.full_name}: ${input.length} bytes, ya entra`)
    continue
  }

  const output = await encodeWebp(input)
  const outMeta = await sharp(output, { failOn: 'none' }).metadata()
  // Un WebP valido puede pesar menos de 1 KB si el retrato es muy oscuro o
  // casi uniforme. El chequeo anterior trataba ese ahorro como corrupcion y
  // dejaba el JPEG original de mas de 1 MB en Storage. Validamos el contenedor
  // decodificado y sus dimensiones, no un minimo arbitrario de bytes.
  const outputWidth = outMeta.width ?? 0
  const outputHeight = outMeta.height ?? 0
  const looksCorrupt =
    outMeta.format !== 'webp' ||
    outputWidth <= 0 ||
    outputHeight <= 0 ||
    outputWidth > MAX_EDGE ||
    outputHeight > MAX_EDGE ||
    output.length < 32

  if (looksCorrupt) {
    failed += 1
    console.warn(`✗ ${athlete.full_name}: el resultado quedó inválido, se deja el original`)
    continue
  }

  if (output.length >= input.length) {
    skipped += 1
    bytesOut += input.length
    console.log(`= ${athlete.full_name}: ${input.length} bytes, recomprimir no ahorra`)
    continue
  }

  console.log(
    `${DRY_RUN ? '~' : '✓'} ${athlete.full_name}: ${input.length} → ${output.length} bytes`,
  )
  if (DRY_RUN) {
    rewritten += 1
    bytesOut += output.length
    continue
  }

  const nextPath = `${athlete.id}/${Date.now()}-portrait.webp`
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(nextPath, output, {
    contentType: 'image/webp',
    cacheControl: OBJECT_CACHE_CONTROL,
    upsert: false,
  })
  if (uploadError) {
    failed += 1
    console.warn(`✗ ${athlete.full_name}: no se pudo subir ${nextPath}: ${uploadError.message}`)
    continue
  }

  const { error: updateError } = await admin
    .from('athletes')
    .update({ photo_path: nextPath, updated_at: new Date().toISOString() })
    .eq('id', athlete.id)
  if (updateError) {
    failed += 1
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
  bytesOut += output.length
}

const saved = Math.max(0, bytesIn - bytesOut)
console.log(
  DRY_RUN
    ? `Dry-run: ${rewritten} para achicar, ${skipped} ok, ${failed} fallidas. Ahorro estimado ~${Math.round(saved / 1024)} KB por miss.`
    : `Listo: ${rewritten} recomprimidas, ${skipped} sin cambios, ${failed} fallidas. Bytes ${bytesIn} → ${bytesOut} (Δ ${saved}).`,
)
