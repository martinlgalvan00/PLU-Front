import { loadEnvFile } from 'node:process'
try { loadEnvFile() } catch {}
const { applyDeploymentEnvironmentDefaults } = await import('../server/lib/deploymentEnvironment.js')
const { applyServerRuntimeDefaults } = await import('../server/lib/runtime.js')
applyDeploymentEnvironmentDefaults(process.env)
applyServerRuntimeDefaults(process.env)
const { getPrisma } = await import('../server/lib/prisma.js')
const { ACCESS_ROLE_INCLUDE } = await import('../server/services/accessControlService.js')
const prisma = getPrisma()
try {
  const s = await prisma.session.findUnique({
    where: { tokenHash: 'deadbeef'.repeat(8) },
    include: { user: { include: { profile: true, accessRole: { include: ACCESS_ROLE_INCLUDE } } } },
  })
  console.log('session query OK ->', s)
} catch (e) {
  console.log('SESSION QUERY THREW:', e.message)
}
process.exit(0)
