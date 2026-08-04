import type { UserListKind, UserListViewerRole } from '../../services/user-lists';

/**
 * THE list-verbs model (list-detail choreography leg, Job 2): one source-agnostic
 * capability derivation for every list-detail surface — own lists, another user's
 * profile lists, and app-curated (home) lists. The ellipsis menu, header seat, and
 * row affordances RENDER from this model; no panel re-derives per-source behavior.
 *
 * Sources:
 * - 'favorites'  — a user_lists row (own, collaborator, or viewed via profile/
 *                  share slug). Role does the work: owner unlocks curation verbs,
 *                  owner/collaborator unlock reorder + add-photo.
 * - 'curated'    — an app-curated list (GET /home/lists/:id). Read-only projection:
 *                  share (public /cl link) and save-a-copy only.
 * - virtual All lists ('all:restaurants'/'all:dishes') have no stored row: no menu
 *   verbs at all (share/edit/delete are row-backed), but add-photo stays role-based.
 *
 * F1463: `kind` is an INPUT because the one-per-user favorites list is UNDELETABLE
 * (server-guarded). ListsPanel knew that and suppressed Delete locally; the model did not,
 * so ListDetailPanel rendered Delete from `canDelete` for the very same list and ate a
 * server refusal. The rule lives HERE now, once — and because `kind` is required, a surface
 * cannot ask for verbs without stating which list it is asking about.
 */
export type ListDetailVerbSource = 'favorites' | 'curated';

export type ListDetailVerbs = {
  /** Share via the universal share modal (slug lane for favorites, /cl for curated). */
  canShare: boolean;
  /** Copy this list's CURRENT items into a new list the viewer owns (curated only). */
  canSaveCopy: boolean;
  /** listEdit panel: name / description / visibility. */
  canEditMeta: boolean;
  canDelete: boolean;
  /** 'Add to profile' / 'Remove from profile' visibility flip. */
  canToggleProfileVisibility: boolean;
  /** 'Use your photos' / 'Use Crave photos' tile-gallery source flip. */
  canTogglePhotoSource: boolean;
  canPin: boolean;
  /** Enter edit mode / reorder rows (batch order PATCH). */
  canReorder: boolean;
  /** Add-photo lead tile on row photo strips. */
  canAddPhoto: boolean;
};

export const deriveListDetailVerbs = ({
  source,
  viewerRole,
  isVirtualAll,
  kind,
}: {
  source: ListDetailVerbSource;
  viewerRole: UserListViewerRole | undefined;
  isVirtualAll: boolean;
  /** The stored row's kind — `undefined` for curated / virtual All (no row to have a kind). */
  kind: UserListKind | undefined;
}): ListDetailVerbs => {
  if (source === 'curated') {
    return {
      canShare: true,
      canSaveCopy: true,
      canEditMeta: false,
      canDelete: false,
      canToggleProfileVisibility: false,
      canTogglePhotoSource: false,
      canPin: false,
      canReorder: false,
      canAddPhoto: false,
    };
  }
  const isOwner = viewerRole === 'owner';
  const isEditor = isOwner || viewerRole === 'collaborator';
  const isConcrete = !isVirtualAll;
  return {
    // Share for every role — but only on a CONCRETE row (virtual All has no slug).
    canShare: isConcrete,
    canSaveCopy: false,
    canEditMeta: isConcrete && isOwner,
    // F1463: favorites is one-per-user and server-guarded undeletable — the menu never
    // offers what the API refuses, on EVERY surface that renders from this model.
    canDelete: isConcrete && isOwner && kind !== 'favorites',
    canToggleProfileVisibility: isConcrete && isOwner,
    canTogglePhotoSource: isConcrete && isOwner,
    canPin: isConcrete && isOwner,
    canReorder: isConcrete && isEditor,
    // §7.1: role-based, and the virtual All list (role 'owner') qualifies too.
    canAddPhoto: isEditor,
  };
};
