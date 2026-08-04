import { create } from 'zustand';

/**
 * THE DELETED-ACCOUNT STORY.
 *
 * An account inside its 30-day deletion window is refused by every
 * authenticated route (the server's ACCOUNT_DELETED verdict). Without a home
 * for that fact, the refusal arrived as a generic "something went wrong" on
 * whatever screen happened to be mounted — repeated per request, and never
 * mentioning that the account is recoverable or how.
 *
 * So it is announced ONCE, from the single API chokepoint, exactly like the
 * session and entitlement lapses beside it. The app root reads this and shows
 * the restore takeover; individual callers stay quiet, because there is one
 * story to tell, not a modal per failed request.
 *
 * `purgeDueAt` rides along because the copy needs it: "you have N days left"
 * is the whole reason a person would choose restore over walking away, and it
 * is a server fact — the client must not compute a deadline of its own.
 */
interface AccountDeletedState {
  deleted: boolean;
  /** ISO instant after which restore is no longer possible. */
  purgeDueAt: string | null;
  announceDeleted: (purgeDueAt: string | null) => void;
  clearDeleted: () => void;
}

export const useAccountDeletedStore = create<AccountDeletedState>((set) => ({
  deleted: false,
  purgeDueAt: null,
  announceDeleted: (purgeDueAt) => set({ deleted: true, purgeDueAt }),
  clearDeleted: () => set({ deleted: false, purgeDueAt: null }),
}));

/** Whole days left to restore, for the copy. Never negative. */
export const daysUntilPurge = (purgeDueAt: string | null): number | null => {
  if (!purgeDueAt) return null;
  const ms = new Date(purgeDueAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
};
