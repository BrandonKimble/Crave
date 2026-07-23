import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';

/**
 * Shared plumbing for the Step-1 search validation harnesses (see README.md).
 *
 * These scripts are READ-ONLY against the live dev DB (`crave_search` on
 * localhost, creds in apps/api/.env). They bootstrap the real Nest AppModule the
 * same way the deleted `scripts/entity-search-ab.ts` did — so every recall/link
 * call runs the ACTUAL production code path — and they never edit any hot file.
 */

/** Default region LABEL for harness output (the dev corpus is ~99% NYC). This
 *  is display-only now: the old market-keyed recall scoping it named died with
 *  the market model (leg 2/leg 3) — restaurant recall is engine-territory
 *  scoped in prod, and these harnesses run global (unscoped) queries, so the
 *  label is bookkeeping for reading harness output, not a live filter value.
 *  Override with MARKET_KEY=… env. */
export const DEFAULT_MARKET_KEY =
  process.env.MARKET_KEY?.trim() || 'region-us-ny-new-york';

export const FIXTURE_VERSION = 1;
export const FIXTURE_PATH = path.join(
  __dirname,
  `frozen-fixture.v${FIXTURE_VERSION}.json`,
);

export interface FixtureEntity {
  entityId: string;
  name: string;
  type: EntityType;
  aliases: string[];
  /** true when this entity's primary location falls inside the DEFAULT_MARKET_KEY
   *  region's bbox (restaurants only, in practice — the geometric successor to
   *  the old market_presence row; §13 leg 3). */
  hasRegionPresence: boolean;
  /** region labels this entity's location falls inside (may be empty; today
   *  at most one — the single default region bbox check). */
  regionKeys: string[];
}

export interface Fixture {
  fixtureVersion: number;
  generatedAt: string;
  sourceDb: string;
  counts: Record<string, number>;
  entities: FixtureEntity[];
}

/** Bootstrap the real Nest app context (production code path). */
export async function bootstrap(): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  // Scripts never run scheduled work — see src/shared/utils/stop-crons.ts.
  stopCronsForScript(app);
  return app;
}

export function loadFixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Frozen fixture not found at ${FIXTURE_PATH}.\n` +
        `Generate it first:  yarn workspace api ts-node scripts/search-harness/frozen-fixture.ts`,
    );
  }
  const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
  const fixture = JSON.parse(raw) as Fixture;
  if (fixture.fixtureVersion !== FIXTURE_VERSION) {
    throw new Error(
      `Fixture version mismatch: file is v${fixture.fixtureVersion}, harness expects v${FIXTURE_VERSION}. Regenerate.`,
    );
  }
  return fixture;
}

export function out(m = ''): void {
  process.stdout.write(`${m}\n`);
}

/** Length buckets used across the typo + attribute harnesses (Part C). */
export type LengthBucket = 'le2' | 'b3_5' | 'b6_8' | 'b9plus';

export function lengthBucket(s: string): LengthBucket {
  const n = s.length;
  if (n <= 2) return 'le2';
  if (n <= 5) return 'b3_5';
  if (n <= 8) return 'b6_8';
  return 'b9plus';
}

export const BUCKET_LABEL: Record<LengthBucket, string> = {
  le2: '≤2 chars',
  b3_5: '3-5 chars',
  b6_8: '6-8 chars',
  b9plus: '9+ chars',
};

export const BUCKET_ORDER: LengthBucket[] = ['le2', 'b3_5', 'b6_8', 'b9plus'];

/** Deterministic PRNG (mulberry32) so runs are reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
