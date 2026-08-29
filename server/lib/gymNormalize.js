/**
 * Re-export del normalizador de gimnasios (fuente en src/lib).
 * Permite imports limpios desde server/routes y scripts.
 */
export {
  GYM_STOP_WORDS,
  normalizeGym,
  getCoreName,
  stripGymAlnum,
  levenshtein,
  isSimilarCore,
  preferGymName,
  mergeGymVariants,
  filterGymOptions,
  findUniqueCoreMatch,
} from '../../src/lib/gymNormalize.js'
