import {
  CORE_BLOCK_ORDER,
  CUSTOM_BLOCK_TYPES,
  isSafeLandingHref,
  isSafeLandingImagePath,
  isSafeLandingVideoUrl,
  LANDING_BLOCK_LIMITS,
} from '../eventLandingLayout.js'
import { LANDING_MOTION_PRESETS } from '../eventLandingMotion.js'

/**
 * Esquema Zod del `layout` de una landing Constructor. Lo comparten el panel
 * (`adminEvent.js`) y la ruta del servidor (`server/routes/events.js`) para que
 * los topes no se desalineen; espeja además la RPC
 * `staff_merge_event_landing_layout`.
 *
 * @param {typeof import('zod').z} z
 */
export function buildLandingLayoutSchema(z) {
  const text = (max) => z.string().trim().max(max)
  const blockTypes = [...CORE_BLOCK_ORDER, ...Object.keys(CUSTOM_BLOCK_TYPES)]

  const props = z
    .object({
      eyebrow: text(LANDING_BLOCK_LIMITS.eyebrow).optional(),
      title: text(LANDING_BLOCK_LIMITS.title).optional(),
      body: text(LANDING_BLOCK_LIMITS.body).optional(),
      label: text(LANDING_BLOCK_LIMITS.label).optional(),
      href: text(LANDING_BLOCK_LIMITS.href)
        .refine(isSafeLandingHref, 'landingLayoutHrefInvalid')
        .optional(),
      path: text(LANDING_BLOCK_LIMITS.path)
        .refine(isSafeLandingImagePath, 'landingHeroImagePathInvalid')
        .optional(),
      alt: text(LANDING_BLOCK_LIMITS.alt).optional(),
      caption: text(LANDING_BLOCK_LIMITS.caption).optional(),
      video: text(LANDING_BLOCK_LIMITS.video)
        .refine(isSafeLandingVideoUrl, 'landingLayoutVideoInvalid')
        .optional(),
      // Galería y sponsors: una ruta por foto o logo.
      ...Object.fromEntries(
        Array.from({ length: LANDING_BLOCK_LIMITS.sponsorLogos }, (_, index) => [
          `path${index + 1}`,
          text(LANDING_BLOCK_LIMITS.path)
            .refine(isSafeLandingImagePath, 'landingHeroImagePathInvalid')
            .optional(),
        ]),
      ),
    })
    .strict()

  const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'landingLayoutColorInvalid')

  return z.object({
    blocks: z
      .array(
        z
          .object({
            id: z.string(),
            type: z.enum(blockTypes),
            visible: z.boolean().optional(),
            props: props.optional(),
          })
          // Integrado: su id es el tipo (`weighIns` lleva mayúscula). Propio:
          // minúsculas, números y guiones.
          .refine(
            (block) =>
              CORE_BLOCK_ORDER.includes(block.type)
                ? block.id === block.type
                : /^[a-z0-9][a-z0-9-]{0,39}$/.test(block.id),
            { message: 'landingLayoutBlockIdInvalid', path: ['id'] },
          ),
      )
      .max(LANDING_BLOCK_LIMITS.maxBlocks, 'landingLayoutBlocksMax')
      .optional(),
    palette: z
      .object({
        accent: hex.optional(),
        action: hex.optional(),
        background: hex.optional(),
      })
      .strict()
      .optional(),
    motion: z.enum(LANDING_MOTION_PRESETS, 'landingLayoutMotionInvalid').optional(),
  })
}
