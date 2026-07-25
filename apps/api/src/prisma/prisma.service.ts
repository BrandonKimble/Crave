import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { DatabaseConfig } from '../config/database-config.interface';
import { DatabaseValidationService } from '../config/database-validation.service';
import { LoggerService } from '../shared';

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
          url: dbConfig?.url || process.env.DATABASE_URL || '',
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
