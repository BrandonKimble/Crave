import { Injectable } from '@nestjs/common';
import { EntityPriorityMetric, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';

@Injectable()
export class EntityPriorityMetricsRepository extends BaseRepository<
  EntityPriorityMetric,
  Prisma.EntityPriorityMetricWhereInput,
  Prisma.EntityPriorityMetricCreateInput,
  Prisma.EntityPriorityMetricUpdateInput
> {
  constructor(prisma: PrismaService, loggerService: LoggerService) {
    super(prisma, loggerService, 'EntityPriorityMetric');
  }

  protected getDelegate() {
    return this.prisma.entityPriorityMetric;
  }

  protected getPrimaryKeyField(): string {
    return 'entityId';
  }

  async upsertMetrics(
    where: Prisma.EntityPriorityMetricWhereUniqueInput,
    create: Prisma.EntityPriorityMetricCreateInput,
    update: Prisma.EntityPriorityMetricUpdateInput,
  ): Promise<EntityPriorityMetric> {
    const startTime = Date.now();
    try {
      this.logger.debug('Upserting EntityPriorityMetric', { where });

      const result = await this.getDelegate().upsert({
        where,
        create,
        update,
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Upsert EntityPriorityMetric completed', {
        duration,
        entityId: result.entityId,
      });

      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to upsert EntityPriorityMetric', error, {
        duration,
        where,
      });
      throw this.handlePrismaError(error, 'upsert');
    }
  }
}
