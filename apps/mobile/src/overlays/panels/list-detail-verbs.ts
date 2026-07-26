import type { UserListViewerRole } from '../../services/user-lists';

/**
 * THE list-verbs model (list-detail choreography leg, Job 2): one source-agnostic
 * capability derivation for every list-detail surface — own lists, another user's
 * profile lists, and app-curated (home) lists. The ellipsis menu, header seat, and
 * row affordances RENDER from this model; no panel re-derives per-source behavior.
 *
 * Sources:
 * - 'favorites'  — a favorite_lists row (own, collaborator, or viewed via profile/
 *                  share slug). Role does the work: owner unlocks curation verbs,
 *                  owner/collaborator unlock reorder + add-photo.
 * - 'curated'    — an app-curated list (GET /home/lists/:id). Read-only projection:
 *                  share (public /cl link) and save-a-copy only.
 * - virtual All lists ('all:restaurants'/'all:dishes') have no stored row: no menu
 *   verbs at all (share/edit/delete are row-backed), but add-photo stays role-based.
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
}: {
  source: ListDetailVerbSource;
  viewerRole: UserListViewerRole | undefined;
  isVirtualAll: boolean;
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
    canDelete: isConcrete && isOwner,
    canToggleProfileVisibility: isConcrete && isOwner,
    canTogglePhotoSource: isConcrete && isOwner,
    canPin: isConcrete && isOwner,
    canReorder: isConcrete && isEditor,
    // §7.1: role-based, and the virtual All list (role 'owner') qualifies too.
    canAddPhoto: isEditor,
  };
};
