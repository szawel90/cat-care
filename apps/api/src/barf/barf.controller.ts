import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { IncomingHttpHeaders } from 'node:http';
import { AuthService } from '../auth/auth.service';
import {
  ArchiveBarfRecipeDto,
  BarfFavoritesDto,
  BarfRecipeDto,
  SaveBarfRecipeDto,
  UpdateBarfRecipeDto,
} from './barf.dto';
import { BarfService } from './barf.service';

@ApiTags('BARF recipes')
@Controller('account/barf')
export class BarfController {
  constructor(
    private readonly auth: AuthService,
    private readonly barf: BarfService,
  ) {}

  private async owner(headers: IncomingHttpHeaders, write = false) {
    const current = await this.auth.currentUser(headers);
    if (write && headers.origin !== this.auth.settings.baseUrl)
      throw new ForbiddenException('The request origin is not allowed.');
    return current.user.id;
  }
  @Get('recipes')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [BarfRecipeDto] })
  async list(@Headers() headers: IncomingHttpHeaders) {
    return this.barf.list(await this.owner(headers));
  }

  @Get('recipes/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BarfRecipeDto })
  async get(@Headers() headers: IncomingHttpHeaders, @Param('id', ParseUUIDPipe) id: string) {
    return this.barf.get(await this.owner(headers), id);
  }

  @Post('recipes')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: BarfRecipeDto })
  async create(@Headers() headers: IncomingHttpHeaders, @Body() data: SaveBarfRecipeDto) {
    return this.barf.create(await this.owner(headers, true), data.input);
  }

  @Post('recipes/:id')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BarfRecipeDto })
  async update(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateBarfRecipeDto,
  ) {
    return this.barf.update(await this.owner(headers, true), id, data.expectedVersion, data.input);
  }

  @Post('recipes/:id/archive')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BarfRecipeDto })
  async archive(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: ArchiveBarfRecipeDto,
  ) {
    return this.barf.update(await this.owner(headers, true), id, data.expectedVersion);
  }

  @Get('favorites')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BarfFavoritesDto })
  async favorites(@Headers() headers: IncomingHttpHeaders) {
    return this.barf.favorites(await this.owner(headers));
  }

  @Post('favorites')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: BarfFavoritesDto })
  async saveFavorites(@Headers() headers: IncomingHttpHeaders, @Body() data: BarfFavoritesDto) {
    return this.barf.saveFavorites(await this.owner(headers, true), data.ingredientIds);
  }
}
