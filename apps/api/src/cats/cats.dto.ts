import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

export class CreateCatDto {
  @ApiProperty({ maxLength: 60 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
  @ApiPropertyOptional({ maxLength: 750000 })
  @IsOptional()
  @IsString()
  @MaxLength(750000)
  photoDataUrl?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() livesWithCatId?: string;
}
export class HouseholdUpdateDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ type: Object, additionalProperties: true })
  @IsOptional()
  @IsObject()
  facts?: Record<string, unknown>;
  @ApiPropertyOptional({ type: Object, additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  environment?: Record<string, string>;
}
export class UpdateCatDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional({ maxLength: 60 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;
  @ApiPropertyOptional({ nullable: true, type: String, maxLength: 750000 })
  @IsOptional()
  @IsString()
  @MaxLength(750000)
  photoDataUrl?: string | null;
  @ApiPropertyOptional({ type: Object, additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;
  @ApiPropertyOptional({ type: 'array', items: { type: 'object', additionalProperties: true } })
  @IsOptional()
  @IsArray()
  events?: unknown[];
  @ApiPropertyOptional({ type: HouseholdUpdateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HouseholdUpdateDto)
  household?: HouseholdUpdateDto;
}
export class CatVersionDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class MoveCatDto extends CatVersionDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'A cat in the destination home; null creates a separate home.',
  })
  @IsOptional()
  @IsUUID()
  livesWithCatId?: string | null;
}
export class StartPortraitDto {
  @ApiProperty() @IsInt() @Min(0) expectedRevision!: number;
  @ApiProperty({ format: 'date' }) @IsDateString() periodStart!: string;
  @ApiProperty({ format: 'date' }) @IsDateString() periodEnd!: string;
}
export class AnswerPortraitDto {
  @ApiProperty() @IsInt() @Min(1) expectedRevision!: number;
  @ApiProperty() @IsString() @MaxLength(30) questionId!: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] })
  @IsOptional()
  answer!: unknown;
}
export class CatResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() version!: number;
  @ApiProperty() photoVersion!: number;
  @ApiProperty() hasPhoto!: boolean;
  @ApiProperty({ type: Object, additionalProperties: { type: 'string' } }) attributes!: object;
  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  events!: unknown[];
  @ApiProperty({ type: Object, additionalProperties: true }) household!: object;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) archivedAt!: string | null;
  @ApiProperty({
    enum: ['not_started', 'awaiting_observation', 'incomplete', 'preliminary_portrait'],
  })
  portraitStatus!: string;
}
export class PortraitResponseDto {
  @ApiProperty({ format: 'uuid' }) catId!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @ApiProperty({ format: 'date-time' }) recordedAt!: string;
  @ApiProperty({ format: 'date' }) periodStart!: string;
  @ApiProperty({ format: 'date' }) periodEnd!: string;
  @ApiProperty({ type: Object, additionalProperties: true }) answers!: object;
  @ApiProperty({ type: Object, additionalProperties: { type: 'string' } }) followups!: object;
  @ApiProperty({ type: Object, additionalProperties: true }) result!: object;
  @ApiProperty({ type: Object, additionalProperties: true }) householdSnapshot!: object;
  @ApiProperty({ type: [String] }) prefilledQuestions!: string[];
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) supersededAt!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) contextChangedAt!:
    string | null;
}
