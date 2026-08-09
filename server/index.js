import { loadEnvFile } from 'node:process'
import { createApp } from './app.js'
import { applyDeploymentEnvironmentDefaults } from './lib/deploymentEnvironment.js'
import { applyServerRuntimeDefaults } from './lib/runtime.js'
import { getPrisma } from './lib/prisma.js'
import { getSupabaseAdmin } from './lib/supabaseAdmin.js'
import { startEmailDispatchJob } from './jobs/emailDispatchJob.js'
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
  const supabase = getSupabaseAdmin()
  if (supabase) {
    console.info('Supabase Admin: configurado')
  } else {
    console.warn('Supabase Admin: NO configurado (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  }
})

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(
      `El puerto ${port} está ocupado. Liberá ese proceso o definí otro en PORT (ej. PORT=3003) y reiniciá.`,
    )
    process.exit(1)
  }
  console.error('No se pudo iniciar la API:', error)
  process.exit(1)
})

applyServerRuntimeDefaults(server)
startEmailDispatchJob({ client: getSupabaseAdmin() })
startMembershipRenewalJob({ client: getSupabaseAdmin() })
startPaymentRecoveryJob({ client: getSupabaseAdmin() })
startDomainMaintenanceJob({ client: getSupabaseAdmin() })
startSecurityUserLifecycleJob({ prisma: getPrisma(), client: getSupabaseAdmin() })
