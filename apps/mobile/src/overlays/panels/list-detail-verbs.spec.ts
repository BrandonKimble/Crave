/**
 * The list-verbs model (list-detail choreography leg, Job 2): ONE capability
 * derivation across own / profile / curated lists. The per-source capability
 * table is the contract — a panel must never re-derive these per surface.
 */
import { deriveListDetailVerbs } from './list-detail-verbs';

describe('deriveListDetailVerbs — the source-agnostic capability table', () => {
  it('curated: share + save-a-copy only (read-only projection)', () => {
    expect(
      deriveListDetailVerbs({ source: 'curated', viewerRole: 'viewer', isVirtualAll: false })
    ).toEqual({
      canShare: true,
      canSaveCopy: true,
      canEditMeta: false,
      canDelete: false,
      canToggleProfileVisibility: false,
      canTogglePhotoSource: false,
      canPin: false,
      canReorder: false,
      canAddPhoto: false,
    });
  });

  it('own list (owner): every curation verb, no save-a-copy', () => {
    expect(
      deriveListDetailVerbs({ source: 'favorites', viewerRole: 'owner', isVirtualAll: false })
    ).toEqual({
      canShare: true,
      canSaveCopy: false,
      canEditMeta: true,
      canDelete: true,
      canToggleProfileVisibility: true,
      canTogglePhotoSource: true,
      canPin: true,
      canReorder: true,
      canAddPhoto: true,
    });
  });

  it('collaborator: reorder + add-photo + share, no owner curation verbs', () => {
    const verbs = deriveListDetailVerbs({
      source: 'favorites',
      viewerRole: 'collaborator',
      isVirtualAll: false,
    });
    expect(verbs.canReorder).toBe(true);
    expect(verbs.canAddPhoto).toBe(true);
    expect(verbs.canShare).toBe(true);
    expect(verbs.canEditMeta).toBe(false);
    expect(verbs.canDelete).toBe(false);
    expect(verbs.canPin).toBe(false);
    expect(verbs.canSaveCopy).toBe(false);
  });

  it("viewer on another user's list (profile lists): share only", () => {
    const verbs = deriveListDetailVerbs({
      source: 'favorites',
      viewerRole: 'viewer',
      isVirtualAll: false,
    });
    expect(verbs.canShare).toBe(true);
    expect(verbs.canReorder).toBe(false);
    expect(verbs.canAddPhoto).toBe(false);
    expect(verbs.canEditMeta).toBe(false);
    expect(verbs.canSaveCopy).toBe(false);
  });

  it('virtual All lists: no row-backed menu verbs, but add-photo stays role-based', () => {
    const verbs = deriveListDetailVerbs({
      source: 'favorites',
      viewerRole: 'owner',
      isVirtualAll: true,
    });
    expect(verbs.canShare).toBe(false);
    expect(verbs.canEditMeta).toBe(false);
    expect(verbs.canDelete).toBe(false);
    expect(verbs.canReorder).toBe(false);
    expect(verbs.canAddPhoto).toBe(true);
  });
});
