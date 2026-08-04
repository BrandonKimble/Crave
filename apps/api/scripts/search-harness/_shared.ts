/**
 * @script-class: probe
 * @finding: NOT YET BANKED — record what this probe answered, or delete it.
 *
 * A banked probe's value is the RECORDED RESULT, kept so the finding stays
 * reproducible. This one has no runner and no written-down finding: the
 * F414 sweep (2026-08-02) could establish the first fact mechanically but
 * not the second, and inventing one would be worse than leaving it visible.
 * Until a finding is written here, this file is a deletion candidate.
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { stopCronsForScript } from '../../src/shared/utils/stop-crons';
import { isDeployedEnv, resolveAppEnv } from '../../src/shared/config/app-env';

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

/**
 * A SCRIPT THAT WRITES DECLARES ITS TARGET ENVIRONMENT AND REFUSES ANY OTHER
 * (audit 2026-08-03, F1255).
 *
 * Three files in this directory (`rt-ballot-lane`, `rt-activation-scope`,
 * `rt-complete-chunk-plan`) insert real rows — extraction runs, source
 * documents, polls, and USERS — and vote through the real ballot service.
 * They shipped with no environment guard of any kind: they wrote to whatever
 * `DATABASE_URL` happened to name. Under the deploy-autonomy posture that is
 * one exported variable away from synthetic users in production, and the
 * directory README called the whole family "READ-ONLY", so nothing in the
 * corpus contradicted it.
 *
 * Two independent tests, because either alone has a hole: the resolved app env
 * catches a correctly-labelled deployed process, and the host check catches
 * the real hazard — a laptop with `APP_ENV` unset and a hosted `DATABASE_URL`
 * exported, which resolves to `dev` and would otherwise sail through.
 */
export function requireNonProdDatabase(what: string): void {
  const env = resolveAppEnv();
  if (isDeployedEnv(env)) {
    throw new Error(
      `${what} WRITES synthetic rows and refuses to run against a deployed environment (APP_ENV resolved to "${env}"). Run it on a local/dev database.`,
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(
      `${what} WRITES synthetic rows and could not parse DATABASE_URL to verify it is local. Refusing.`,
    );
  }
  const local = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
  if (!local.includes(host)) {
    throw new Error(
      `${what} WRITES synthetic rows and refuses a non-local database host "${host}". Run it against the local dev DB.`,
    );
  }
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
