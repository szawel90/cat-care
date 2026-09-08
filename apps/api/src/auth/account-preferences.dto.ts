import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ThemePreference } from '../generated/prisma/enums';

export class AccountPreferencesDto {
  @ApiProperty({ enum: ThemePreference, default: ThemePreference.system })
  @IsEnum(ThemePreference)
  themePreference!: ThemePreference;
}
