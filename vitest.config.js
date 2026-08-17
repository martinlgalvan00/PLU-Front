import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  // Prefijo alineado con vite.config: PAID_CHECKOUT_* llega a import.meta.env en tests.
  envPrefix: ['VITE_', 'PAYMENTS_', 'APP_', 'PAID_'],
  test: {
    // En unit tests el checkout de pago queda abierto salvo que el caso pase
    // un env explícito (APP_PRODUCTION + PAID_CHECKOUT_*). Evita que el
    // APP_PRODUCTION=true del .env local cierre todos los flujos de cobro.
    env: {
      PAID_CHECKOUT_ENABLED: 'true',
    },
    projects: [{
      extends: true,
      // Sin esto, los .jsx de src/ que renderiza un test se transforman con el
      // runtime clásico y fallan con "React is not defined".
      test: {
        name: 'default',
        environment: 'jsdom',
        setupFiles: ['tests/setup/jsdomEnv.js'],
        // Los tests de API montan la app y hacen bcrypt de coste 12 (~250 ms
        // por hash, varios por test). Con el default de 5 s pasaban solos pero
        // caían por timeout al competir con el proyecto `storybook`, que corre
        // en paralelo sobre un Chromium headless. El límite acompaña el coste
        // real del hashing en vez de depender de cuán cargada esté la máquina.
        testTimeout: 20000,
        include: ['tests/**/*.test.{js,jsx}', 'src/**/*.test.{js,jsx}'],
        exclude: ['tests/integration/**']
      }
    }, {
      extends: true,
      test: {
        name: 'integration',
        environment: 'node',
        // Estas pruebas hablan con Supabase por red y varias registran atletas
        // con bcrypt. Cinco segundos vuelve flaky una validacion correcta al
        // correr toda la suite en paralelo; el limite acompana el costo real.
        testTimeout: 20000,
        include: ['tests/integration/**/*.test.js'],
        setupFiles: ['tests/integration/setup.js']
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          // Vitest 4 movio los providers de browser a paquetes propios: `provider`
          // ya no acepta el string 'playwright', sino el factory de
          // @vitest/browser-playwright.
          provider: playwright(),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
});
