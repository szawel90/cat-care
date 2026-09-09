import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)) })],
  test: {
    name: 'components',
    testTimeout: 20000,
    fileParallelism: false,
    maxWorkers: 1,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ contextOptions: { reducedMotion: 'reduce' } }),
      instances: [
        { browser: 'chromium', name: 'desktop', viewport: { width: 1366, height: 900 } },
        { browser: 'chromium', name: 'mobile', viewport: { width: 390, height: 844 } },
      ],
    },
  },
});
