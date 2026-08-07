/**
 * THREE STATES NEED THREE RENDERABLE ANSWERS (F4509).
 *
 * The profile sections are four `useQuery` calls taking
 * `enabled: enabled && activeSection === '<key>'`. In react-query v5 a DISABLED query
 * reports `status: 'pending'` — so a body that branches on `isPending` alone cannot
 * tell "gated off" from "in flight", and renders a spinner that never resolves and
 * never errors. The window is reachable by construction, not by accident: ProfilePanel
 * MOUNTS the body on `sceneReady && userId != null` and ENABLES it on a different
 * expression (`dataLaneReady && shouldRenderExpandedContent && userId != null`), so a
 * mounted-and-disabled body is a state the parent can produce and the child had no
 * vocabulary for. Its violation produced a hang rather than a crash, which is the worst
 * kind of caller-must-remember.
 *
 * Collapsing gated into loading is what made the hang possible, so the fix is to make
 * the third state REPRESENTABLE and to decide it in one place all four sections share
 * — rather than in four hand-written ladders that were free to disagree.
 */
export type ProfileSectionBodyState = 'gated' | 'loading' | 'failed' | 'empty' | 'rows';

export const resolveProfileSectionBodyState = ({
  enabled,
  isPending,
  isError,
  rowCount,
}: {
  /** The section's query is switched on (active section AND the parent's data lane). */
  enabled: boolean;
  isPending: boolean;
  isError: boolean;
  rowCount: number;
}): ProfileSectionBodyState => {
  // FIRST, and this is the whole finding: a gated query is not a loading one.
  if (!enabled) {
    return 'gated';
  }
  if (isPending) {
    return 'loading';
  }
  if (isError) {
    return 'failed';
  }
  return rowCount === 0 ? 'empty' : 'rows';
};
