import { resolveOnDemandNoticeText } from './on-demand-notice-copy';

// ENGINE-COVERAGE notice re-key parity (markets extermination leg 2).
// Old law → new law mapping:
//   covered      ⇔ collectableMarketKeys.length > 0  →  engineCoverageShare > 0
//   area label   ⇔ verdict → displayPlaceName/candidateLocalityName chain
//                →  verdict → displayPlaceName (catalog header) only
//   multi-market "zoom out" tie arm → DEAD (ground coverage has no tie state)

describe('resolveOnDemandNoticeText (engine-coverage re-key)', () => {
  it('queued arm: verdict-first area label, ETA suffix', () => {
    const text = resolveOnDemandNoticeText({
      metadata: {
        onDemandQueued: true,
        onDemandEtaMs: 30 * 60000,
        displayPlaceName: 'Austin',
        engineCoverageShare: 0.9,
      },
      verdictAreaLabel: 'East Austin',
      onDemandNoticeQuery: 'khachapuri',
    });
    expect(text).toContain('for khachapuri');
    expect(text).toContain('grow coverage in East Austin');
    expect(text).toContain('Check back in 30 min.');
  });

  it('queued arm pre-commit: falls back to the catalog header name, then "this area"', () => {
    const withName = resolveOnDemandNoticeText({
      metadata: { onDemandQueued: true, displayPlaceName: 'Austin' },
      verdictAreaLabel: null,
      onDemandNoticeQuery: '',
    });
    expect(withName).toContain('grow coverage in Austin');
    const bare = resolveOnDemandNoticeText({
      metadata: { onDemandQueued: true },
      verdictAreaLabel: null,
      onDemandNoticeQuery: '',
    });
    expect(bare).toContain('grow coverage in this area');
  });

  it('a committed straddle verdict ("this area") out-votes the metadata name', () => {
    const text = resolveOnDemandNoticeText({
      metadata: { onDemandQueued: true, displayPlaceName: 'Austin' },
      verdictAreaLabel: 'this area',
      onDemandNoticeQuery: '',
    });
    expect(text).toContain('grow coverage in this area');
    expect(text).not.toContain('Austin');
  });

  it('UNCOVERED state (share 0 or absent, nothing queued): growth copy with the verdict/header label', () => {
    const text = resolveOnDemandNoticeText({
      metadata: { engineCoverageShare: 0, displayPlaceName: 'Marfa' },
      verdictAreaLabel: null,
      onDemandNoticeQuery: 'kolaches',
    });
    expect(text).toContain('for kolaches');
    expect(text).toContain('grow coverage in Marfa');
    const absent = resolveOnDemandNoticeText({
      metadata: {},
      verdictAreaLabel: 'Marfa',
      onDemandNoticeQuery: '',
    });
    expect(absent).toContain('grow coverage in Marfa');
  });

  it('COVERED (share > 0) with nothing queued renders NO notice', () => {
    expect(
      resolveOnDemandNoticeText({
        metadata: { engineCoverageShare: 0.4, displayPlaceName: 'Austin' },
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
