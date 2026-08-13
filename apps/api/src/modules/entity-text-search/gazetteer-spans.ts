import type { EntityType } from '@prisma/client';
// THE ACCENT-ADMISSION RULE LIVES WITH THE FOLDS IT IS MADE OF
// (entity-identity.ts), because it is not a search rule — it is the identity
// question "is this the same word", asked of a typed string and a banked one.
// It is re-exported here so this module's consumers and specs keep their
// import, and so the query path and the INGESTION resolver cannot drift: they
// were two rules for one question until 2026-08-12 (the resolver compared the
// whole string and refused 'phở bo', which the gazetteer admits).
export {
  admitsAtExactTier,
  spellingOf,
  type SurfaceSpelling,
} from '../content-processing/entity-resolver/entity-identity';

/**
 * Pure span-assembly logic for the gazetteer scan, extracted from
 * EntityTextSearchService so the round-2 review's central defect can be
 * pinned by unit tests with no database:
 *
 * THE DEFECT (two reviewers converged independently, 2026-07-30): the old
 * greedy overlap filter treated SAME-SPAN duplicates as overlaps, so a span
 * whose text names several entities ("breakfast": food + food_attribute +
 * restaurant_attribute) survived as ONE winner chosen by JS sort stability
 * over DB row order — i.e. arbitrarily. Search's entire "types come from
 * grounding" law rides on getting ALL of a span's types; and even the
 * single-winner consumers (poll highlighting) deserve a DETERMINISTIC
 * winner, not a vacuum-dependent one.
 *
 * Shape: overlap policy applies to SPANS (longest wins, ties by earliest
 * start); type policy applies to CONSUMERS (multi-type groups for search,
 * deterministic single winner for polls).
 */

export interface SpanEntity {
  entityId: string;
  name: string;
  type: EntityType;
}

export interface EntitySpanGroup {
  start: number;
  end: number;
  text: string;
  /** Every entity this exact span names — all the types the data says. */
  entities: SpanEntity[];
  /** MAXIMAL LINKING (2026-08-06): the non-overlapping cover of SHORTER
   *  grounded spans inside this group. The old shape discarded these — a
   *  compound match ("tacos vegetarianos" → vegetarian taco, 2 events)
   *  silently threw away its parts (taco 2,328 ev + vegetarian 121 ev),
   *  the single largest failure class on the es launch gate (17/38
   *  missed concepts). The parts are a SECONDARY reading: consumers that
   *  want one span per position keep reading `entities`; eligibility
   *  consumers may also admit the decomposed reading at a lower tier.
   *  Ranking stays Crave-Score-ordered either way — this only widens
   *  what is ELIGIBLE, never how results sort. */
  subGroups?: EntitySpanGroup[];
}

interface RawSpanMatch extends SpanEntity {
  start: number;
  end: number;
  text: string;
}

/**
 * How much of the QUERY a span explains, in characters the user actually
 * typed (whitespace excluded).
 *
 * WHY NOT A TOKEN COUNT. "Cover the most tokens" is the rule in English, but
 * a token count is a LATIN measure: Chinese is written without spaces, so
 * every span there is exactly one "token" and coverage degenerates into a
 * count of SPANS — which inverts the rule and shreds compounds (牛肉面 would
 * lose to 牛肉 + 面, two spans beating one). Counting typed characters is the
 * same judgement in a script-neutral unit: it orders '[banh mi] + [burger]'
 * above the bridging '[mi burger]' exactly as tokens do, and it keeps 牛肉面
 * whole. Nothing here knows which language it is looking at.
 *
 * Interior whitespace is excluded so a reading is never rewarded for the
 * separators it swallows — only for the words.
 *
 * `.length` HERE IS UTF-16 CODE UNITS, not the code points the doctrine
 * above is written in. It is cosmetic today for a reason worth stating: this
 * number is only ever COMPARED between candidate readings of the SAME query,
 * so an astral character that counts 2 instead of 1 inflates every span that
 * contains it equally, and the ordering — which is the whole output — does
 * not move. It stops being cosmetic the moment a coverage figure is compared
 * ACROSS queries or against an absolute threshold (a "covered enough of the
 * query" gate), at which point a query written in astral characters scores
 * double. `Array.from(...).length` is the fix if that day comes.
 */
function spanCoverage(group: EntitySpanGroup): number {
  const typed = group.text.replace(/\s+/g, '').length;
  return typed > 0 ? typed : 1;
}

/**
 * THE COVER LINKER (2026-08-10) — span selection reads the WHOLE query.
 *
 * THE DEFECT it replaces: selection was greedy — sort every grounded span
 * longest-first and consume. Greedy is locally optimal and globally wrong
 * whenever a long span BRIDGES two real concepts. The registry really does
 * bank such bridges ('bánh mì burger' is a surface of BURGER, sitting across
 * the seam of 'bánh mì | burger thực vật'): when one wins on length it eats
 * the words on both sides of the seam and STRANDS the rest, so a query that
 * names two dishes comes back naming one. The user asked for a vegan banh-mi
 * burger and gets a banh mi.
 *
 * THE RULE: choose the non-overlapping span SET that covers the most of the
 * query. A reading that explains the whole request beats a reading that
 * explains a longer piece of it.
 *
 * WHAT IT MOVED, MEASURED (2026-08-10): nothing yet. Over the es + vi gold
 * corpora (314 queries), the 24-query battery, and 1,500 synthetic bridging
 * shapes built by concatenating real banked multi-word surfaces, the selected
 * reading is IDENTICAL under greedy and under this rule — greedy already
 * reaches maximum coverage on every one of them, largely because the locale
 * filter removes the cross-language bridges before selection ever sees them.
 * That is the honest result and it is the point: the identity property says
 * this rule can only ever act where greedy was losing words, so it is safe to
 * carry standing, and the failure mode stops depending on which surfaces the
 * next re-extraction happens to bank.
 *
 * THE TIE-BREAK IS LOAD-BEARING, and it is exactly today's greedy. Among the
 * readings of maximum coverage, prefer the one containing the longest span;
 * among those, the earliest-starting; and so on down the reading — i.e. order
 * each reading's spans greedy-style (longest first, ties earliest start) and
 * take the greedy-lexicographically smallest. WHY: wherever greedy already
 * achieved maximum coverage — which is nearly every query, every currently
 * green gate entry included — the greedy set IS the greedy-lex-minimum among
 * the maximum-coverage readings, so the output is byte-identical to
 * yesterday's. This change can only move a query that greedy was LOSING
 * tokens on. That identity is pinned by spec ('the identity property').
 *
 * MECHANISM: pick spans in greedy order, admitting a span only when it can
 * still be completed to a maximum-coverage reading. `maxCoverage(lo, hi)` is
 * a DP over the span-boundary coordinates of the free interval [lo, hi); the
 * accepted spans cut the query into disjoint free intervals, and each
 * interval's optimum is independent of the others, so the admission test is
 * local: keeping the span must not lower the interval's optimum.
 */
function selectCoveringReading(
  /** Every candidate group, ALREADY in greedy order (longest, then earliest). */
  greedyOrdered: EntitySpanGroup[],
): EntitySpanGroup[] {
  if (greedyOrdered.length <= 1) return [...greedyOrdered];

  // Coordinate compression: only span boundaries can ever matter.
  const coords = Array.from(
    new Set(greedyOrdered.flatMap((g) => [g.start, g.end])),
  ).sort((a, b) => a - b);
  const index = new Map(coords.map((c, i) => [c, i]));
  const m = coords.length;
  const startsAt: EntitySpanGroup[][] = Array.from({ length: m }, () => []);
  for (const group of greedyOrdered)
    startsAt[index.get(group.start)!].push(group);

  const memo = new Map<number, number>();
  const maxCoverage = (lo: number, hi: number): number => {
    if (lo >= hi) return 0;
    const key = lo * (m + 1) + hi;
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    // Leaving coordinate `lo` unexplained is always allowed.
    let best = maxCoverage(lo + 1, hi);
    for (const group of startsAt[lo]) {
      const end = index.get(group.end)!;
      if (end > hi) continue;
      const withSpan = spanCoverage(group) + maxCoverage(end, hi);
      if (withSpan > best) best = withSpan;
    }
    memo.set(key, best);
    return best;
  };

  const free: Array<[number, number]> = [[0, m - 1]];
  const accepted: EntitySpanGroup[] = [];
  for (const group of greedyOrdered) {
    const lo = index.get(group.start)!;
    const hi = index.get(group.end)!;
    const slot = free.findIndex(
      ([fLo, fHi]) => fLo <= lo && hi <= fHi && fLo < fHi,
    );
    if (slot < 0) continue; // overlaps something already accepted
    const [fLo, fHi] = free[slot];
    const keeping =
      maxCoverage(fLo, lo) + spanCoverage(group) + maxCoverage(hi, fHi);
    if (keeping !== maxCoverage(fLo, fHi)) continue; // would cost coverage
    accepted.push(group);
    free.splice(slot, 1, [fLo, lo], [hi, fHi]);
  }
  return accepted;
}

/**
 * Group raw (entity, span) matches into non-overlapping span groups.
 * Longest span wins; ties break to earliest start. All entities sharing the
 * winning span ride together — no same-span drop.
 */
export function groupEntitySpans(rawSpans: RawSpanMatch[]): EntitySpanGroup[] {
  const byKey = new Map<string, EntitySpanGroup>();
  for (const span of rawSpans) {
    const key = `${span.start}:${span.end}`;
    const group = byKey.get(key);
    if (group) {
      if (!group.entities.some((e) => e.entityId === span.entityId)) {
        group.entities.push({
          entityId: span.entityId,
          name: span.name,
          type: span.type,
        });
      }
    } else {
      byKey.set(key, {
        start: span.start,
        end: span.end,
        text: span.text,
        entities: [
          { entityId: span.entityId, name: span.name, type: span.type },
        ],
      });
    }
  }

  const groups = Array.from(byKey.values()).sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const accepted = selectCoveringReading(groups);
  accepted.sort((a, b) => a.start - b.start);
  // MAXIMAL LINKING: for each accepted group, the shorter grounded spans it
  // covers form its decomposed reading — same longest-wins greedy, scoped
  // inside the group. `groups` is already sorted longest-first.
  for (const group of accepted) {
    const chosen: EntitySpanGroup[] = [];
    for (const inner of groups) {
      if (inner === group) continue;
      if (inner.start < group.start || inner.end > group.end) continue;
      const overlaps = chosen.some(
        (c) => inner.start < c.end && inner.end > c.start,
      );
      if (!overlaps) chosen.push(inner);
    }
    if (chosen.length) {
      group.subGroups = chosen.sort((a, b) => a.start - b.start);
    }
  }
  // Entities within a group are ordered deterministically so every
  // downstream read (including JSON persistence) is stable run-to-run.
  for (const group of accepted) {
    group.entities.sort(
      (a, b) =>
        a.type.localeCompare(b.type) || a.entityId.localeCompare(b.entityId),
    );
    for (const sub of group.subGroups ?? []) {
      sub.entities.sort(
        (a, b) =>
          a.type.localeCompare(b.type) || a.entityId.localeCompare(b.entityId),
      );
    }
  }
  return accepted;
}

/**
 * Deterministic single winner for consumers that render one entity per span
 * (poll comment highlighting). Priority = the caller's own entityTypes
 * order — polls pass [restaurant, food, ...], so a name that is both a
 * restaurant and a food highlights as the restaurant, every time, on every
 * replica. Final tiebreak entityId so the choice can never depend on row
 * order again.
 */
export function pickSpanWinner(
  group: EntitySpanGroup,
  typePriority: EntityType[],
): SpanEntity {
  const rank = new Map(typePriority.map((type, index) => [type, index]));
  return [...group.entities].sort(
    (a, b) =>
      (rank.get(a.type) ?? typePriority.length) -
        (rank.get(b.type) ?? typePriority.length) ||
      a.entityId.localeCompare(b.entityId),
  )[0];
}
