// src/main.ts
// Sentry must be imported and initialized before all other imports
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Initialize Sentry before anything else
const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || `api@${process.env.npm_package_version || '1.0.0'}`,
    
    integrations: [
      nodeProfilingIntegration(),
    ],
    
    // Performance monitoring - sample 10% in prod, 100% in dev
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Filter sensitive data before sending to Sentry
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-api-key'];
      }
      // Remove sensitive data from request body
      if (event.request?.data) {
        const data = event.request.data;
        if (typeof data === 'object' && data !== null) {
          const sanitized = { ...data } as Record<string, unknown>;
          delete sanitized.password;
          delete sanitized.token;
          delete sanitized.secret;
          event.request.data = sanitized;
        }
      }
      return event;
    },
    
    // Don't send errors in test environment
    enabled: process.env.NODE_ENV !== 'test',
  });
  console.log('[SENTRY] Initialized successfully');
} else if (process.env.NODE_ENV === 'production') {
  console.warn('[SENTRY] SENTRY_DSN not set - error tracking disabled');
}

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createValidationPipeConfig } from './shared';
import fastifyRawBody from 'fastify-raw-body';

async function bootstrap() {
  // Create with Fastify adapter
  const fastifyAdapter = new FastifyAdapter();
  await fastifyAdapter.getInstance().register(fastifyRawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });
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

  // Prefix all routes with /api/v1 (API versioning for future-proofing)
  // This allows us to introduce breaking changes in /api/v2 without affecting existing clients
  app.setGlobalPrefix('api/v1', {
    exclude: ['metrics', 'health', 'health/live', 'health/ready', 'privacy', 'terms'],
  });

  // Enable graceful shutdown hooks
  // This ensures:
  // - Active connections finish gracefully during deployment
  // - Database connections are properly closed
  // - Bull queues are gracefully shut down
  // - No dropped requests during Railway deployments
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0'); // Fastify needs the host specified
  console.log(`Application is running on: http://localhost:${port}/api`);
  console.log('[GRACEFUL SHUTDOWN] Shutdown hooks enabled');
}

bootstrap().catch((err) => {
  console.error('[BOOTSTRAP] Fatal error during bootstrap:', err);
  process.exit(1);
});

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Promise:', promise, 'Reason:', reason);
  Sentry.captureException(reason);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  Sentry.captureException(error);
  // Give Sentry time to send the event before exiting
  setTimeout(() => {
    process.exit(1);
  }, 2000);
});
