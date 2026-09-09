import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyReply } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { CatsService } from './cats.service';
import {
  AnswerPortraitDto,
  CatResponseDto,
  CatVersionDto,
  CreateCatDto,
  MoveCatDto,
  PortraitResponseDto,
  StartPortraitDto,
  UpdateCatDto,
} from './cats.dto';

@ApiTags('Cats')
@ApiResponse({ status: 401, description: 'Sign-in required.' })
@ApiResponse({ status: 403, description: 'Access revoked or invalid request origin.' })
@ApiResponse({ status: 404, description: 'The owned resource was not found.' })
@ApiResponse({ status: 409, description: 'The record changed; reload before saving.' })
@Controller('cats')
export class CatsController {
  constructor(
    private readonly auth: AuthService,
    private readonly cats: CatsService,
  ) {}
  private async owner(headers: IncomingHttpHeaders, write = false) {
    const current = await this.auth.currentUser(headers);
    if (write && headers.origin !== this.auth.settings.baseUrl)
      throw new ForbiddenException('The request origin is not allowed.');
    return current.user.id;
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: [CatResponseDto] })
  async list(
    @Headers() headers: IncomingHttpHeaders,
    @Query('archived', new DefaultValuePipe(false), ParseBoolPipe) archived: boolean,
  ) {
    return this.cats.list(await this.owner(headers), archived);
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: CatResponseDto })
  async create(@Headers() headers: IncomingHttpHeaders, @Body() data: CreateCatDto) {
    return this.cats.create(await this.owner(headers, true), data);
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CatResponseDto })
  async get(@Headers() headers: IncomingHttpHeaders, @Param('id', ParseUUIDPipe) id: string) {
    return this.cats.get(await this.owner(headers), id);
  }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CatResponseDto })
  async update(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateCatDto,
  ) {
    return this.cats.update(await this.owner(headers, true), id, data);
  }
  @Post(':id/household')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CatResponseDto })
  async move(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: MoveCatDto,
  ) {
    return this.cats.move(await this.owner(headers, true), id, data);
  }
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Archive the cat while preserving its full history.' })
  async remove(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CatVersionDto,
  ) {
    await this.cats.archive(await this.owner(headers, true), id, data.expectedVersion);
  }
  @Post(':id/restore')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: CatResponseDto })
  async restore(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CatVersionDto,
  ) {
    return this.cats.archive(await this.owner(headers, true), id, data.expectedVersion, false);
  }
  @Get(':id/history')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  async profileHistory(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cats.profileHistory(await this.owner(headers), id);
  }
  @Get(':id/photo')
  @ApiProduces('image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async photo(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() reply: FastifyReply,
    @Query('version', new DefaultValuePipe(0), ParseIntPipe) version: number,
  ) {
    const photo = await this.cats.photo(await this.owner(headers), id, version || undefined);
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .type('image/webp')
      .send(photo);
  }
  @Get(':id/portrait')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: { allOf: [{ $ref: getSchemaPath(PortraitResponseDto) }], nullable: true },
    description: 'Latest observation, or null before the first interview.',
  })
  async portrait(@Headers() headers: IncomingHttpHeaders, @Param('id', ParseUUIDPipe) id: string) {
    return this.cats.portrait(await this.owner(headers), id);
  }
  @Post(':id/portrait')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Start a new observation period without copying behavioral answers.' })
  @ApiCreatedResponse({ type: PortraitResponseDto })
  async start(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: StartPortraitDto,
  ) {
    return this.cats.startPortrait(await this.owner(headers, true), id, data);
  }
  @Patch(':id/portrait')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortraitResponseDto })
  async answer(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: AnswerPortraitDto,
  ) {
    return this.cats.answer(await this.owner(headers, true), id, data);
  }
  @Get(':id/portrait/revisions')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({
    schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
  })
  async history(@Headers() headers: IncomingHttpHeaders, @Param('id', ParseUUIDPipe) id: string) {
    return this.cats.history(await this.owner(headers), id);
  }
  @Get(':id/portrait/revisions/:revision')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: PortraitResponseDto })
  async revision(
    @Headers() headers: IncomingHttpHeaders,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ) {
    return this.cats.portrait(await this.owner(headers), id, revision);
  }
}
