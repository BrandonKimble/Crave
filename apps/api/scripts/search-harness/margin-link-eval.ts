import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../../src/modules/entity-text-search/entity-text-search.service';
import {
  bootstrap,
  loadFixture,
  out,
  DEFAULT_MARKET_KEY,
  type FixtureEntity,
} from './_shared';

/**
 * margin-link-eval.ts — Step 7 flip gate (plans/search-system-ideal.md B6).
 *
 * Runs BOTH link policies over the same ground-truth pairs and compares:
 *   - the live 0.82 rule (exact-name, else best sparse ≥ 0.82)
 *   - the margin policy (L1 exact/alias-exact, L2 dominant top≥m·runnerUp,
 *     L3 tie→reveal-all) — a faithful replica of shadowMarginLinkDecision.
 *
 * The flip is justified iff margin LIFTS alias-variant recall WITHOUT inflating
 * containment wrong-links. Reveal-all counts as "correct" when the target is
 * among the revealed ids (the user still sees it; ranking sorts).
 *
 *   MARGIN=1.3 yarn workspace api ts-node scripts/search-harness/margin-link-eval.ts
 */

const SHORTLIST_K = 5;
const RECALL_POOL = 50;
const THRESH = 0.82;
const MARGIN = Number(process.env.MARGIN ?? 1.3);
const CONTAINMENT_TYPES = new Set<string>(
  (process.env.CONTAINMENT_TYPES ?? 'restaurant')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
);

type Cand = {
  entityId: string;
  name: string;
  sparseEvidence: string | null;
  sparseSimilarity: number | null;
};

async function recall(
  search: EntityTextSearchService,
  term: string,
  type: EntityType,
): Promise<Cand[]> {
  const t = term.trim();
  if (!t) return [];
  return (await search.retrieveCandidates(t, [type], SHORTLIST_K, {
    marketKey: type === 'restaurant' ? DEFAULT_MARKET_KEY : undefined,
    denseMode: 'none',
    poolSize: RECALL_POOL,
  })) as Cand[];
}

/** Live 0.82 rule → the single linked id (or null). */
function decide0_82(term: string, candidates: Cand[]): string | null {
  if (candidates.length === 0) return null;
  const norm = term.trim().toLowerCase();
  const exact = candidates.find((c) => c.name.trim().toLowerCase() === norm);
  if (exact) return exact.entityId;
  const best = candidates.reduce((a, c) =>
    (c.sparseSimilarity ?? 0) > (a.sparseSimilarity ?? 0) ? c : a,
  );
  return (best.sparseSimilarity ?? 0) >= THRESH ? best.entityId : null;
}

/** Margin policy → the linked id set (plural for reveal-all). Mirrors
 *  shadowMarginLinkDecision in search-query-interpretation.service.ts. */
function decideMargin(candidates: Cand[]): string[] {
  if (candidates.length === 0) return [];
  const exacts = candidates.filter((c) => c.sparseEvidence === 'exact');
  if (exacts.length === 1) return [exacts[0].entityId];
  if (exacts.length > 1) return exacts.map((c) => c.entityId);
  const lexical = candidates
    .filter(
      (c) =>
        (c.sparseEvidence === 'prefix' ||
          c.sparseEvidence === 'name' ||
          c.sparseEvidence === 'fuzzy') &&
        (c.sparseSimilarity ?? 0) > 0,
    )
    .sort((a, b) => (b.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0));
  if (lexical.length === 0) return [];
  const top = lexical[0].sparseSimilarity ?? 0;
  const runnerUp = lexical[1]?.sparseSimilarity ?? 0;
  if (runnerUp === 0 || top >= MARGIN * runnerUp) return [lexical[0].entityId];
  return lexical
    .filter((c) => (c.sparseSimilarity ?? 0) * MARGIN >= top)
    .map((c) => c.entityId);
}

function pct(n: number, d: number): string {
  if (d === 0) return '  n/a';
  return `${((100 * n) / d).toFixed(1).padStart(5)}% (${n}/${d})`;
}

async function main(): Promise<void> {
  const fixture = loadFixture();
  const app = await bootstrap();
  try {
    const search = app.get(EntityTextSearchService);

    // ---- alias → canonical (variant recall) ----
    const aliasPairs: { alias: string; entity: FixtureEntity }[] = [];
    for (const e of fixture.entities) {
      for (const alias of e.aliases) {
        const a = alias.trim();
        if (!a || a.toLowerCase() === e.name.trim().toLowerCase()) continue;
        aliasPairs.push({ alias: a, entity: e });
      }
    }

    out('=== MARGIN-vs-0.82 LINK EVAL (Step 7 flip gate) ===');
    out(
      `fixture v${fixture.fixtureVersion}  market=${DEFAULT_MARKET_KEY}  m=${MARGIN}`,
    );
    out('');
    out(`(a) ALIAS → CANONICAL recall  (n=${aliasPairs.length})`);

    const A = {
      base_correct: 0,
      base_wrong: 0,
      base_miss: 0,
      m_correct: 0,
      m_wrong: 0,
      m_miss: 0,
      m_reveal: 0,
    };
    const recovered: string[] = [];
    for (const { alias, entity } of aliasPairs) {
      const cands = await recall(search, alias, entity.type);
      const base = decide0_82(alias, cands);
      const m = decideMargin(cands);
      // baseline
      if (base === entity.entityId) A.base_correct++;
      else if (base != null) A.base_wrong++;
      else A.base_miss++;
      // margin
      if (m.length === 0) A.m_miss++;
      else if (m.includes(entity.entityId)) {
        A.m_correct++;
        if (m.length > 1) A.m_reveal++;
        if (base !== entity.entityId && recovered.length < 8)
          recovered.push(
            `"${alias}" → ${entity.name} recovered by margin (base ${base ? 'wrong' : 'missed'})`,
          );
      } else A.m_wrong++;
    }
    out(
      `    0.82   : recall ${pct(A.base_correct, aliasPairs.length)}  wrong ${pct(A.base_wrong, aliasPairs.length)}  miss ${pct(A.base_miss, aliasPairs.length)}`,
    );
    out(
      `    margin : recall ${pct(A.m_correct, aliasPairs.length)}  wrong ${pct(A.m_wrong, aliasPairs.length)}  miss ${pct(A.m_miss, aliasPairs.length)}  [reveal-all=${A.m_reveal}]`,
    );
    for (const r of recovered) out(`      + ${r}`);

    // ---- containment (wrong-link risk) ----
    const containment: { shortE: FixtureEntity; longE: FixtureEntity }[] = [];
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
      for (const s of keyed)
        for (const l of keyed)
          if (l.key.length > s.key.length && l.key.startsWith(s.key + ' '))
            containment.push({ shortE: s.e, longE: l.e });
    }

    out('');
    out(`(b) CONTAINMENT wrong-link risk  (n=${containment.length})`);
    const C = { base_wrong: 0, m_wrong: 0, m_reveal_safe: 0 };
    const cErr: string[] = [];
    for (const { shortE, longE } of containment) {
      const cands = await recall(search, shortE.name, shortE.type);
      const base = decide0_82(shortE.name, cands);
      const m = decideMargin(cands);
      if (base != null && base !== shortE.entityId) C.base_wrong++;
      if (m.length > 0 && !m.includes(shortE.entityId)) {
        C.m_wrong++;
        if (cErr.length < 8)
          cErr.push(
            `"${shortE.name}" margin missed short (linked ${m.length} other)`,
          );
      } else if (m.length > 1) C.m_reveal_safe++;
    }
    out(`    0.82   : wrong-link ${pct(C.base_wrong, containment.length)}`);
    out(
      `    margin : wrong-link ${pct(C.m_wrong, containment.length)}  [reveal-included-short=${C.m_reveal_safe}]`,
    );
    for (const e of cErr) out(`      · ${e}`);

    out('');
    const recallLift = A.m_correct - A.base_correct;
    const containDelta = C.m_wrong - C.base_wrong;
    out(
      `VERDICT: alias recall ${recallLift >= 0 ? '+' : ''}${recallLift} vs 0.82; ` +
        `containment wrong-link ${containDelta >= 0 ? '+' : ''}${containDelta}. ` +
        `Flip is justified iff recall lift > 0 AND containment delta <= 0.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
