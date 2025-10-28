// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createValidationPipeConfig } from './shared';

async function bootstrap() {
  // Create with Fastify adapter
  const fastifyAdapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const configService = app.get(ConfigService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';

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

  fastifyAdapter.getInstance().addHook('preHandler', async (req, reply) => {
    if (req.raw.url?.startsWith('/metrics')) {
      const headers = reply.getHeaders();
      if ('content-security-policy' in headers) {
        reply.raw.removeHeader('content-security-policy');
      }
      if ('x-content-type-options' in headers) {
        reply.raw.removeHeader('x-content-type-options');
      }
      if ('x-frame-options' in headers) {
        reply.raw.removeHeader('x-frame-options');
      }
    }
  });

  // Enhanced CORS configuration
  app.enableCors({
    origin: isProd ? false : true, // Disable CORS in prod, allow all in dev
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Correlation-ID',
    ],
    credentials: false,
    maxAge: 86400,
  });

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
  app.setGlobalPrefix('api', {
    exclude: ['metrics'],
  });

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0'); // Fastify needs the host specified
  console.log(`Application is running on: http://localhost:${port}/api`);
}
void bootstrap();
