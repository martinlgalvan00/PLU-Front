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
  test: {
    projects: [{
      extends: true,
      // Sin esto, los .jsx de src/ que renderiza un test se transforman con el
      // runtime clásico y fallan con "React is not defined".
      esbuild: {
        jsx: 'automatic'
      },
      test: {
        name: 'default',
        environment: 'jsdom',
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