import {
  getSceneFoundationSpec,
  resolveSceneLoadingMaterial,
} from '../../../navigation/runtime/scene-foundation-spec';
import {
  markPollsToggleSeamPress,
  reportPollsToggleSeamSlicePainted,
  resetPollsToggleSeamProbeForTest,
  resolvePollsToggleSeamAwaitingMaterial,
} from './polls-toggle-seam';

/**
 * OA9 falsifier suite — the toggle-seam pattern (variant (a) cold / variant (b)
 * refetch) as DATA in the one material resolver, the polls awaiting face, and the
 * [PERF] probe's honesty. Each falsifier is RED-provable by the named mutation.
 */
describe('resolveSceneLoadingMaterial toggle-seam variants (OA9)', () => {
  // Falsifier: variant selection is data-driven — (strip basis x seam phase), one
  // function. RED by mutating the resolver's withStripHoles expression.
  it('in-list strip: cold face carries the strip pill holes (variant a)', () => {
    expect(resolveSceneLoadingMaterial('listDetail')).toEqual(
      expect.objectContaining({ withStripHoles: true })
    );
    expect(resolveSceneLoadingMaterial('listDetail', 'cold')).toEqual(
      expect.objectContaining({ withStripHoles: true })
    );
  });

  it('in-list strip: refetch face never mints holes — the live strip stays (variant b)', () => {
    expect(resolveSceneLoadingMaterial('listDetail', 'refetch')).toEqual(
      expect.objectContaining({ withStripHoles: false })
    );
  });

  it('header strip: no holes on either seam (the strip is chrome, always live)', () => {
    expect(resolveSceneLoadingMaterial('polls', 'cold')?.withStripHoles).toBe(false);
    expect(resolveSceneLoadingMaterial('polls', 'refetch')?.withStripHoles).toBe(false);
  });

  it('the seam changes LAYOUT only, never material (OA9 placeholder policy)', () => {
    expect(resolveSceneLoadingMaterial('listDetail', 'refetch')?.rowType).toBe(
      resolveSceneLoadingMaterial('listDetail', 'cold')?.rowType
    );
    expect(resolveSceneLoadingMaterial('polls', 'refetch')?.rowType).toBe(
      resolveSceneLoadingMaterial('polls', 'cold')?.rowType
    );
  });
});

describe('polls toggle-seam awaiting face (OA9 step 3)', () => {
  // Falsifier: the polls seam never renders the bare-white face while the primitive
  // is armed. RED by mutating resolvePollsToggleSeamAwaitingMaterial's armed arm to
  // return null.
  it('armed: the awaiting window paints the refetch material, not bare white', () => {
    const material = resolvePollsToggleSeamAwaitingMaterial(true);
    expect(material).not.toBeNull();
    expect(material).toEqual(resolveSceneLoadingMaterial('polls', 'refetch'));
  });

  // Falsifier: variant (b) keeps the strip mounted and interactive during the
  // awaiting window. Pure decision spec (the render lane does not mount the
  // persistent header host): polls declares strip 'header' — the strip is chrome
  // mounted independently of the body the face replaces — AND the face never mints
  // strip holes over it. RED by flipping either declaration.
  it('variant (b) leaves the live header strip alone', () => {
    expect(getSceneFoundationSpec('polls')?.strip).toBe('header');
    expect(resolvePollsToggleSeamAwaitingMaterial(true)?.withStripHoles).toBe(false);
  });

  it('disarmed: the legacy bare-white face (the A/B control arm)', () => {
    expect(resolvePollsToggleSeamAwaitingMaterial(false)).toBeNull();
  });
});

describe('polls toggle-seam [PERF] probe honesty', () => {
  beforeEach(() => {
    resetPollsToggleSeamProbeForTest();
  });

  it('measures press -> first real-row layout', () => {
    markPollsToggleSeamPress(1000);
    expect(reportPollsToggleSeamSlicePainted(5, 1420)).toBe(420);
  });

  it('a report with no pending press is inert', () => {
    expect(reportPollsToggleSeamSlicePainted(5, 1420)).toBeNull();
  });

  // Falsifier: the probe cannot report green when only the skeleton painted. The
  // skeleton face never reaches the reporter, and a zero-count report neither
  // measures NOR consumes the press mark. RED by removing the paintedPollCount
  // guard in reportPollsToggleSeamSlicePainted.
  it('a zero-row paint cannot produce a measurement and keeps the press pending', () => {
    markPollsToggleSeamPress(1000);
    expect(reportPollsToggleSeamSlicePainted(0, 1200)).toBeNull();
    expect(reportPollsToggleSeamSlicePainted(3, 1500)).toBe(500);
  });

  it('a tap burst re-anchors on the last press', () => {
    markPollsToggleSeamPress(1000);
    markPollsToggleSeamPress(1300);
    expect(reportPollsToggleSeamSlicePainted(2, 1600)).toBe(300);
  });

  it('a measurement consumes the mark — one report per press', () => {
    markPollsToggleSeamPress(1000);
    expect(reportPollsToggleSeamSlicePainted(2, 1400)).toBe(400);
    expect(reportPollsToggleSeamSlicePainted(2, 1900)).toBeNull();
  });
});
