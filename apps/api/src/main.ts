import { SwaggerModule } from '@nestjs/swagger';
import { createApi, createOpenApiDocument } from './bootstrap';
import { getApiEnvironment } from './environment';

async function main() {
  const app = await createApi();
  app.enableShutdownHooks();
  SwaggerModule.setup('docs', app, createOpenApiDocument(app), {
    jsonDocumentUrl: '/openapi.json',
  });
  const { port, host } = getApiEnvironment();
  await app.listen(port, host);
}

void main().catch(() => {
  console.error('The API could not start. Check the local environment configuration.');
  process.exitCode = 1;
});
