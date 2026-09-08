import { config } from 'dotenv';
import { resolve } from 'node:path';

export function loadEnvironment(): void {
  config({ path: resolve(__dirname, '../../../.env'), quiet: true });
}

export function getApiEnvironment() {
  const port = Number(process.env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !['postgresql:', 'postgres:'].includes(new URL(databaseUrl).protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  return {
    port,
    host: process.env.API_HOST ?? '127.0.0.1',
    databaseUrl,
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  };
}
