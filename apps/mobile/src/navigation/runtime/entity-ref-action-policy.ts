// S-D.1 (plans/s-d-one-desire-entitylink.md, plans/s-c5-restaurant-stack-fact.md §S-D) —
// THE one entity→action policy. Every surface that renders a tappable entity (poll comment
// spans, favorites rows, autocomplete rows, notifications) resolves what a tap MEANS through
// this single function; the per-surface dispatch forks it replaces were the policy encoded
// 4× (PollDetailPanel span fork, bookmarks/profile row copies, the selectedEntityId
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
  | 'restaurant'
  | 'food'
  | 'food_attribute'
  | 'restaurant_attribute'
  | 'person'
  | 'list';

export type EntityRef = {
  entityId: string;
  entityType: EntityRefType;
  /** Display label (a span's resolved name, a row's title). Seeds headers/sheet titles. */
  label: string;
  /** Lists only: which results tab the list world auto-selects. */
  listType?: 'restaurant' | 'dish';
};

export type EntityRefAction =
  | { kind: 'restaurantWorld'; restaurantId: string; restaurantName: string }
  | {
      kind: 'entityDesire';
      entityId: string;
      entityType: 'food' | 'food_attribute' | 'restaurant_attribute';
      label: string;
    }
  | { kind: 'pushScene'; scene: 'userProfile'; params: { userId: string } }
  | {
      /** Favorites-as-search (§5.2): the list world. When the listDetail hybrid page lands
       *  (trigger-nav verdict), this arm becomes its push — in ONE place. */
      kind: 'listWorld';
      listId: string;
      listType: 'restaurant' | 'dish';
      label: string;
    };

export const resolveEntityRefAction = (ref: EntityRef): EntityRefAction => {
  switch (ref.entityType) {
    case 'restaurant':
      return { kind: 'restaurantWorld', restaurantId: ref.entityId, restaurantName: ref.label };
    case 'food':
    case 'food_attribute':
    case 'restaurant_attribute':
      return {
        kind: 'entityDesire',
        entityId: ref.entityId,
        entityType: ref.entityType,
        label: ref.label,
      };
    case 'person':
      return { kind: 'pushScene', scene: 'userProfile', params: { userId: ref.entityId } };
    case 'list':
      return {
        kind: 'listWorld',
        listId: ref.entityId,
        listType: ref.listType ?? 'restaurant',
        label: ref.label,
      };
  }
};
