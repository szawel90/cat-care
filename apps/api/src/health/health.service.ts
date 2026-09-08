import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { HealthDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ready(): Promise<HealthDto> {
    try {
      const result = await this.prisma.$queryRaw<Array<{ enabled: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) AS enabled
      `;
      if (result[0]?.enabled !== true) throw new Error('Database extension is unavailable.');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
  }
}
