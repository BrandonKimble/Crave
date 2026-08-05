export type SearchFreezeClassification = 'none' | 'recovery' | 'close-handoff';

/** F1735: the five surface-redraw inputs this used to fold in (chrome/preflight freeze,
 *  active, chrome-deferred, commit-span pressure) were pinned false by construction —
 *  the redraw coordinator could never leave 'idle'. Response-frame freeze is the one
 *  live recovery input. */
export const resolveSearchRecoveryFreezeClassification = ({
  isResponseFrameFreezeActive,
}: {
  isResponseFrameFreezeActive?: boolean;
}): SearchFreezeClassification => (isResponseFrameFreezeActive ? 'recovery' : 'none');

export const resolveSearchCloseHandoffFreezeClassification = ({
  isCloseHandoffActive,
}: {
  isCloseHandoffActive: boolean;
}): SearchFreezeClassification => (isCloseHandoffActive ? 'close-handoff' : 'none');
