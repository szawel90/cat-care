import { ApiProperty } from '@nestjs/swagger';
import type { HealthStatus, ServiceHealth } from '@cat-care/shared';

export class HealthDto implements ServiceHealth {
  @ApiProperty({ enum: ['ok', 'not_ready'] })
  status!: HealthStatus;
}
