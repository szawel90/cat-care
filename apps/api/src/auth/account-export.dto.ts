import { BarfRecipeDto } from '../barf/barf.dto';
import { ApiProperty } from '@nestjs/swagger';
import { ThemePreference, LanguagePreference } from '../generated/prisma/enums';

export class ExportedLoginMethodDto {
  @ApiProperty() providerId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class ExportedProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ enum: ThemePreference }) themePreference!: ThemePreference;
  @ApiProperty({ enum: LanguagePreference }) languagePreference!: LanguagePreference;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: [ExportedLoginMethodDto] }) accounts!: ExportedLoginMethodDto[];
}
export class AccountExportDto {
  @ApiProperty({ type: [BarfRecipeDto] }) barfRecipes!: BarfRecipeDto[];
  @ApiProperty({ type: [String] }) barfFavorites!: string[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Owned cats, archived cats, photo versions and immutable portrait revisions.',
  })
  cats!: unknown[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Owned households and their immutable versions.',
  })
  households!: unknown[];
  @ApiProperty({ format: 'date-time' }) exportedAt!: string;
  @ApiProperty({ type: ExportedProfileDto }) profile!: ExportedProfileDto;
}
