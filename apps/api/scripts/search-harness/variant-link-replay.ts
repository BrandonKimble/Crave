import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import {
  LINKER_TIER_FLOORS,
  LINKER_MARGIN,
  LINKER_MIN_FLOOR,
} from '../../src/modules/search/linker-calibration.generated';
import {
  bootstrap,
  loadFixture,
  out,
  DEFAULT_MARKET_KEY,
  type FixtureEntity,
} from './_shared';

/**
 * variant-link-replay.ts — the link-margin baseline (Part C, row "Link margin m").
 *
 * Builds two pair sets from the frozen corpus:
 *   (a) alias→canonical: each alias SHOULD link to its own entity (variant recall).
 *   (b) containment:     names where one is a substring of another
 *                        ("Joe's" ⊂ "Joe's Pizza") — a WRONG-link risk.
 *
 * Each pair is run through the linker's EXACT decision logic — replicated here,
 * reading the real `retrieveCandidates` shortlist, WITHOUT modifying the service:
 *   exact (name==term)  → link that entity
 *   else best sparse ≥ 0.82 → link that entity   (the current 0.82 rule)
 *   else                → unresolved
 *
 * Reports:
 *   - variant-link recall : aliases that link to the CORRECT entity
 *   - containment errors  : shorter name links to the WRONG (longer) entity, or v.v.
 *
 * This is the baseline for the planned 0.82 → margin change (B6). A margin sweep
 * lives in a later step; here we just document what the 0.82 rule does today.
 *
 *   yarn workspace api ts-node scripts/search-harness/variant-link-replay.ts
 */

const SHORTLIST_K = 5; // HYBRID_LINK_SHORTLIST_K in the real linker
const RECALL_POOL = 50;
const LINK_THRESHOLD_0_82 = 0.82; // HYBRID_LINK_SIMILARITY_THRESHOLD
const MAX_CONTAINMENT_PAIRS = Number(process.env.MAX_CONTAINMENT ?? 2000);
const MAX_ALIAS_PAIRS = Number(process.env.MAX_ALIAS ?? 0); // 0 = all
// Containment risk is the same-BRAND ambiguity ("Joe's" ⊂ "Joe's Pizza"), which
// is a restaurant phenomenon. A single food word ("chicken" ⊂ "chicken parm") is
// not a wrong-link risk — they're genuinely different dishes — so foods are
// excluded by default (matches the audit's ~32-pair restaurant count). Set
// CONTAINMENT_TYPES=restaurant,food to widen.
const CONTAINMENT_TYPES = new Set<string>(
  (process.env.CONTAINMENT_TYPES ?? 'restaurant')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
);

interface LinkOutcome {
  linkedEntityId: string | null;
  tier: 'exact' | 'fuzzy' | 'unmatched';
  matchedName: string | null;
  sim: number;
}

/** Faithful replica of SearchQueryInterpretationService.linkViaHybridRecall's
 *  decision, reading the REAL recall shortlist. The service is NOT modified. */
async function linkDecision(
  search: EntityTextSearchService,
  term: string,
  type: EntityType,
): Promise<LinkOutcome> {
  const t = term.trim();
  if (!t)
    return {
      linkedEntityId: null,
      tier: 'unmatched',
      matchedName: null,
      sim: 0,
    };

  const candidates = await search.retrieveCandidates(t, [type], SHORTLIST_K, {
    marketKey: type === 'restaurant' ? DEFAULT_MARKET_KEY : undefined,
    denseMode: 'none',
    poolSize: RECALL_POOL,
  });
  if (candidates.length === 0)
    return {
      linkedEntityId: null,
      tier: 'unmatched',
      matchedName: null,
      sim: 0,
    };

  // MARGIN decider (mirrors the service): exact by evidence class; else link on
  // the 0.82 floor OR a dominant margin over the runner-up (near-miss recovery),
  // over link-eligible lexical evidence only.
  // Mirrors the service: per-tier floors from the GENERATED calibration table
  // (importing the same artifact the service reads kills replica drift).
  const ELIGIBLE = new Set<string>([
    'exact',
    'prefix',
    'name',
    'alias',
    'fuzzy',
    'contains',
    'edit',
  ]);
  const FALLBACK = { absolute: 0.82, singleton: 0.65 };
  const exact = candidates.find((c) => c.sparseEvidence === 'exact');
  if (exact) {
    return {
      linkedEntityId: exact.entityId,
      tier: 'exact',
      matchedName: exact.name,
      sim: 1,
    };
  }
  const eligible = candidates
    .filter((c) => c.sparseEvidence != null && ELIGIBLE.has(c.sparseEvidence))
    .sort((a, c) => (c.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0));
  const top = eligible[0];
  const topSim = top?.sparseSimilarity ?? 0;
  const runnerSim = eligible[1]?.sparseSimilarity ?? 0;
  const floors =
    (top?.sparseEvidence && LINKER_TIER_FLOORS[top.sparseEvidence]) || FALLBACK;
  const linkable =
    top != null &&
    topSim >= LINKER_MIN_FLOOR &&
    (topSim >= floors.absolute ||
      (eligible.length === 1 && topSim >= floors.singleton) ||
      (runnerSim > 0 && topSim >= LINKER_MARGIN * runnerSim));
  if (linkable) {
    return {
      linkedEntityId: top.entityId,
      tier: 'fuzzy',
      matchedName: top.name,
      sim: topSim,
    };
  }
  return {
    linkedEntityId: null,
    tier: 'unmatched',
    matchedName: null,
    sim: topSim,
  };
}

async function main(): Promise<void> {
  const fixture = loadFixture();
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);

    // ---- (a) alias → canonical pairs ------------------------------------
    // Skip aliases that are just a case-copy of the name (they'd trivially link
    // exact and aren't a "variant" test). Those are the "76% name-copy" class the
    // audit flags separately; measure the genuinely-different aliases here.
    interface AliasPair {
      alias: string;
      entity: FixtureEntity;
    }
    const aliasPairs: AliasPair[] = [];
    for (const e of fixture.entities) {
      for (const alias of e.aliases) {
        const a = alias.trim();
        if (!a) continue;
        if (a.toLowerCase() === e.name.trim().toLowerCase()) continue; // name-copy
        aliasPairs.push({ alias: a, entity: e });
      }
    }
    const aliasSample =
      MAX_ALIAS_PAIRS > 0 ? aliasPairs.slice(0, MAX_ALIAS_PAIRS) : aliasPairs;

    out('=== VARIANT-LINK REPLAY (current 0.82 linker) ===');
    out(`fixture v${fixture.fixtureVersion} @ ${fixture.generatedAt}`);
    out(
      `market=${DEFAULT_MARKET_KEY}  shortlistK=${SHORTLIST_K}  threshold=0.82`,
    );
    out('');
    out(
      `(a) ALIAS → CANONICAL variant recall  (n=${aliasSample.length} non-name-copy aliases)`,
    );

    let aliasLinkedCorrect = 0;
    let aliasLinkedWrong = 0;
    let aliasUnresolved = 0;
    const aliasExact = { exact: 0, fuzzy: 0 };
    const missExamples: string[] = [];
    const wrongExamples: string[] = [];

    for (const { alias, entity } of aliasSample) {
      const r = await linkDecision(search, alias, entity.type);
      if (r.linkedEntityId === entity.entityId) {
        aliasLinkedCorrect++;
        if (r.tier === 'exact') aliasExact.exact++;
        else aliasExact.fuzzy++;
      } else if (r.linkedEntityId != null) {
        aliasLinkedWrong++;
        if (wrongExamples.length < 6)
          wrongExamples.push(
            `"${alias}" (→ want ${entity.name}) linked ${r.matchedName} @${r.sim.toFixed(2)}`,
          );
      } else {
        aliasUnresolved++;
        if (missExamples.length < 6)
          missExamples.push(
            `"${alias}" (→ want ${entity.name}) UNRESOLVED (best sim ${r.sim.toFixed(2)})`,
          );
      }
    }

    const aliasTotal = aliasSample.length;
    out(
      `    recall(correct link) = ${pct(aliasLinkedCorrect, aliasTotal)}  ` +
        `[exact=${aliasExact.exact} fuzzy=${aliasExact.fuzzy}]`,
    );
    out(`    wrong-entity link    = ${pct(aliasLinkedWrong, aliasTotal)}`);
    out(`    unresolved           = ${pct(aliasUnresolved, aliasTotal)}`);
    out('    sample unresolved:');
    for (const m of missExamples) out(`      · ${m}`);
    if (wrongExamples.length) {
      out('    sample wrong-links:');
      for (const w of wrongExamples) out(`      · ${w}`);
    }

    // ---- (b) containment pairs ------------------------------------------
    // Within a type, find (short, long) where short's WHOLE NAME is the leading
    // prefix word(s) of long's name ("Joe's" ⊂ "Joe's Pizza") AND they are
    // distinct entities. This is the same-brand ambiguity class the audit counts
    // (~32 pairs); a single word like "steak" contained in every steak dish is a
    // different, non-branded phenomenon and is excluded (leading-prefix only).
    // Feed the SHORT name to the linker; the risk is it links to the LONG entity
    // instead of the exact short entity — a wrong-link.
    interface ContainmentPair {
      shortE: FixtureEntity;
      longE: FixtureEntity;
    }
    const containment: ContainmentPair[] = [];
    const byType = new Map<EntityType, FixtureEntity[]>();
    for (const e of fixture.entities) {
      if (!CONTAINMENT_TYPES.has(e.type)) continue;
      const arr = byType.get(e.type) ?? [];
      arr.push(e);
      byType.set(e.type, arr);
    }
    for (const [, list] of byType) {
      const keyed = list
        .map((e) => ({ e, key: e.name.trim().toLowerCase() }))
        .filter((x) => x.key.length >= 3);
      for (const s of keyed) {
        for (const l of keyed) {
          if (l.key.length <= s.key.length) continue;
          if (s.key === l.key) continue;
          // leading whole-word prefix containment ("joe's" → "joe's pizza")
          if (l.key.startsWith(s.key + ' ')) {
            containment.push({ shortE: s.e, longE: l.e });
            if (containment.length >= MAX_CONTAINMENT_PAIRS) break;
          }
        }
        if (containment.length >= MAX_CONTAINMENT_PAIRS) break;
      }
      if (containment.length >= MAX_CONTAINMENT_PAIRS) break;
    }

    out('');
    out(
      `(b) CONTAINMENT wrong-link risk  (n=${containment.length} short⊂long name pairs)`,
    );

    let containErrors = 0;
    let containCorrect = 0;
    let containUnresolved = 0;
    const containErrExamples: string[] = [];
    for (const { shortE, longE } of containment) {
      const r = await linkDecision(search, shortE.name, shortE.type);
      if (r.linkedEntityId === shortE.entityId) {
        containCorrect++;
      } else if (r.linkedEntityId === longE.entityId) {
        containErrors++;
        if (containErrExamples.length < 8)
          containErrExamples.push(
            `"${shortE.name}" linked WRONG → "${longE.name}" @${r.sim.toFixed(2)}`,
          );
      } else if (r.linkedEntityId != null) {
        // linked to some third entity — also an error for this test
        containErrors++;
        if (containErrExamples.length < 8)
          containErrExamples.push(
            `"${shortE.name}" linked WRONG → "${r.matchedName}" @${r.sim.toFixed(2)}`,
          );
      } else {
        containUnresolved++;
      }
    }
    const cTotal = containment.length;
    out(`    correct (short→short) = ${pct(containCorrect, cTotal)}`);
    out(
      `    WRONG-entity link     = ${pct(containErrors, cTotal)}  (${containErrors} pairs)`,
    );
    out(`    unresolved            = ${pct(containUnresolved, cTotal)}`);
    for (const ex of containErrExamples) out(`      · ${ex}`);

    out('');
    out(
      'Baseline captured. The 0.82→margin change (B6) must lift variant recall',
    );
    out('without inflating containment errors.');
  } finally {
    await app.close();
  }
}

function pct(n: number, d: number): string {
  if (d === 0) return '  n/a';
  return `${((100 * n) / d).toFixed(1).padStart(5)}% (${n}/${d})`;
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
