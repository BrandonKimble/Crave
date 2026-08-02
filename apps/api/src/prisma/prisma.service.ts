import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDeployedEnv, normalizeAppEnv } from '../shared/config/app-env';
import { PrismaClient, Prisma } from '@prisma/client';
import { DatabaseConfig } from '../config/database-config.interface';
import { DatabaseValidationService } from '../config/database-validation.service';
import { LoggerService } from '../shared';

/**
 * Pin every pooled connection's session TimeZone to UTC.
 *
 * NO LONGER LOAD-BEARING FOR CORRECTNESS (2026-08-02). This was introduced to
 * neutralise a real bug: 162 columns were `timestamp WITHOUT time zone` while
 * Prisma binds a JS Date as `timestamptz`, so every hand-written comparison
 * coerced through the session timezone and meant something different depending
 * on where the server thought it was.
 *
 * Those columns are `timestamptz` now, which fixes the cause rather than
 * masking it — a timestamptz comparison is timezone-independent by
 * construction. The pin stays for the things that genuinely still read the
 * session zone: `now()::date`, `CURRENT_DATE`, `date_trunc` on a timestamptz,
 * and `signals.occurred_at`, the one naive column left (it is a partition key,
 * which Postgres will not let us alter). It also keeps dev matching prod
 * instead of inheriting whatever a laptop is set to.
 */
export function pinSessionTimeZoneUtc(url: string): string {
  if (!url) return url;
  // Already pinned (or explicitly overridden) — never fight an explicit choice.
  if (/[?&]options=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}options=-c%20timezone%3DUTC`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private logger!: LoggerService;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly validationService: DatabaseValidationService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {
    const dbConfig = configService?.get<DatabaseConfig>('database');

    const logConfig: Prisma.LogDefinition[] = dbConfig?.performance?.logging
      ?.enabled
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'info' },
        ]
      : [{ emit: 'event', level: 'error' }];

    super({
      datasources: {
        db: {
          url: pinSessionTimeZoneUtc(
            dbConfig?.url || process.env.DATABASE_URL || '',
          ),
        },
      },
      log: logConfig,
    });
  }

  async onModuleInit() {
    this.logger = this.loggerService.setContext('PrismaService');
    this.assertNotProdDatabaseFromDev();
    this.logPrismaClientMetadata();

    if (this.validationService) {
      this.validationService.validateDatabaseConfiguration(this.configService);
      this.validationService.validateEnvironmentConsistency(this.configService);
    }

    await this.$connect();

    await this.logTableProbe();
    await this.assertClientSchemaCoherence();

    this.logger.info('Database connection established');
  }

  /**
   * Schema-drift tripwire: a Prisma client generated from a stale schema
   * SELECTs columns migrations have dropped, poisoning every request that
   * touches the model (2026-07-09 incident: every AUTHED request 500'd at
   * the auth guard's user sync while anonymous traffic looked healthy).
   * Querying the hot models with no `select` exercises the client's full
   * column list — drift fails THE BOOT, loudly, instead of runtime.
   */
  private async assertClientSchemaCoherence(): Promise<void> {
    try {
      await this.user.findFirst();
      await this.accessGrant.findFirst();
      await this.subscription.findFirst();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'FATAL: Prisma client does not match the database schema — ' +
          'run `npx prisma generate` and rebuild before starting',
        { operation: 'prisma_schema_coherence', error: { message } },
      );
      throw new Error(`Prisma client/schema drift detected: ${message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.info('Database connections closed gracefully');
  }

  /**
   * THE LAW, ENFORCED (env-split audit 2026-08-02): CLAUDE.md has said
   * "NEVER point a local api at the prod DB" since the Railway cutover, but
   * it was documentation only — nothing checked. A laptop process holding a
   * Railway proxy URL writes to production with full superuser rights, and
   * the shared prod/staging password meant no operator could tell the two
   * apart by inspection.
   *
   * A non-production APP_ENV may not open a Railway-hosted database. Set
   * ALLOW_REMOTE_DB=1 for the deliberate exception (a read-only audit
   * script), which is then an explicit act rather than an accident.
   */
  private assertNotProdDatabaseFromDev(): void {
    const appEnv = normalizeAppEnv(
      process.env.APP_ENV || process.env.CRAVE_ENV,
    );
    // DEPLOYED, not PROD (2026-08-02). This asked "am I production?" to decide
    // whether a hosted database was legitimate — two different questions
    // through one boolean. Staging runs on Railway against its own Railway
    // database, so under the old test it had to declare itself `prod` to boot
    // at all, which is how staging ended up indistinguishable from production
    // everywhere else. A hosted DB is legitimate for any DEPLOYED runtime.
    if (isDeployedEnv(appEnv)) {
      // SELF-RETIRING BRIDGE (2026-08-02). ALLOW_REMOTE_DB=1 was set on
      // staging so it would boot under BOTH the old prod-only guard and this
      // one while APP_ENV moved from `prod` to `staging`. Reaching this line
      // proves the new guard is live, so the override is now dead weight that
      // silently disables the never-point-local-at-prod protection. Say so
      // every boot until someone removes it — a reminder that appears exactly
      // when it becomes true beats one written in a document.
      if (process.env.ALLOW_REMOTE_DB === '1') {
        this.logger?.warn(
          'ALLOW_REMOTE_DB=1 is set on a DEPLOYED environment and is no ' +
            'longer needed — this build allows a hosted database for any ' +
            'deployed runtime. Remove the override: ' +
            `railway variables -s <svc> --environment ${appEnv} --unset ALLOW_REMOTE_DB`,
          { operation: 'allow_remote_db_bridge_obsolete', appEnv },
        );
      }
      return;
    }
    if (process.env.ALLOW_REMOTE_DB === '1') {
      return;
    }
    const url = process.env.DATABASE_URL || '';
    const remoteHost = /@[^/]*(rlwy\.net|railway\.internal|railway\.app)/i.test(
      url,
    );
    if (remoteHost) {
      throw new Error(
        'REFUSED: a non-deployed process (APP_ENV=' +
          (appEnv || 'unset') +
          ') is pointed at a Railway-hosted database. This is the documented ' +
          'never-point-local-at-prod law. Use the local DB, or set ' +
          'ALLOW_REMOTE_DB=1 to override deliberately.',
      );
    }
  }

  private logPrismaClientMetadata(): void {
    const entityModel = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'Entity',
    );
    this.logger.info('Prisma client metadata', {
      operation: 'prisma_client_metadata',
      entityTable: entityModel?.dbName ?? 'unknown',
      processCwd: process.cwd(),
      nodeVersion: process.version,
    });
  }

  private async logTableProbe(): Promise<void> {
    try {
      const rows = await this.$queryRaw<
        Array<{
          db: string;
          schema: string;
          entities: string | null;
          core_entities: string | null;
        }>
      >`
        SELECT
          current_database() AS db,
          current_schema() AS schema,
          to_regclass('public.entities')::text AS entities,
          to_regclass('public.core_entities')::text AS core_entities
      `;
      const row = rows[0];
      this.logger.info('Database table probe', {
        operation: 'prisma_table_probe',
        db: row?.db,
        schema: row?.schema,
        entities: row?.entities,
        coreEntities: row?.core_entities,
      });
    } catch (error) {
      this.logger.warn('Database table probe failed', {
        operation: 'prisma_table_probe',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
