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
import { SecurityService } from './modules/infrastructure/security';

async function bootstrap() {
  // Create with Fastify adapter
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const configService = app.get(ConfigService);
  const securityService = app.get(SecurityService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';

  // Use Winston logger for NestJS
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Note: Global exception filter is already configured in SharedModule

  // Register Fastify helmet with enhanced security
  const helmetPlugin = await import('@fastify/helmet');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await app.register(helmetPlugin.default as any, {
    // Enhanced CSP for production security
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`], // Swagger needs inline styles
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [
          `'self'`,
          ...(isProd ? [] : [`'unsafe-inline'`, `'unsafe-eval'`]),
        ], // Stricter in prod
        objectSrc: [`'none'`],
        baseUri: [`'self'`],
        formAction: [`'self'`],
        frameAncestors: [`'none'`],
        upgradeInsecureRequests: isProd ? [] : undefined,
      },
    },
    // Additional security headers
    hsts: isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // Enhanced CORS configuration
  app.enableCors(securityService.getCorsConfiguration());

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
