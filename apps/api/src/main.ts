// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { createValidationPipeConfig } from './shared';

async function bootstrap() {
  // Create with Fastify adapter
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const configService = app.get(ConfigService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';

  // Use Winston logger for NestJS
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Note: Global exception filter is already configured in SharedModule

  // Register Fastify helmet
  const helmetPlugin = await import('@fastify/helmet');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await app.register(helmetPlugin.default as any, {
    // Configure settings for Swagger UI compatibility
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
      },
    },
  });

  // Security middleware
  app.enableCors();

  // Enhanced validation with security settings
  app.useGlobalPipes(createValidationPipeConfig(isProd));

  // API docs
  const config = new DocumentBuilder()
    .setTitle('Crave Search API')
    .setDescription('Food discovery API powered by community knowledge')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Prefix all routes with /api
  app.setGlobalPrefix('api');

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0'); // Fastify needs the host specified
  console.log(`Application is running on: http://localhost:${port}/api`);
}
void bootstrap();
