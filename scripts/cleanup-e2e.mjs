import { config } from 'dotenv';
import { PrismaService } from '../apps/api/dist/prisma.service.js';

export default async function cleanup(fullConfig) {
  const schema = fullConfig.metadata.testDatabaseSchema;
  if (!/^test_[a-f0-9]{32}$/.test(schema ?? '')) throw new Error('Unsafe test schema');
  config({ quiet: true });
  const admin = new PrismaService();
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
}
