import { mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  staticDirs: ['../public'],
  framework: '@storybook/nextjs-vite',
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  core: { disableTelemetry: true },
  viteFinal: async (config) =>
    mergeConfig(config, {
      resolve: {
        alias: {
          '@cat-care/shared': fileURLToPath(
            new URL('../../../packages/shared/src/index.ts', import.meta.url),
          ),
        },
      },
    }),
};

export default config;
