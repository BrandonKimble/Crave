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
  // Nothing accented anywhere in the span ⇒ no evidence ⇒ the folded key
  // decides, exactly as it always did.
  if (span.diacritic === span.folded) return true;
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
  const accepted: EntitySpanGroup[] = [];
  for (const group of groups) {
    const overlaps = accepted.some(
      (a) => group.start < a.end && group.end > a.start,
    );
    if (!overlaps) accepted.push(group);
  }
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
