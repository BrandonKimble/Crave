/**
 * F2408 — THE ATTRIBUTING SAMPLE MUST REACH THE LANE IT MEASURES.
 *
 * `PREMOUNT_COMMIT_GRACE_MS = 48` is the boundary between "the law is satisfied" and a
 * logged violation, and its own docblock names the measurement that would attribute it:
 * the p99 `sinceAckMs` of a COMPLIANT post-flip first commit. That compliant sample used
 * to be wrapped in `if (__DEV__)` while the VIOLATION path was deliberately Release-capable
 * (the UIFrameSampler os_log sink). So the threshold deciding Release violations could only
 * ever be calibrated from DEV timings — the two halves sampled different worlds.
 *
 * THE RED CASE: 'the compliant sample reaches the Release sink'. Re-wrap the compliant log
 * in `if (__DEV__)` and it goes red, because in Release nothing is delivered.
 */
const logEvent = jest.fn();

// F4700/F5416 — THE PACK FLAKE, and why the third argument is gone.
//
// This mock carried `{ virtual: true }`. `react-native` is a REAL module, and `virtual` is
// for modules that do not exist: it registers the factory under the LITERAL specifier
// instead of the resolved path. When resolution of 'react-native' succeeded, the registry
// lookup went to the resolved path, missed the virtual entry, and loaded the real
// untransformed `node_modules/react-native/index.js` — which this hermetic node lane never
// transforms. The suite then died WHOLESALE ("Cannot use import statement outside a
// module"), losing all three tests with no assertion failing, at roughly 1 in 7 runs.
// That is the signature F4700 filed and F5416 quantified.
//
// Non-virtual is the fix and the sibling pattern: three other specs in this lane
// (route-entry-origin-single-staging, presentation-frame-chrome-clock,
// route-entry-origin-half-pop-tripwire) mock 'react-native' exactly this way and have never
// flaked. The factory fully replaces the module, so the real file is resolved but never
// executed.
jest.mock('react-native', () => ({
  NativeModules: {
    UIFrameSampler: {
      logEvent: (line: string) => logEvent(line),
    },
  },
}));

jest.mock('../../observability/crash-reporting', () => ({
  captureHandledError: jest.fn(),
}));

import {
  PREMOUNT_COMMIT_GRACE_MS,
  notePremountChildBodyFirstCommit,
  notePremountPresentationAck,
  notePremountPresentationFrame,
} from './premount-violation-probe';

const dev = globalThis as { __DEV__?: boolean };
const originalDev = dev.__DEV__;

/** Drive one switch to its visibility flip, then report a child's first Fabric commit. */
const runFlipThenFirstCommit = (switchId: number): void => {
  notePremountPresentationFrame(switchId, 'entry-1');
  notePremountPresentationAck(switchId);
  notePremountChildBodyFirstCommit({
    sceneKey: 'listDetail',
    entryId: 'entry-1',
    unitKey: `unit-${switchId}`,
  });
};

beforeEach(() => {
  logEvent.mockClear();
});

afterEach(() => {
  dev.__DEV__ = originalDev;
});

describe('premount probe — the grace window is calibrated from the world it polices (F2408)', () => {
  it('the compliant sample reaches the RELEASE sink', () => {
    dev.__DEV__ = false;
    runFlipThenFirstCommit(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const line = String(logEvent.mock.calls[0][0]);
    expect(line).toContain('[PREMOUNT] compliant');
    // The attributing field and the constant it must attribute travel together.
    expect(line).toMatch(/sinceAckMs=\d/);
    expect(line).toContain(`graceMs=${PREMOUNT_COMMIT_GRACE_MS}`);
  });

  it('a pre-flip build stays silent (the law satisfied is not a sample)', () => {
    dev.__DEV__ = false;
    notePremountPresentationFrame(2, 'entry-1');
    notePremountChildBodyFirstCommit({
      sceneKey: 'listDetail',
      entryId: 'entry-1',
      unitKey: 'unit-2',
    });
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('the sample is monotonic, so it is never negative', () => {
    dev.__DEV__ = false;
    runFlipThenFirstCommit(3);
    const sinceAckMs = Number(
      /sinceAckMs=(-?\d+(?:\.\d+)?)/.exec(String(logEvent.mock.calls[0][0]))?.[1]
    );
    expect(sinceAckMs).toBeGreaterThanOrEqual(0);
  });
});
