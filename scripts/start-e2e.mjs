import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaService } from '../apps/api/dist/prisma.service.js';

config({ quiet: true });
const schema = process.env.CAT_CARE_E2E_SCHEMA;
if (!/^test_[a-f0-9]{32}$/.test(schema ?? '')) throw new Error('Missing isolated test schema');
const admin = new PrismaService();
const children = [];
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
process.on('SIGTERM', () => void close().finally(() => process.exit()));
process.on('SIGINT', () => void close().finally(() => process.exit()));

try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const migration of (await readdir('prisma/migrations'))
    .filter((name) => /^\d/.test(name))
    .sort()) {
    const sql = await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8');
    for (const statement of sql
      .split(';')
      .filter((part) => part.trim() && !part.includes('CREATE EXTENSION'))) {
      await admin.$executeRawUnsafe(
        statement.replace(
          /"(User|AuthAccount|AuthSession|AuthVerification|AccessApproval|AuthRateLimit|EmailAction|UserRole|AccessStatus|ThemePreference)"/g,
          `"${schema}"."$1"`,
        ),
      );
    }
  }
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('schema', schema);
  process.env.DATABASE_URL = databaseUrl.toString();
  const prisma = new PrismaService();
  await prisma.accessApproval.createMany({
    data: [
      'desktop@example.test',
      'mobile@example.test',
      'appearance-desktop@example.test',
      'appearance-mobile@example.test',
    ].map((email) => ({ email })),
  });
  await prisma.$disconnect();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    API_HOST: '127.0.0.1',
    API_PORT: '3331',
    AUTH_BASE_URL: 'http://127.0.0.1:3330',
    WEB_ORIGIN: 'http://127.0.0.1:3330',
    API_INTERNAL_URL: 'http://127.0.0.1:3331',
    BETTER_AUTH_SECRET: 'synthetic-e2e-secret-not-used-for-real-accounts',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
  };
  const require = createRequire(resolve('apps/web/package.json'));
  for (const [args, cwd] of [
    [['apps/api/dist/main.js'], process.cwd()],
    [
      [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3330'],
      resolve('apps/web'),
    ],
  ]) {
    const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
    children.push(child);
    child.on('error', () => void close().finally(() => process.exit(1)));
    child.on('exit', () => {
      if (!closing) void close().finally(() => process.exit(1));
    });
  }
} catch (error) {
  console.error(
    'Could not start isolated browser test services.',
    error instanceof Error ? error.message : 'Unknown error',
  );
  await close();
  process.exitCode = 1;
}
