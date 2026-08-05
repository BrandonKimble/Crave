import {
  TRACK_NATIVE_CONTRACT_VERSION,
  TRACK_NATIVE_REQUIRED_CAPABILITIES,
  describeTrackNativeContractVerdict,
  resolveTrackNativeContractVerdict,
  trackNativeContractIsHealthy,
} from './track-native-contract';

const expected = {
  version: TRACK_NATIVE_CONTRACT_VERSION,
  capabilities: TRACK_NATIVE_REQUIRED_CAPABILITIES,
};

const goodReport = {
  contractVersion: TRACK_NATIVE_CONTRACT_VERSION,
  capabilities: [...TRACK_NATIVE_REQUIRED_CAPABILITIES],
};

describe('the native-contract verdict', () => {
  it('accepts a binary that speaks the exact contract', () => {
    const verdict = resolveTrackNativeContractVerdict(goodReport, expected);
    expect(verdict).toEqual({ status: 'ok', version: TRACK_NATIVE_CONTRACT_VERSION });
    expect(trackNativeContractIsHealthy(verdict)).toBe(true);
    expect(describeTrackNativeContractVerdict(verdict)).toBeNull();
  });

  it('a missing module is ABSENT, not a version failure', () => {
    expect(resolveTrackNativeContractVerdict(null, expected)).toEqual({ status: 'absent' });
    expect(resolveTrackNativeContractVerdict(undefined, expected)).toEqual({ status: 'absent' });
  });

  it('a binary predating the handshake is UNVERSIONED (diagnosed by absence)', () => {
    // The exact shape of every binary built before this change: the methods are
    // there, the constant is not.
    expect(
      resolveTrackNativeContractVerdict({ capabilities: ['snapToOutcome'] }, expected)
    ).toEqual({ status: 'unversioned' });
    // A non-numeric version is the same failure, not a silent pass.
    expect(resolveTrackNativeContractVerdict({ contractVersion: '2' }, expected)).toEqual({
      status: 'unversioned',
    });
    expect(resolveTrackNativeContractVerdict({ contractVersion: Number.NaN }, expected)).toEqual({
      status: 'unversioned',
    });
  });

  it('separates STALE (rebuild) from AHEAD (reload JS) — opposite fixes', () => {
    const stale = resolveTrackNativeContractVerdict(
      { ...goodReport, contractVersion: 1 },
      expected
    );
    expect(stale).toEqual({ status: 'stale', found: 1, expected: TRACK_NATIVE_CONTRACT_VERSION });
    const ahead = resolveTrackNativeContractVerdict(
      { ...goodReport, contractVersion: TRACK_NATIVE_CONTRACT_VERSION + 1 },
      expected
    );
    expect(ahead).toEqual({
      status: 'ahead',
      found: TRACK_NATIVE_CONTRACT_VERSION + 1,
      expected: TRACK_NATIVE_CONTRACT_VERSION,
    });
    expect(describeTrackNativeContractVerdict(stale)).toContain('rebuild and reinstall');
    expect(describeTrackNativeContractVerdict(ahead)).toContain('reload JS');
    expect(describeTrackNativeContractVerdict(ahead)).not.toContain('rebuild and reinstall');
  });

  it('a matching version with a missing capability still fails (the version is a CLAIM)', () => {
    const verdict = resolveTrackNativeContractVerdict(
      { ...goodReport, capabilities: ['snapToOutcome', 'settleEvent'] },
      expected
    );
    expect(verdict.status).toBe('missing-capabilities');
    expect(verdict).toMatchObject({
      missing: ['hiddenIntent', 'generationStampedEdge', 'externalBottomInset'],
    });
    expect(trackNativeContractIsHealthy(verdict)).toBe(false);
  });

  it('a malformed capability list is treated as declaring nothing', () => {
    expect(
      resolveTrackNativeContractVerdict({ ...goodReport, capabilities: 'all' }, expected)
    ).toMatchObject({ status: 'missing-capabilities' });
    expect(
      resolveTrackNativeContractVerdict({ ...goodReport, capabilities: [1, 2] }, expected)
    ).toMatchObject({ status: 'missing-capabilities' });
  });

  it('every non-ok verdict produces an ACTIONABLE message; ok produces none', () => {
    const verdicts = [
      resolveTrackNativeContractVerdict(null, expected),
      resolveTrackNativeContractVerdict({}, expected),
      resolveTrackNativeContractVerdict({ ...goodReport, contractVersion: 1 }, expected),
      resolveTrackNativeContractVerdict({ ...goodReport, contractVersion: 99 }, expected),
      resolveTrackNativeContractVerdict({ ...goodReport, capabilities: [] }, expected),
    ];
    verdicts.forEach((verdict) => {
      const message = describeTrackNativeContractVerdict(verdict);
      expect(message).not.toBeNull();
      expect(message).toContain('[TRACK-CONTRACT]');
      expect(message).toContain('FIX:');
      expect(trackNativeContractIsHealthy(verdict)).toBe(false);
    });
  });

  it('pins the version the native header states (bump both or go RED)', () => {
    // The C suite asserts TRACK_SCROLL_CONTRACT_VERSION == 2; this is the other
    // half of the equality. A one-sided bump fails here.
    expect(TRACK_NATIVE_CONTRACT_VERSION).toBe(2);
  });
});
