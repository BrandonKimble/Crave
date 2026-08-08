// src/main.ts
// Sentry must be imported and initialized before all other imports
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

// Initialize Sentry before anything else
// Load env vars early because ConfigModule loads `.env` later in the Nest lifecycle.
dotenvConfig({ path: join(process.cwd(), '.env') });
dotenvConfig({ path: join(__dirname, '..', '.env') });

// F404/F406 (2026-08-04): boot-time decisions used to key on NODE_ENV, which
// cannot express staging (staging runs NODE_ENV=production so it doesn't
// break `yarn install --production`/Nest/jest). AppEnv is the deployment
// fact ("whose money and whose users"); resolve it once, here, before
// anything else — this file cannot use ConfigService because Sentry must
// init before the Nest module graph exists.
import {
  resolveAppEnv,
  isProdEnv,
  isDeployedEnv,
} from './shared/config/app-env';
const appEnv = resolveAppEnv();

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  const parseSampleRate = (value: string | undefined, fallback: number) => {
    if (!value) return fallback;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Full sampling off-prod (dev AND staging); 10% in prod (cost). Staging
  // used to inherit prod's 10% because this compared NODE_ENV === 'production'
  // (true for staging too) — the exact indistinguishability app-env.ts exists
  // to end.
  const defaultSampleRate = isProdEnv(appEnv) ? 0.1 : 1.0;
  const tracesSampleRate = parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
    defaultSampleRate,
  );
  const profilesSampleRate = parseSampleRate(
    process.env.SENTRY_PROFILES_SAMPLE_RATE,
    defaultSampleRate,
  );

  Sentry.init({
    dsn: sentryDsn,
    // Was `SENTRY_ENVIRONMENT || NODE_ENV` — staging (NODE_ENV=production)
    // reported into Sentry as `production` unless someone remembered to set
    // SENTRY_ENVIRONMENT by hand. appEnv is the correct default; the env var
    // still wins when explicitly set.
    environment: process.env.SENTRY_ENVIRONMENT || appEnv,
    release:
      process.env.SENTRY_RELEASE ||
      `api@${process.env.npm_package_version || '1.0.0'}`,

    integrations: [nodeProfilingIntegration()],

    // Performance monitoring - configured via env, with sane defaults
    tracesSampleRate,
    profilesSampleRate,

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
        const requestData = event.request.data as unknown;
        if (typeof requestData === 'object' && requestData !== null) {
          const sanitized = { ...(requestData as Record<string, unknown>) };
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
} else if (isDeployedEnv(appEnv)) {
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
import { RequestLocaleInterceptor } from './shared/locale';
import fastifyRawBody from 'fastify-raw-body';

async function bootstrap() {
  // Create with Fastify adapter. trustProxy: 1 = trust EXACTLY ONE proxy hop
  // (Railway's LB appends the real client IP as the LAST X-Forwarded-For
  // entry). `true` would trust the whole client-writable XFF chain, letting
  // an attacker set request.ip at will — both spoof-evading the vote-audit
  // IP capture AND framing honest subnets in the sybil report. Needed for
  // the IP→metro startup fallback when a user denies location permission.
  const fastifyAdapter = new FastifyAdapter({ trustProxy: 1 });
  await fastifyAdapter.getInstance().register(fastifyRawBody, {
    field: 'rawBody',
    // Exactly the webhook routes whose providers sign the RAW bytes —
    // global:false with no opted-in routes left rawBody undefined
    // everywhere (latent Stripe-signature bug, found by the photo E2E).
    global: false,
    encoding: 'utf8',
    runFirst: true,
    routes: [
      '/api/v1/billing/webhooks/stripe',
      '/api/v1/photos/webhooks/cloudinary',
    ],
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );

  const configService = app.get(ConfigService);
  // F404: was `NODE_ENV === 'production'` — staging (a DEPLOYED env, no
  // Swagger, no leaked error detail) also runs NODE_ENV=production, so it
  // silently got prod's exact posture on every one of these decisions.
  // isDeployedEnv is correct here: CSP/HSTS/CORS/validation/Swagger are all
  // "is this running on real infrastructure", not "is this prod money/users".
  const isProd = isDeployedEnv(appEnv);

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

  // CORS. In prod the answer was a flat `false` — correct while the only
  // client was the native app, which is not a browser and never sends an
  // Origin. The web checkout rail (apps/site, /premium) IS a browser, and a
  // flat `false` makes its POST /billing/checkout-session unreachable: the
  // preflight fails and the payer never reaches Stripe.
  //
  // The fix is an ALLOWLIST, not a loosening. WEB_ORIGIN is a comma-separated
  // list of exact origins (e.g. https://craveapp.ai). UNSET means prod stays
  // exactly as strict as it is today — a config-less deploy changes nothing,
  // so this cannot quietly widen the surface. `credentials` stays false: the
  // site authenticates with a Clerk bearer header, never a cookie.
  const webOrigins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  app.enableCors({
    origin: isProd ? (webOrigins.length > 0 ? webOrigins : false) : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Correlation-ID',
      // M1: the web rail negotiates locale like every other client. Omitting
      // it here would make the browser drop the header before we ever see it.
      'Accept-Language',
    ],
    credentials: false,
    maxAge: 86400,
  });

  // Enhanced validation with security settings
  app.useGlobalPipes(createValidationPipeConfig(isProd));

  // M1 — negotiate the request locale after the guards have attached the user
  // (so a profile override is visible) and echo it as Content-Language.
  app.useGlobalInterceptors(new RequestLocaleInterceptor());

  // API docs
  const config = new DocumentBuilder()
    .setTitle('Crave Search API')
    .setDescription('Food discovery API powered by community knowledge')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  // SECURITY (final-final red team LOW 8): the full route map + DTO shapes
  // were public in prod — reconnaissance for free. Dev/staging only.
  if (!isProd) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Prefix all routes with /api/v1 (API versioning for future-proofing)
  // This allows us to introduce breaking changes in /api/v2 without affecting existing clients
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready', 'privacy', 'terms'],
  });

  // Enable graceful shutdown hooks
  // This ensures:
  // - Active connections finish gracefully during deployment
  // - Database connections are properly closed
  // - Bull queues are gracefully shut down
  // - No dropped requests during Railway deployments
  app.enableShutdownHooks();

  const port = configService.get<number>('PORT') || 3000;
  // Bind dual-stack (IPv6 + IPv4-mapped) so both `127.0.0.1` and `::1` reach the
  // server — the iOS simulator resolves `localhost` to IPv6 `::1`, which an
  // IPv4-only `0.0.0.0` bind would miss (manifesting as "Network Error" in the app).
  await app.listen(port, '::');
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
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
