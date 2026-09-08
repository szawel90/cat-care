import { createDevelopmentMailSender } from './auth/mail-sender';
import { getAuthSettings } from './auth/auth-settings';
import { AccountController } from './auth/account.controller';
import { AuthService } from './auth/auth.service';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [HealthController, AccountController],
  providers: [
    PrismaService,
    HealthService,
    AuthService,
    {
      provide: 'ACCOUNT_MAIL_SENDER',
      useFactory: () => createDevelopmentMailSender(getAuthSettings().mailpitUrl),
    },
  ],
})
export class AppModule {}
