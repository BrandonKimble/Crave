import type { EntityType } from '@prisma/client';

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

/**
 * DIACRITIC EVIDENCE — the exact-tier admission rule (2026-08-09).
 *
 * THE DEFECT: the exact tier matches on the FOLDED key, and the fold strips
 * accents so de-diacritized typing works ('pho' → phở, the way most people
 * type Vietnamese on a US keyboard). But the same collapse merges words that
 * are only distinguished BY their accents, and it did so at confidence 1.0:
 * 'bò' (beef) ground to avocado (via bơ), 'mỹ' (American) to mian (via mỳ),
 * 'cơm chay' (vegetarian rice) to scorched rice (via cơm cháy). A confident
 * wrong answer, on the one tier that admits no doubt.
 *
 * THE RULE, in one line: **when the user types accents, the accents are
 * evidence.** A span typed WITH accents is admitted at the exact tier only by
 * a surface that agrees on them; a surface that matches only after the accents
 * are stripped is not exact — it may still be reached by the lower-evidence
 * lanes (residue probe, dense link), which is where a genuine near-miss
 * belongs. A span typed WITHOUT accents carries no evidence either way, so
 * the folded key rules exactly as before and 'pho'/'bo' behave identically to
 * yesterday.
 *
 * THE SCOPE IS PER TOKEN, and that is the whole subtlety (red team, executed,
 * 2026-08-09 — the first cut of this rule compared the WHOLE span and was
 * refuted). PARTIAL accenting is the normal way Vietnamese is typed: 'phở bo',
 * 'bún bò hue', 'cà phê sữa da'. Under a whole-span test none of those agrees
 * with any banked surface, so the phrase was refused and SHREDDED into
 * confidently-wrong single tokens ('phở bo' → pho + avocado). Measured over
 * the vi gold corpus with exactly one word de-accented: 73 of 150 queries
 * changed grounding, 59 losing the right concept. So evidence is read where
 * the user actually supplied it — token by token. An accented token must
 * agree with the surface's token in the same position; a plain token asks
 * nothing, exactly as before.
 *
 * Language-neutral and list-free: nothing here knows Vietnamese exists. It
 * falls out of `diacriticFold` vs `canonicalFold` — see entity-identity.ts.
 * The accent-agreeing case also settles the collision the fold created: when
 * `bơ` and a hypothetical `bò` both fold to 'bo', typing `bò` admits only the
 * one that matches raw.
 */
export interface SurfaceSpelling {
  /** canonicalFold(form) — the key the recall arm matched on. */
  folded: string;
  /** diacriticFold(form) — the same form with its accents intact. */
  diacritic: string;
}

export function admitsAtExactTier(
  span: { folded: string; diacritic: string },
  spellings: readonly SurfaceSpelling[],
  /** Every ACCENT-FREE spelling the registry actually banks as a whole
   *  surface, as seen by this query. A plain token that appears here is a WORD
   *  the user spelled correctly, not a lazily de-accented one — see the
   *  accent-complete note in the rule below. */
  bankedPlainForms: ReadonlySet<string> = new Set(),
): boolean {
  // A FULLY PLAIN SPAN IS NOT A SPECIAL CASE (2026-08-09). This used to
  // return true immediately — "nothing accented ⇒ no evidence" — which is
  // right about ACCENTS and wrong about WORDS: a token the registry banks as
  // a complete accent-free surface of the request's language is a word the
  // user spelled, and the loop below already knows that (the accent-complete
  // arm). The shortcut simply denied it the chance to say so whenever the
  // WHOLE span happened to be plain, which is the commonest way a one-word
  // query arrives. Symptom: 'chay' (vegetarian, a banked vi word) also
  // exact-matched 'chảy' (runny) and a vegetarian-rice search came back
  // carrying a gooey constraint. Dropping the shortcut costs nothing for
  // 'pho'/'bo' — those are not banked plain forms, so every token still
  // 'continue's and the folded key decides exactly as before.
  const spanFolded = span.folded.split(' ');
  const spanTyped = span.diacritic.split(' ');
  return spellings.some((spelling) => {
    // Only a surface that actually matched THIS span's folded key can be its
    // exact match; the evidence set is wider than the match (it carries every
    // spelling the entity has) so the fold equality is re-checked here.
    if (spelling.folded !== span.folded) return false;
    const surface = spelling.diacritic.split(' ');
    // Token counts are equal whenever the folds are — accents never add or
    // remove a space. The guard is for the impossible case, and it falls back
    // to the whole-phrase comparison rather than inventing an alignment.
    if (
      surface.length !== spanTyped.length ||
      surface.length !== spanFolded.length
    ) {
      return spelling.diacritic === span.diacritic;
    }
    for (let i = 0; i < spanTyped.length; i++) {
      // Token typed WITHOUT accents ⇒ no evidence about this position ⇒ it
      // already matched on the fold and nothing more is asked of it.
      if (spanTyped[i] === spanFolded[i]) {
        // ACCENT-COMPLETE TOKEN. A plain token normally asks nothing — that is
        // what makes 'phở bo' reach phở bò. But when the registry banks that
        // exact accent-free string as a surface of its own, the token is a
        // WORD the user spelled completely, not an accent they skipped:
        // 'chay' (vegetarian) is banked; 'bo' is not. Without this, 'cơm chay'
        // (vegetarian rice) matches the scorched-rice surface 'cơm cháy'
        // through its second token and hands a diner a rice crust. The
        // discriminator is the DATA, not a word list of ours.
        if (!bankedPlainForms.has(spanTyped[i])) continue;
      }
      if (surface[i] !== spanTyped[i]) return false;
    }
    return true;
  });
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
