import { ApiProperty } from '@nestjs/swagger';

export class ExportedLoginMethodDto {
  @ApiProperty() providerId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class ExportedProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: [ExportedLoginMethodDto] }) accounts!: ExportedLoginMethodDto[];
}
export class AccountExportDto {
  @ApiProperty({ format: 'date-time' }) exportedAt!: string;
  @ApiProperty({ type: ExportedProfileDto }) profile!: ExportedProfileDto;
}
