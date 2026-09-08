import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthDto } from './health.dto';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ operationId: 'getLiveness' })
  @ApiOkResponse({ type: HealthDto })
  live(): HealthDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ operationId: 'getReadiness' })
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: HealthDto })
  ready(): Promise<HealthDto> {
    return this.health.ready();
  }
}
