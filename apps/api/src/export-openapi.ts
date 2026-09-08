import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApi, createOpenApiDocument } from './bootstrap';

async function main() {
  const app = await createApi(false);
  try {
    const target = resolve(__dirname, '../../../packages/api-client/openapi.json');
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, JSON.stringify(createOpenApiDocument(app), null, 2) + '\n');
  } finally {
    await app.close();
  }
}

void main().catch(() => {
  console.error('OpenAPI generation failed.');
  process.exitCode = 1;
});
