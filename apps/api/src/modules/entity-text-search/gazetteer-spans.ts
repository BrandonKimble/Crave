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
