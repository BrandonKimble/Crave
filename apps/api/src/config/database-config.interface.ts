/**
 * Database configuration — ONLY knobs that reach a consumer.
 *
 * This interface used to model a Sequelize-era pool (min/acquire/idle/evict/
 * handleDisconnects), a query timeout+retry policy, and a performance/logging
 * block. NONE of it was consumed by anything but its own validator — Prisma
 * has no API for any of those knobs — and the fiction hid the one real bug:
 * `max` itself was also unconsumed, so both prod services ran Prisma's
 * cpus×2+1 default (=73 on Railway hosts) and pinned Postgres at its
 * 100-connection ceiling (the 2026-08-08 incident, see prisma.service.ts's
 * pinConnectionLimit). A config field with no consumer is not "supported
 * production tuning" — it is a place for the next incident to hide.
 */
export interface DatabaseConnectionPool {
  /** Prisma pool size, applied as the connection_limit URL parameter —
   *  the ONLY channel Prisma reads it from. */
  max: number;
}

export interface DatabaseConfig {
  url: string;
  connectionPool: DatabaseConnectionPool;
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  [key: string]: any;
}
