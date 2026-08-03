import { PrismaClient } from '@prisma/client'

/**
 * Cliente único por proceso.
 *
 * El singleton vive en `globalThis` y no en un `let` de módulo porque en
 * desarrollo el hot-reload reevalúa el módulo y en serverless el bundle puede
 * cargarse más de una vez dentro de la misma instancia: cada reevaluación
 * creaba un PrismaClient nuevo, con su propio pool, y los anteriores quedaban
 * con las conexiones tomadas hasta que Postgres las cerraba por timeout. Bajo
 * carga eso agota el límite de conexiones sin que crezca el tráfico real.
 *
 * El tamaño del pool se controla por `connection_limit` en la URL
 * (server/lib/deploymentEnvironment.js), que es donde Prisma lo lee.
 */
const PRISMA_SINGLETON = Symbol.for('plu.prisma.client')

export function getPrisma() {
  if (!globalThis[PRISMA_SINGLETON]) {
    globalThis[PRISMA_SINGLETON] = new PrismaClient({
      // `warn` y `error` van al log de la función; `query` quedaría enorme y
      // además imprime valores de parámetros (emails, hashes) en producción.
      log: ['warn', 'error'],
    })
  }

  return globalThis[PRISMA_SINGLETON]
}

/**
 * Cierre ordenado. En un servidor de larga vida (npm run dev:api, un contenedor)
 * evita dejar conexiones colgadas al reiniciar. En serverless no se llama: la
 * plataforma congela la instancia y el pooler recicla la conexión.
 */
export async function disconnectPrisma() {
  const client = globalThis[PRISMA_SINGLETON]
  if (!client) return

  globalThis[PRISMA_SINGLETON] = undefined
  await client.$disconnect()
}
