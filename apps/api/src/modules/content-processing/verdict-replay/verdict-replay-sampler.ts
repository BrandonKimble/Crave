import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StoredVerdictRow } from './verdict-replay.types';

/**
 * THE STRATIFIED SAMPLER — three strata so a drift check cannot fool
 * itself:
 *
 *   - 'outcome': at least a few rows of EVERY outcome class the lane has
 *     ever ruled (a lane that flipped all its rare 'reject's would look
 *     clean to a uniform sample dominated by 'new');
 *   - 'recent':  the newest decisions — where a fresh prompt regression
 *     shows first;
 *   - 'random':  the historical body.
 *
 * Rehearsal rows are excluded: a rehearsal's judgments never steered live
 * resolution (claim-verdict-ledger doctrine), so their drift is not the
 * corpus's drift. Rows are deduped by (claimKey, ruleVersion, foldVersion)
 * with the earliest-listed stratum winning. ALL rule versions are sampled
 * — replaying an old-version verdict under today's rule is exactly the
 * drift question — and each row carries its stored version so the report
 * can say which population flipped.
 */

const PER_OUTCOME = 3;

interface RawRow {
  claim_key: string;
  rule_version: number;
  fold_version: number;
  outcome: string;
  reason: string;
  subject: unknown;
  decided_at: Date;
}

const toRow = (raw: RawRow, stratum: string): StoredVerdictRow => ({
  claimKey: raw.claim_key,
  ruleVersion: raw.rule_version,
  foldVersion: raw.fold_version,
  outcome: raw.outcome,
  reason: raw.reason,
  subject: raw.subject,
  decidedAt: raw.decided_at,
  stratum,
});

const COLS = Prisma.sql`claim_key, rule_version, fold_version, outcome,
  reason, subject, decided_at`;

export async function sampleLaneVerdicts(
  prisma: Pick<PrismaService, '$queryRaw'>,
  lane: string,
  sampleSize: number,
): Promise<StoredVerdictRow[]> {
  const base = Prisma.sql`FROM claim_verdicts
    WHERE lane = ${lane} AND source NOT LIKE 'rehearsal:%'`;

  // One representative per outcome class first — the stratum that must
  // never be crowded out.
  const perOutcome = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${COLS} FROM (
      SELECT *, row_number() OVER (PARTITION BY outcome ORDER BY random())
        AS rn ${base}
    ) t WHERE rn <= ${PER_OUTCOME}`);

  const half = Math.max(1, Math.floor(sampleSize / 2));
  const recent = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${COLS} ${base} ORDER BY decided_at DESC LIMIT ${half}`);
  const random = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT ${COLS} ${base} ORDER BY random() LIMIT ${sampleSize}`);

  const picked = new Map<string, StoredVerdictRow>();
  const add = (raws: RawRow[], stratum: string) => {
    for (const raw of raws) {
      if (picked.size >= sampleSize && stratum !== 'outcome') break;
      const key = `${raw.claim_key}|${raw.rule_version}|${raw.fold_version}`;
      if (!picked.has(key)) picked.set(key, toRow(raw, stratum));
    }
  };
  // Outcome coverage first (may slightly exceed nothing — it counts toward
  // the cap), then recency, then the random body up to the cap.
  add(perOutcome, 'outcome');
  add(recent, 'recent');
  add(random, 'random');
  return [...picked.values()].slice(0, sampleSize);
}
