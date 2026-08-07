// F2950 — ONE home for the listDetail cache identities. The meta key and the results
// key were each minted at the query site and re-spelled by hand at four invalidation
// sites (with three spellings, one — handleCopyInvite's `['listDetail', resolvedListId]`
// — that could never match a slug-opened list). A cache identity is a FACT with one
// home, not a convention re-spelled at each caller.

export type ListDetailMetaKeyInput = {
  isCurated: boolean;
  listIdParam: string | null;
  shareSlug: string | null;
};

// Mirrors the query registration: curated lists key on `curated:<listId>`, tap-opened
// lists on the raw listId, and slug-opened lists on `slug:<shareSlug>`.
export const listDetailMetaQueryKey = ({
  isCurated,
  listIdParam,
  shareSlug,
}: ListDetailMetaKeyInput): readonly [string, string | null] =>
  [
    'listDetail',
    isCurated ? `curated:${listIdParam}` : (listIdParam ?? `slug:${shareSlug}`),
  ] as const;

export type ListDetailResultsKeyInput = {
  isCurated: boolean;
  resolvedListId: string | null;
};

export const listDetailResultsQueryKey = ({
  isCurated,
  resolvedListId,
}: ListDetailResultsKeyInput): readonly [string, string | null] =>
  ['listDetailResults', isCurated ? `curated:${resolvedListId}` : resolvedListId] as const;
