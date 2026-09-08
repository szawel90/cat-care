import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { getApiEnvironment } from './environment';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg(
      {
        connectionString: getApiEnvironment().databaseUrl,
        connectionTimeoutMillis: 2000,
        query_timeout: 2000,
        max: 3,
      },
      { schema: new URL(getApiEnvironment().databaseUrl).searchParams.get('schema') ?? 'public' },
    );
    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
