// S4b: analytics DECORATION (submissionSource, typedPrefix context) is trigger-known but
// the resolve kick comes from the reconciler, which fires SYNCHRONOUSLY inside the tuple
// write. Triggers therefore register a PENDING decoration immediately before their
// write; the reconciler takes it (once) at the kick that write produces. Never a
// cache-key input — a cache hit legitimately owes no analytics request.

export type SearchRequestDecoration = {
  submissionSource?: string;
  submissionContext?: Record<string, unknown>;
};

let pending: SearchRequestDecoration | null = null;

export const registerPendingSearchRequestDecoration = (
  decoration: SearchRequestDecoration
): void => {
  pending = decoration;
};

export const clearPendingSearchRequestDecoration = (): void => {
  pending = null;
};

export const takePendingSearchRequestDecoration = (): SearchRequestDecoration | undefined => {
  const decoration = pending;
  pending = null;
  return decoration ?? undefined;
};
