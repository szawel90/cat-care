import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApi, createOpenApiDocument } from '../src/bootstrap';
import { PrismaService } from '../src/prisma.service';

describe('Health endpoints', () => {
  let app: NestFastifyApplication;
  const query = jest.fn();

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET = 'synthetic-secret-for-health-check-tests-only';
    process.env.DATABASE_URL = 'postgresql://test:example@localhost:5432/test';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: query })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    configureApi(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(() => query.mockReset());
  afterAll(async () => app.close());

  it('keeps liveness independent of the database', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL and pgvector are available', async () => {
    query.mockResolvedValue([{ enabled: true }]);
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('reports 503 without leaking database errors', async () => {
    query.mockRejectedValue(new Error('postgresql://private-user:private-password@private-host'));
    await request(app.getHttpServer()).get('/health/ready').expect(503, { status: 'not_ready' });
  });

  it('reports 503 when the vector migration is missing', async () => {
    query.mockResolvedValue([{ enabled: false }]);
    await request(app.getHttpServer()).get('/health/ready').expect(503, { status: 'not_ready' });
  });

  it('requires authentication for cat profiles', async () => {
    await request(app.getHttpServer()).get('/v1/cats').expect(401);
  });

  it('exports the real unprefixed health routes and failure response', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/health/ready']?.get?.responses).toHaveProperty('503');
    expect(document.paths['/health/live']?.get?.operationId).toBe('getLiveness');
    expect(document.paths).not.toHaveProperty('/v1/health/live');
  });
});
