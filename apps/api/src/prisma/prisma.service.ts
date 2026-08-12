import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDeployedEnv, resolveAppEnv } from '../shared/config/app-env';
import { PrismaClient, Prisma } from '@prisma/client';
import { DatabaseConfig } from '../config/database-config.interface';
import { DatabaseValidationService } from '../config/database-validation.service';
import { LoggerService } from '../shared';

export { pinSessionTimeZoneUtc, pinConnectionLimit } from './datasource-url';
import { pinSessionTimeZoneUtc, pinConnectionLimit } from './datasource-url';

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

    // Dev query logging is a toolchain fact (is this a local dev run), not a
    // config knob — the deleted performance.logging block only ever wrapped
    // this same NODE_ENV check in three layers of unread structure.
    const logConfig: Prisma.LogDefinition[] =
      process.env.NODE_ENV === 'development'
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
          url: pinConnectionLimit(
            pinSessionTimeZoneUtc(
              dbConfig?.url || process.env.DATABASE_URL || '',
            ),
            dbConfig?.connectionPool?.max ?? 10,
          ),
        },
      },
      log: logConfig,
    });
  }

  async onModuleInit() {
    this.logger = this.loggerService.setContext('PrismaService');
    this.logPrismaClientMetadata();

    if (this.validationService) {
      this.validationService.validateDatabaseConfiguration(this.configService);
      this.validationService.validateEnvironmentConsistency(this.configService);
    }

    await this.$connect();

    // AFTER connect: the escape hatch is now a privilege PROBE, which needs a
    // live session. Everything below this line may touch production data, so
    // nothing below it runs until the handle has been proven safe to hold.
    await this.assertNotProdDatabaseFromDev();

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
   * THE LAW, ENFORCED: a laptop may not hold a write handle on a hosted
   * database.
   *
   * CLAUDE.md has said "NEVER point a local api at the prod DB" since the
   * Railway cutover, but it was documentation only — nothing checked. A laptop
   * process holding a Railway proxy URL writes to production with full
   * superuser rights, and the shared prod/staging password meant no operator
   * could tell the two apart by inspection.
   *
   * THE ESCAPE HATCH IS NOW A PROOF, NOT A PROMISE (2026-08-03).
   *
   * This used to be waved off with `ALLOW_REMOTE_DB=1` — an env var that
   * disabled the guard wholesale on the operator's word that the session was
   * "a read-only audit script". That is the same shape as every mechanism
   * this codebase has spent the week retiring: a claim nothing verifies. It
   * also had a second life as a staging migration bridge, and a bridge that
   * silently disables a safety guard outlives its reason by default.
   *
   * The legitimate case is real, so it keeps a door: an operator DOES need to
   * query production from a laptop. But the exception is now granted by a
   * demonstrated property rather than an assertion — the connection must
   * actually lack write privilege. `crave_readonly` exists on production for
   * exactly this, and a role named readonly that was granted INSERT by
   * accident fails this check, because the check asks Postgres rather than
   * reading the name.
   */
  private async assertNotProdDatabaseFromDev(): Promise<void> {
    const appEnv = resolveAppEnv();
    // DEPLOYED, not PROD (2026-08-02). This asked "am I production?" to decide
    // whether a hosted database was legitimate — two different questions
    // through one boolean. Staging runs on Railway against its own Railway
    // database, so under the old test it had to declare itself `prod` to boot
    // at all, which is how staging ended up indistinguishable from production
    // everywhere else. A hosted DB is legitimate for any DEPLOYED runtime.
    if (isDeployedEnv(appEnv)) {
      return;
    }

    const url = process.env.DATABASE_URL || '';
    const remoteHost = /@[^/]*(rlwy\.net|railway\.internal|railway\.app)/i.test(
      url,
    );
    if (!remoteHost) {
      return;
    }

    if (await this.connectionIsReadOnly()) {
      this.logger?.warn(
        'A non-deployed process is connected to a HOSTED database with a ' +
          'read-only role. Reads only — any write will be refused by Postgres.',
        { operation: 'remote_db_readonly_session', appEnv },
      );
      return;
    }

    throw new Error(
      `REFUSED: a non-deployed process (APP_ENV=${appEnv}) holds a WRITE ` +
        `handle on a Railway-hosted database. This is the documented ` +
        `never-point-local-at-prod law. Use the local database, or connect ` +
        `as a role with no write privilege (crave_readonly) if you need to ` +
        `read production — there is deliberately no env var that turns this ` +
        `off on your word alone.`,
    );
  }

  /**
   * Ask POSTGRES whether this connection can write, rather than trusting a
   * role name or an env var. Checked against a table that must exist and
   * would be catastrophic to write from a laptop.
   *
   * A failure to answer is not a pass: an unreadable answer means we do not
   * know, and not knowing must refuse.
   */
  private async connectionIsReadOnly(): Promise<boolean> {
    try {
      const rows = await this.$queryRaw<{ can_write: boolean }[]>`
        SELECT (
          has_table_privilege(current_user, 'signals', 'INSERT')
          OR has_table_privilege(current_user, 'signals', 'UPDATE')
          OR has_table_privilege(current_user, 'signals', 'DELETE')
          OR pg_has_role(current_user, 'pg_write_all_data', 'USAGE')
          OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
        ) AS can_write
      `;
      return rows[0]?.can_write === false;
    } catch {
      return false;
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
