import { loadEnvFile } from 'node:process'
import { createApp } from './app.js'
import { applyDeploymentEnvironmentDefaults } from './lib/deploymentEnvironment.js'
import { applyServerRuntimeDefaults } from './lib/runtime.js'
import { getPrisma } from './lib/prisma.js'
import { getSupabaseAdmin } from './lib/supabaseAdmin.js'
import { startMembershipRenewalJob } from './jobs/membershipRenewalJob.js'
import { startPaymentRecoveryJob } from './jobs/paymentRecoveryJob.js'
import { startDomainMaintenanceJob } from './jobs/domainMaintenanceJob.js'
import { startSecurityUserLifecycleJob } from './jobs/securityUserLifecycleJob.js'

try {
  loadEnvFile()
} catch {
  // Las variables también pueden venir del entorno del proceso o del CI.
}

applyDeploymentEnvironmentDefaults()

const app = createApp()
const port = Number(process.env.PORT) || 3001

const server = app.listen(port, () => {
  console.info(`API PLU ARG en http://localhost:${port}`)
})

applyServerRuntimeDefaults(server)
startMembershipRenewalJob({ client: getSupabaseAdmin() })
startPaymentRecoveryJob({ client: getSupabaseAdmin() })
startDomainMaintenanceJob({ client: getSupabaseAdmin() })
startSecurityUserLifecycleJob({ prisma: getPrisma(), client: getSupabaseAdmin() })
