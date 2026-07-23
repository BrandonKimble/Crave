import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { bootstrap, makeRng, out, DEFAULT_MARKET_KEY } from './_shared';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * linker-calibration-sweep.ts — derives the linker's per-tier floors from a
 * PERTURBATION-GENERATED corpus and writes them to
 * `src/modules/search/linker-calibration.generated.ts` (versioned artifact,
 * provenance in the header). This exists because the alias-replay corpus can
 * NOT calibrate the decider: 1176/1178 of its pairs short-circuit at the exact
 * tier, so any constant "validated" on it rests on n≈2. Here every pair is a
 * single-edit typo (deletion/substitution/transposition/insertion) of a real
 * entity name-word — none hit the exact tier, all land in the region the
 * floors govern — plus NEGATIVE CONTROLS (gibberish + cross-type perturbations)
 * that must NOT link.
 *
 * Derivation per tier: the lowest floor whose link-iff-(topSim ≥ floor) rule
 * achieves ≥ TARGET_PRECISION on that tier's pairs; singleton floors derived on
 * the eligible.length===1 subset. Margin fixed at 1.3 this pass (noted in
 * provenance; sweepable later).
 *
 *   yarn workspace api ts-node scripts/search-harness/linker-calibration-sweep.ts
 */
const RNG = makeRng(Number(process.env.SEED ?? 4242));
const PER_TYPE = Number(process.env.PER_TYPE ?? 350);
const NEGATIVES = Number(process.env.NEGATIVES ?? 150);
const TARGET_PRECISION = Number(process.env.TARGET_PRECISION ?? 0.95);
const SHORTLIST_K = 5;
const POOL = 50;
const ELIGIBLE = new Set([
  'exact',
  'prefix',
  'name',
  'alias',
  'fuzzy',
  'contains',
  'edit',
]);
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const pick = <T>(arr: T[]): T => arr[Math.floor(RNG() * arr.length)];
const randLetter = () => LETTERS[Math.floor(RNG() * LETTERS.length)];

function perturb(word: string): string | null {
  if (word.length < 4) return null;
  const chars = word.split('');
  const kind = Math.floor(RNG() * 4);
  const i = 1 + Math.floor(RNG() * (chars.length - 2));
  if (kind === 0)
    chars.splice(i, 1); // deletion
  else if (kind === 1)
    chars[i] = randLetter(); // substitution
  else if (kind === 2) {
    const t = chars[i];
    chars[i] = chars[i + 1] ?? chars[i];
    chars[i + 1] = t; // transposition
  } else chars.splice(i, 0, randLetter()); // insertion
  const mutated = chars.join('');
  return mutated === word ? null : mutated;
}

interface Pair {
  term: string;
  type: EntityType;
  targetId: string | null; // null = negative control (must NOT link)
}

interface Observation {
  tier: string;
  topSim: number;
  runnerSim: number;
  singleton: boolean;
  correct: boolean; // top === target (positives); for negatives any link is wrong
  negative: boolean;
}

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);
    const prisma = app.get(PrismaService);

    // ---- corpus -----------------------------------------------------------
    const pairs: Pair[] = [];
    for (const type of [EntityType.food, EntityType.restaurant]) {
      const rows = await prisma.$queryRawUnsafe<
        { entity_id: string; name: string }[]
      >(
        `SELECT entity_id, name FROM core_entities
         WHERE type = $1::entity_type AND status='active'
         ORDER BY entity_id`,
        type,
      );
      const shuffled = rows.slice().sort(() => RNG() - 0.5);
      for (const row of shuffled) {
        if (
          pairs.filter((p) => p.type === type && p.targetId).length >= PER_TYPE
        )
          break;
        const words = row.name.toLowerCase().split(/\s+/);
        const word = pick(words);
        const mutated = perturb(word);
        if (!mutated) continue;
        const term = row.name.toLowerCase().replace(word, mutated);
        pairs.push({ term, type, targetId: row.entity_id });
      }
      // cross-type negatives: a perturbed OTHER-type name searched as this type
      const otherRows = await prisma.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM core_entities
         WHERE type = $1::entity_type AND status='active'
         ORDER BY random() LIMIT $2`,
        type === EntityType.food ? EntityType.restaurant : EntityType.food,
        Math.floor(NEGATIVES / 2),
      );
      for (const row of otherRows) {
        const words = row.name.toLowerCase().split(/\s+/);
        const mutated = perturb(pick(words));
        if (!mutated) continue;
        pairs.push({ term: mutated, type, targetId: null });
      }
      // gibberish negatives
      for (let i = 0; i < NEGATIVES / 2; i++) {
        const len = 4 + Math.floor(RNG() * 6);
        let g = '';
        for (let j = 0; j < len; j++) g += randLetter();
        pairs.push({ term: g, type, targetId: null });
      }
    }
    out(`corpus: ${pairs.length} pairs (positives + negatives)`);

    // ---- replay ------------------------------------------------------------
    const observations: Observation[] = [];
    for (const pair of pairs) {
      const candidates = await search.retrieveCandidates(
        pair.term,
        [pair.type],
        SHORTLIST_K,
        {
          denseMode: 'none',
          poolSize: POOL,
        },
      );
      const exact = candidates.find((c) => c.sparseEvidence === 'exact');
      if (exact) continue; // exact tier decides outright; not what we calibrate
      const eligible = candidates
        .filter(
          (c) => c.sparseEvidence != null && ELIGIBLE.has(c.sparseEvidence),
        )
        .sort((a, b) => (b.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0));
      const top = eligible[0];
      if (!top) continue;
      observations.push({
        tier: top.sparseEvidence as string,
        topSim: top.sparseSimilarity ?? 0,
        runnerSim: eligible[1]?.sparseSimilarity ?? 0,
        singleton: eligible.length === 1,
        correct: pair.targetId != null && top.entityId === pair.targetId,
        negative: pair.targetId == null,
      });
    }
    out(`observations in decision region: ${observations.length}`);

    // ---- derive floors ------------------------------------------------------
    const tiers = ['prefix', 'name', 'alias', 'fuzzy', 'contains', 'edit'];
    const derive = (obs: Observation[], label: string) => {
      // lowest floor with precision >= target among linked (topSim >= floor)
      let best = 0.95;
      for (let f = 0.95; f >= 0.35; f = Math.round((f - 0.01) * 100) / 100) {
        const linked = obs.filter((o) => o.topSim >= f);
        if (!linked.length) continue;
        const good = linked.filter((o) => o.correct).length;
        const precision = good / linked.length;
        if (precision >= TARGET_PRECISION) best = f;
        else break;
      }
      const linked = obs.filter((o) => o.topSim >= best);
      const precision = linked.length
        ? linked.filter((o) => o.correct).length / linked.length
        : 1;
      out(
        `  ${label.padEnd(18)} floor=${best.toFixed(2)}  n=${obs.length}  linked=${linked.length}  precision=${precision.toFixed(3)}`,
      );
      return best;
    };

    out('');
    out('=== derived per-tier floors ===');
    const floors: Record<string, { absolute: number; singleton: number }> = {};
    for (const tier of tiers) {
      const obs = observations.filter((o) => o.tier === tier);
      const absolute = obs.length >= 20 ? derive(obs, tier) : 0.82;
      const singles = obs.filter((o) => o.singleton);
      const singleton =
        singles.length >= 20 ? derive(singles, `${tier} (singleton)`) : 0.65;
      floors[tier] = { absolute, singleton };
      if (obs.length < 20)
        out(
          `  ${tier.padEnd(18)} n=${obs.length} < 20 → conservative defaults`,
        );
    }

    // negatives sanity
    const negObs = observations.filter((o) => o.negative);
    const negWouldLink = negObs.filter(
      (o) => o.topSim >= (floors[o.tier]?.absolute ?? 0.82),
    ).length;
    out('');
    out(
      `negative controls: ${negObs.length} reached the decision region; ${negWouldLink} would link at derived floors (want ~0)`,
    );

    // ---- write artifact -----------------------------------------------------
    const target = path.join(
      __dirname,
      '../../src/modules/search/linker-calibration.generated.ts',
    );
    const body = `// GENERATED by scripts/search-harness/linker-calibration-sweep.ts — do not hand-edit.
// Provenance: ${new Date().toISOString()}, corpus=${pairs.length} single-edit perturbation pairs
// (+${NEGATIVES * 2} negative controls), decision-region observations=${observations.length},
// target precision=${TARGET_PRECISION}. Margin fixed at 1.3 this pass (not swept).
// Regenerate after corpus refreshes or lattice/tier changes:
//   yarn ts-node scripts/search-harness/linker-calibration-sweep.ts

export interface LinkerTierFloors {
  /** Link outright at/above this similarity for this evidence tier. */
  absolute: number;
  /** Uncontested-singleton floor (no runner-up = infinite margin, higher bar). */
  singleton: number;
}

export const LINKER_TIER_FLOORS: Record<string, LinkerTierFloors> = ${JSON.stringify(floors, null, 2)};

export const LINKER_MARGIN = 1.3;
export const LINKER_MIN_FLOOR = 0.5;
`;
    fs.writeFileSync(target, body);
    out('');
    out(`wrote ${target}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
