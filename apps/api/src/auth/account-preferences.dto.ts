import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { ThemePreference, LanguagePreference } from '../generated/prisma/enums';

export class AccountPreferencesDto {
  @ApiProperty({ enum: ThemePreference }) themePreference!: ThemePreference;
  @ApiProperty({ enum: LanguagePreference }) languagePreference!: LanguagePreference;
}

export class UpdateAccountPreferencesDto {
  @ApiPropertyOptional({ enum: ThemePreference })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(ThemePreference)
  themePreference?: ThemePreference;

  @ApiPropertyOptional({ enum: LanguagePreference })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(LanguagePreference)
  languagePreference?: LanguagePreference;
}
