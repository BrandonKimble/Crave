// S-D.1 (plans/s-d-one-desire-entitylink.md, plans/s-c5-restaurant-stack-fact.md §S-D) —
// THE one entity→action policy. Every surface that renders a tappable entity (poll comment
// spans, favorites rows, autocomplete rows, notifications) resolves what a tap MEANS through
// this single function; the per-surface dispatch forks it replaces were the policy encoded
// 4× (PollDetailPanel span fork, lists/profile row copies, the selectedEntityId
// submission triplication, the launch-intent restaurant arm).
//
// The action vocabulary is SEMANTIC, not mechanical:
// - restaurantWorld: the warm-profile composite (seed the profile header + committed
//   restaurant-only search whose auto-open presents the profile). NOT a bare push — the
//   profile rides the search world. Executed via the restaurant launch lane until S-D.4
//   dissolves LaunchIntent.
// - entityDesire: the skip-LLM entity search (BE receives entityType and skips the LLM).
// - pushScene: plain child pushes for non-search entities (people, lists) — pure nav,
//   no world, no desire.

export type EntityRefType =
  | 'place'
  | 'item'
  | 'item_attribute'
  | 'place_attribute'
  | 'ingredient'
  | 'person'
  | 'list';

export type EntityRef = {
  entityId: string;
  entityType: EntityRefType;
  /** Display label (a span's resolved name, a row's title). Seeds headers/sheet titles. */
  label: string;
  /**
   * Lists only (wave-4 §3): the list's side, known at every tap site (home tiles,
   * profile rows, messaging cards). Present ⇒ the tap runs the full list WORLD
   * (favorites-as-search); absent ⇒ plain push with a dev bark (never a silent
   * half-world).
   */
  listType?: 'restaurant' | 'dish' | null;
  /** Lists only: the list owner's userId when opening from ANOTHER user's surface
   *  (profile gallery) — scopes virtual-All unions and viewer-role resolution. */
  targetUserId?: string | null;
  /** Lists only: 'curated' = an app-curated list (home shelves) — the listWorld
   *  composite rides the SAME choreography with the curated fetch seam. */
  listSource?: 'curated' | null;
};

export type EntityRefAction =
  | { kind: 'restaurantWorld'; placeId: string; placeName: string }
  | {
      kind: 'entityDesire';
      entityId: string;
      entityType: 'item' | 'item_attribute' | 'place_attribute' | 'ingredient';
      label: string;
    }
  | { kind: 'pushScene'; scene: 'userProfile'; params: { userId: string } }
  | { kind: 'pushScene'; scene: 'listDetail'; params: { listId: string; title: string } }
  | {
      /** Wave-4 §3 (favorites-as-search restored): push listDetail AND run the list
       *  world — the composite verb a48e96ef had, now with five mouths. */
      kind: 'listWorld';
      listId: string;
      listType: 'restaurant' | 'dish';
      title: string;
      targetUserId?: string | null;
      /** RT-18 access material (slug opens) — rides to the world fetch, never identity. */
      shareSlug?: string | null;
      /** 'curated' = app-curated list — same composite, curated fetch seam. Identity-
       *  relevant (curated ids and favorites ids are different namespaces). */
      source?: 'curated' | null;
      /** Strip 'world' flip: a re-slice dispatch carries the new slice — the launch
       *  writes it into filterVariant (cause list_reslice), so the reconciler re-slices
       *  the world (map + cards). Absent on the initial enter (server defaults apply). */
      slice?: {
        sort?: 'custom' | 'best' | 'recent';
        openNow?: boolean;
        priceLevels?: number[];
        cityPlaceId?: string | null;
      };
    };

export const resolveEntityRefAction = (ref: EntityRef): EntityRefAction => {
  switch (ref.entityType) {
    case 'place':
      return { kind: 'restaurantWorld', placeId: ref.entityId, placeName: ref.label };
    case 'item':
    case 'item_attribute':
    case 'place_attribute':
    case 'ingredient':
      return {
        kind: 'entityDesire',
        entityId: ref.entityId,
        entityType: ref.entityType,
        label: ref.label,
      };
    case 'person':
      return { kind: 'pushScene', scene: 'userProfile', params: { userId: ref.entityId } };
    case 'list': {
      // Wave-4 §3: the list tap runs the FULL WORLD (registry §1: "OPEN fires the
      // shared search flow") — push + desire tuple, the composite the W1-slice-4 flip
      // unplugged. The tap's label still WARM-SEEDS the persistent header (leg 9).
      if (ref.listType === 'restaurant' || ref.listType === 'dish') {
        return {
          kind: 'listWorld',
          listId: ref.entityId,
          listType: ref.listType,
          title: ref.label,
          targetUserId: ref.targetUserId ?? null,
          source: ref.listSource ?? null,
        };
      }
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.error(
          `[EntityRef] list tap for '${ref.label}' carries no listType — falling back ` +
            `to a plain push WITHOUT the search world. Pass listType at the tap site.`
        );
      }
      return {
        kind: 'pushScene',
        scene: 'listDetail',
        params: { listId: ref.entityId, title: ref.label },
      };
    }
  }
};
