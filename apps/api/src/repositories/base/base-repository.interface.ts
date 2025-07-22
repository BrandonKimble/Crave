import { Prisma } from '@prisma/client';

/**
 * Generic base repository interface providing standard CRUD operations
 * with type safety and consistent patterns across all entity repositories.
 */
export interface IBaseRepository<T, TWhereInput, TCreateInput, TUpdateInput> {
  /**
   * Create a single entity
   */
  create(data: TCreateInput): Promise<T>;

  /**
   * Find entity by unique identifier
   */
  findById(id: string): Promise<T | null>;

  /**
   * Find single entity by conditions
   */
  findUnique(where: TWhereInput): Promise<T | null>;

  /**
   * Find first entity matching conditions
   */
  findFirst(where?: TWhereInput): Promise<T | null>;

  /**
   * Find multiple entities with filtering, sorting, and pagination
   */
  findMany(params?: {
    where?: TWhereInput;
    orderBy?: any;
    skip?: number;
    take?: number;
    include?: any;
  }): Promise<T[]>;

  /**
   * Update single entity by ID
   */
  update(id: string, data: TUpdateInput): Promise<T>;

  /**
   * Update entities matching conditions
   */
  updateMany(params: {
    where: TWhereInput;
    data: TUpdateInput;
  }): Promise<Prisma.BatchPayload>;

  /**
   * Delete single entity by ID
   */
  delete(id: string): Promise<T>;

  /**
   * Delete entities matching conditions
   */
  deleteMany(where: TWhereInput): Promise<Prisma.BatchPayload>;

  /**
   * Count entities matching conditions
   */
  count(where?: TWhereInput): Promise<number>;

  /**
   * Check if entity exists
   */
  exists(where: TWhereInput): Promise<boolean>;

  /**
   * Create multiple entities in a single transaction
   */
  createMany(data: TCreateInput[]): Promise<Prisma.BatchPayload>;

  /**
   * Upsert (create or update) entity
   */
  upsert(params: {
    where: TWhereInput;
    create: TCreateInput;
    update: TUpdateInput;
  }): Promise<T>;
}
