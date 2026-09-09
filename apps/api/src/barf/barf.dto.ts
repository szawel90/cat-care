import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { BarfInput, BarfRecipe } from '@cat-care/shared';

export class BarfItemDto {
  @ApiProperty() @IsString() @MaxLength(40) ingredientId!: string;
  @ApiProperty({ minimum: 0.001, maximum: 100000 })
  @IsNumber()
  @Min(0.001)
  @Max(100000)
  quantity!: number;
}
export class BarfInputDto implements BarfInput {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) title!: string;
  @ApiProperty() @IsString() @MaxLength(80) catName!: string;
  @ApiProperty({ minimum: 0.1, maximum: 30 }) @IsNumber() @Min(0.1) @Max(30) catWeightKg!: number;
  @ApiProperty() @IsString() @MaxLength(80) catalogVersion!: string;
  @ApiProperty() @IsString() @MaxLength(80) engineVersion!: string;
  @ApiProperty({ type: [BarfItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BarfItemDto)
  items!: BarfItemDto[];
}
export class SaveBarfRecipeDto {
  @ApiProperty({ type: BarfInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => BarfInputDto)
  input!: BarfInputDto;
}
export class UpdateBarfRecipeDto extends SaveBarfRecipeDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class ArchiveBarfRecipeDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}
export class BarfFavoritesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(262)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  ingredientIds!: string[];
}
export class BarfRecipeDto implements BarfRecipe {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() currentVersion!: number;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' }) archivedAt!:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Immutable, versioned inputs, source ingredient snapshots and computed results. See the shared BarfRecipeRevision type.',
  })
  revisions!: BarfRecipe['revisions'];
}
