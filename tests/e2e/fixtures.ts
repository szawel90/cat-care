import { test as base, expect } from '@playwright/test';
import { config } from 'dotenv';
import { PrismaService } from '../../apps/api/dist/prisma.service.js';

export const test = base.extend<{ isolatedRateLimit: void }>({
  isolatedRateLimit: [
    async ({ baseURL }, use, info) => {
      const schema = info.config.metadata.testDatabaseSchema;
      if (baseURL !== 'http://127.0.0.1:3330' || !/^test_[a-f0-9]{32}$/.test(schema ?? ''))
        throw new Error('Rate-limit isolation requires the dedicated browser test schema.');
      config({ quiet: true });
      const database = new PrismaService();
      try {
        // Browser scenarios share loopback IP, but must not consume each other's limits.
        // Preserve real limits within each scenario and never touch the public schema.
        await database.$executeRawUnsafe(`DELETE FROM "${schema}"."AuthRateLimit"`);
      } finally {
        await database.$disconnect();
      }
      await use(undefined);
    },
    { auto: true },
  ],
});
export { expect };
