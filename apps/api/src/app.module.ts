import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [HealthController],
  providers: [PrismaService, HealthService],
})
export class AppModule {}
