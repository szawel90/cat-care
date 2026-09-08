import 'reflect-metadata';
import { RequestMethod, ValidationPipe, type LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { getApiEnvironment, loadEnvironment } from './environment';

export function configureApi(app: NestFastifyApplication) {
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: getApiEnvironment().webOrigin });
}

export function createOpenApiDocument(app: NestFastifyApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Cat Care API')
      .setDescription('Cat Care service contract.')
      .setVersion('0.1.0')
      .build(),
  );
}

export async function createApi(logger?: false | LoggerService): Promise<NestFastifyApplication> {
  loadEnvironment();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger,
  });
  configureApi(app);
  return app;
}
