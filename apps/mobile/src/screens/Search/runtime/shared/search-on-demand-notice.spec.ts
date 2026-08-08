import { resolveOnDemandNoticeText } from './on-demand-notice-copy';

// ENGINE-COVERAGE notice re-key parity (markets extermination leg 2), under
// the ONE-NAMING-AUTHORITY cutover (2026-08-08): the server's
// displayPlaceName fallback is DELETED — the area label comes from the
// CLIENT verdict alone, and before the store's first commit the copy says
// "this area". These fixtures deliberately carry NO server name to hand-feed
// (F9963: the old suite fed a field no producer could emit, keeping dead
// code green).

describe('resolveOnDemandNoticeText (one naming authority)', () => {
  it('queued arm: the client verdict labels the area, ETA suffix', () => {
    const text = resolveOnDemandNoticeText({
      metadata: {
        onDemandQueued: true,
        onDemandEtaMs: 30 * 60000,
        engineCoverageShare: 0.9,
      },
      verdictAreaLabel: 'East Austin',
      onDemandNoticeQuery: 'khachapuri',
    });
    expect(text).toContain('for khachapuri');
    expect(text).toContain('grow coverage in East Austin');
    expect(text).toContain('Check back in 30 min.');
  });

  it('queued arm pre-commit (no verdict yet): "this area" — never a stale server name', () => {
    const bare = resolveOnDemandNoticeText({
      metadata: { onDemandQueued: true },
      verdictAreaLabel: null,
      onDemandNoticeQuery: '',
    });
    expect(bare).toContain('grow coverage in this area');
  });

  it('a committed "this area" verdict renders as itself', () => {
    const text = resolveOnDemandNoticeText({
      metadata: { onDemandQueued: true },
      verdictAreaLabel: 'this area',
      onDemandNoticeQuery: '',
    });
    expect(text).toContain('grow coverage in this area');
  });

  it('UNCOVERED state (share 0, nothing queued): growth copy with the verdict label', () => {
    const text = resolveOnDemandNoticeText({
      metadata: { engineCoverageShare: 0 },
      verdictAreaLabel: 'Marfa',
      onDemandNoticeQuery: 'kolaches',
    });
    expect(text).toContain('for kolaches');
    expect(text).toContain('grow coverage in Marfa');
  });

  it('COVERED (share > 0) with nothing queued renders NO notice', () => {
    expect(
      resolveOnDemandNoticeText({
        metadata: { engineCoverageShare: 0.4 },
        verdictAreaLabel: 'Austin',
        onDemandNoticeQuery: 'tacos',
      })
    ).toBeNull();
  });

  it('uncovered with NO label at all stays silent (no lying area name)', () => {
    expect(
      resolveOnDemandNoticeText({
        metadata: { engineCoverageShare: 0 },
        verdictAreaLabel: null,
        onDemandNoticeQuery: '',
      })
    ).toBeNull();
  });
});
