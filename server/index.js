import { createApp } from './app.js'
import { applyServerRuntimeDefaults } from './lib/runtime.js'
import { getSupabaseAdmin } from './lib/supabaseAdmin.js'
import { startMembershipRenewalJob } from './jobs/membershipRenewalJob.js'

const app = createApp()
const port = Number(process.env.PORT) || 3001

const server = app.listen(port, () => {
  console.info(`API PLU ARG en http://localhost:${port}`)
})

applyServerRuntimeDefaults(server)
startMembershipRenewalJob({ client: getSupabaseAdmin() })
