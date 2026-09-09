import { BarfController } from './barf/barf.controller';
import { BarfService } from './barf/barf.service';
import { CatsController } from './cats/cats.controller';
import { CatsService } from './cats/cats.service';
import { createDevelopmentMailSender } from './auth/mail-sender';
import { getAuthSettings } from './auth/auth-settings';
import { AccountController } from './auth/account.controller';
import { AuthService } from './auth/auth.service';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { PrismaService } from './prisma.service';

@Module({
  controllers: [HealthController, AccountController, CatsController, BarfController],
  providers: [
    PrismaService,
    CatsService,
    BarfService,
    HealthService,
    AuthService,
    {
      provide: 'ACCOUNT_MAIL_SENDER',
      useFactory: () => createDevelopmentMailSender(getAuthSettings().mailpitUrl),
    },
  ],
})
export class AppModule {}
