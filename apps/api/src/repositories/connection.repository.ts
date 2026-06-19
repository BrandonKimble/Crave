import { Injectable } from '@nestjs/common';
import { Connection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';

/**
 * Minimal ConnectionRepository
 * Only includes methods actually used by the Bull jobs + LLM processing pipeline
 */
@Injectable()
export class ConnectionRepository {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ConnectionRepository');
  }

  /**
   * Find many connections with optional filtering, sorting, and pagination
   */
  async findMany(params: {
    where?: Prisma.ConnectionWhereInput;
    orderBy?: Prisma.ConnectionOrderByWithRelationInput;
    skip?: number;
    take?: number;
    include?: Prisma.ConnectionInclude;
  }): Promise<Connection[]> {
    try {
      return await this.prisma.connection.findMany(params);
    } catch (error) {
      this.logger.error('Failed to find connections', {
        params,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a connection by ID
   */
  async update(
    connectionId: string,
    data: Prisma.ConnectionUpdateInput,
  ): Promise<Connection> {
    try {
      return await this.prisma.connection.update({
        where: { connectionId },
        data,
      });
    } catch (error) {
      this.logger.error('Failed to update connection', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
