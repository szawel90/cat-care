import { AccountExportDto } from './account-export.dto';
import { Controller, Get, Headers, Header, ForbiddenException } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import type { IncomingHttpHeaders } from 'node:http';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth.service';

class AccountOptionsDto {
  @ApiProperty() google!: boolean;
  @ApiProperty() facebook!: boolean;
  @ApiProperty() emailPassword!: boolean;
}

class AccountProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() emailVerified!: boolean;
}

@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('options')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountOptionsDto })
  options(): AccountOptionsDto {
    return { google: Boolean(this.auth.settings.google), facebook: false, emailPassword: true };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountProfileDto })
  async profile(@Headers() headers: IncomingHttpHeaders): Promise<AccountProfileDto> {
    const current = await this.auth.currentUser(headers);
    return {
      id: current.user.id,
      displayName: current.user.name,
      email: current.user.email,
      emailVerified: current.user.emailVerified,
    };
  }

  @Get('export')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountExportDto })
  async export(@Headers() headers: IncomingHttpHeaders): Promise<AccountExportDto> {
    const current = await this.auth.currentUser(headers);
    if (Date.now() - current.session.createdAt.getTime() > 300_000)
      throw new ForbiddenException('Sign in again before downloading your data.');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.user.id },
      select: {
        id: true,
        displayName: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        accounts: { select: { providerId: true, createdAt: true } },
      },
    });
    return { exportedAt: new Date().toISOString(), profile: user };
  }
}
