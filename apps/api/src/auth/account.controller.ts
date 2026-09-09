import { CatsService } from '../cats/cats.service';
import { AccountPreferencesDto, UpdateAccountPreferencesDto } from './account-preferences.dto';
import { Body, Post, HttpCode, BadRequestException } from '@nestjs/common';
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
    private readonly cats: CatsService,
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

  @Get('preferences')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountPreferencesDto })
  async preferences(@Headers() headers: IncomingHttpHeaders): Promise<AccountPreferencesDto> {
    const current = await this.auth.currentUser(headers);
    return this.prisma.user.findUniqueOrThrow({
      where: { id: current.user.id },
      select: { themePreference: true, languagePreference: true },
    });
  }

  @Post('preferences')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AccountPreferencesDto })
  async updatePreferences(
    @Headers() headers: IncomingHttpHeaders,
    @Body() preferences: UpdateAccountPreferencesDto,
  ): Promise<AccountPreferencesDto> {
    const current = await this.auth.currentUser(headers);
    if (headers.origin !== this.auth.settings.baseUrl)
      throw new ForbiddenException('The request origin is not allowed.');
    if (preferences.themePreference === undefined && preferences.languagePreference === undefined)
      throw new BadRequestException('Provide at least one preference.');
    return this.prisma.user.update({
      where: { id: current.user.id },
      data: {
        ...(preferences.themePreference !== undefined
          ? { themePreference: preferences.themePreference }
          : {}),
        ...(preferences.languagePreference !== undefined
          ? { languagePreference: preferences.languagePreference }
          : {}),
      },
      select: { themePreference: true, languagePreference: true },
    });
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
        themePreference: true,
        languagePreference: true,
        createdAt: true,
        accounts: { select: { providerId: true, createdAt: true } },
      },
    });
    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      ...(await this.cats.exportData(current.user.id)),
    };
  }
}
