import request from 'supertest';
import { type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApi } from '../src/bootstrap';
import { PrismaService } from '../src/prisma.service';

describe('PostgreSQL integration', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApi(false);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => app.close());

  it('accepts readiness against the migrated database', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('executes pgvector operations through Prisma', async () => {
    const result = await app.get(PrismaService).$queryRaw<Array<{ distance: number }>>`
      SELECT '[1,0,0]'::vector <-> '[0,1,0]'::vector AS distance
    `;
    expect(result[0]?.distance).toBeCloseTo(Math.SQRT2, 6);
  });
});
