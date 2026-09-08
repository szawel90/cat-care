import {
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

@Injectable()
class WorkerLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private heartbeat?: ReturnType<typeof setInterval>;

  onApplicationBootstrap() {
    this.logger.log('Worker started. No job handlers are registered.');
    this.heartbeat = setInterval(() => {
      this.logger.debug('Worker is idle; job processing has not been implemented.');
    }, 60_000);
  }

  onApplicationShutdown() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.logger.log('Worker stopped.');
  }
}

@Module({ providers: [WorkerLifecycle] })
export class WorkerModule {}
