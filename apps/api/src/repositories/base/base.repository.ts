import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IBaseRepository } from './base-repository.interface';
import {
  EntityNotFoundException,
  DatabaseOperationException,
  ForeignKeyConstraintException,
  UniqueConstraintException,
} from './repository.exceptions';

/**
 * Abstract base repository providing common CRUD operations
 * with error handling, logging, and Prisma integration.
 */
@Injectable()
export abstract class BaseRepository<T, TWhereInput, TCreateInput, TUpdateInput>
  implements IBaseRepository<T, TWhereInput, TCreateInput, TUpdateInput>
{
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly entityName: string,
  ) {
    this.logger = new Logger(`${entityName}Repository`);
  }

  /**
   * Get the Prisma delegate for this entity type
   */
  protected abstract getDelegate(): any;

  /**
   * Get the primary key field name for this entity
   */
  protected abstract getPrimaryKeyField(): string;

  async create(data: TCreateInput): Promise<T> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating ${this.entityName}`, { data });

      const result = await this.getDelegate().create({ data });

      const duration = Date.now() - startTime;
      this.logger.debug(`Created ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        id: result[this.getPrimaryKeyField()],
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        data,
      });

      throw this.handlePrismaError(error, 'create');
    }
  }

  async findById(id: string): Promise<T | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding ${this.entityName} by ID`, { id });

      const result = await this.getDelegate().findUnique({
        where: { [this.getPrimaryKeyField()]: id },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find ${this.entityName} by ID completed`, {
        duration: `${duration}ms`,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find ${this.entityName} by ID`, {
        duration: `${duration}ms`,
        error: error.message,
        id,
      });

      throw this.handlePrismaError(error, 'findById');
    }
  }

  async findUnique(where: TWhereInput): Promise<T | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding unique ${this.entityName}`, { where });

      const result = await this.getDelegate().findUnique({ where });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find unique ${this.entityName} completed`, {
        duration: `${duration}ms`,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find unique ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        where,
      });

      throw this.handlePrismaError(error, 'findUnique');
    }
  }

  async findFirst(where?: TWhereInput): Promise<T | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding first ${this.entityName}`, { where });

      const result = await this.getDelegate().findFirst({ where });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find first ${this.entityName} completed`, {
        duration: `${duration}ms`,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find first ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        where,
      });

      throw this.handlePrismaError(error, 'findFirst');
    }
  }

  async findMany(params?: {
    where?: TWhereInput;
    orderBy?: any;
    skip?: number;
    take?: number;
    include?: any;
  }): Promise<T[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding many ${this.entityName}`, { params });

      const result = await this.getDelegate().findMany(params);

      const duration = Date.now() - startTime;
      this.logger.debug(`Find many ${this.entityName} completed`, {
        duration: `${duration}ms`,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find many ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        params,
      });

      throw this.handlePrismaError(error, 'findMany');
    }
  }

  async update(id: string, data: TUpdateInput): Promise<T> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Updating ${this.entityName}`, { id, data });

      const result = await this.getDelegate().update({
        where: { [this.getPrimaryKeyField()]: id },
        data,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Updated ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        id,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        id,
        data,
      });

      if (error.code === 'P2025') {
        throw new EntityNotFoundException(this.entityName, id);
      }

      throw this.handlePrismaError(error, 'update');
    }
  }

  async updateMany(params: {
    where: TWhereInput;
    data: TUpdateInput;
  }): Promise<Prisma.BatchPayload> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Updating many ${this.entityName}`, { params });

      const result = await this.getDelegate().updateMany(params);

      const duration = Date.now() - startTime;
      this.logger.debug(`Updated many ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        count: result.count,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update many ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        params,
      });

      throw this.handlePrismaError(error, 'updateMany');
    }
  }

  async delete(id: string): Promise<T> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Deleting ${this.entityName}`, { id });

      const result = await this.getDelegate().delete({
        where: { [this.getPrimaryKeyField()]: id },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Deleted ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        id,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to delete ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        id,
      });

      if (error.code === 'P2025') {
        throw new EntityNotFoundException(this.entityName, id);
      }

      throw this.handlePrismaError(error, 'delete');
    }
  }

  async deleteMany(where: TWhereInput): Promise<Prisma.BatchPayload> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Deleting many ${this.entityName}`, { where });

      const result = await this.getDelegate().deleteMany({ where });

      const duration = Date.now() - startTime;
      this.logger.debug(`Deleted many ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        count: result.count,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to delete many ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        where,
      });

      throw this.handlePrismaError(error, 'deleteMany');
    }
  }

  async count(where?: TWhereInput): Promise<number> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Counting ${this.entityName}`, { where });

      const result = await this.getDelegate().count({ where });

      const duration = Date.now() - startTime;
      this.logger.debug(`Count ${this.entityName} completed`, {
        duration: `${duration}ms`,
        count: result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to count ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        where,
      });

      throw this.handlePrismaError(error, 'count');
    }
  }

  async exists(where: TWhereInput): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }

  async createMany(data: TCreateInput[]): Promise<Prisma.BatchPayload> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating many ${this.entityName}`, {
        count: data.length,
      });

      const result = await this.getDelegate().createMany({ data });

      const duration = Date.now() - startTime;
      this.logger.debug(`Created many ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        count: result.count,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create many ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        count: data.length,
      });

      throw this.handlePrismaError(error, 'createMany');
    }
  }

  async upsert(params: {
    where: TWhereInput;
    create: TCreateInput;
    update: TUpdateInput;
  }): Promise<T> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Upserting ${this.entityName}`, { params });

      const result = await this.getDelegate().upsert(params);

      const duration = Date.now() - startTime;
      this.logger.debug(`Upserted ${this.entityName} successfully`, {
        duration: `${duration}ms`,
        id: result[this.getPrimaryKeyField()],
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to upsert ${this.entityName}`, {
        duration: `${duration}ms`,
        error: error.message,
        params,
      });

      throw this.handlePrismaError(error, 'upsert');
    }
  }

  /**
   * Handle Prisma-specific errors and convert them to repository exceptions
   */
  protected handlePrismaError(error: any, operation: string): Error {
    if (error.code) {
      switch (error.code) {
        case 'P2002':
          const fields = error.meta?.target || ['unknown'];
          return new UniqueConstraintException(this.entityName, fields);

        case 'P2003':
          const foreignKey = error.meta?.field_name || 'unknown';
          return new ForeignKeyConstraintException(
            this.entityName,
            foreignKey,
            'referenced entity',
          );

        case 'P2025':
          return new EntityNotFoundException(this.entityName, 'unknown');

        default:
          return new DatabaseOperationException(
            operation,
            this.entityName,
            error,
          );
      }
    }

    return new DatabaseOperationException(operation, this.entityName, error);
  }
}
