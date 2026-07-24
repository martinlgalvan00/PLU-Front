import { createApp } from '../server/app.js'
import { applyDeploymentEnvironmentDefaults } from '../server/lib/deploymentEnvironment.js'

applyDeploymentEnvironmentDefaults()

export default createApp()
