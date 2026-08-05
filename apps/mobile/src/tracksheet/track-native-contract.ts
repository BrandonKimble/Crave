// ─── THE NATIVE-CONTRACT GUARD ────────────────────────────────────────────────
//
// THE FAILURE THIS EXISTS TO END. A JS bundle reloads in seconds; the binary
// under it is rebuilt and reinstalled by hand. When they diverge, every symptom
// is a SILENCE: a method that isn't there resolves nothing, so a command never
// completes; an event that is never emitted leaves the fence pending, the
// reveal waiting out its 700ms deadline, and the presented flip gated forever.
// The app LIMPS. That is strictly worse than a crash, because nothing names the
// cause and the reader debugging it reads correct JS against a binary that
// cannot answer it — hours, live, tonight.
//
// THE SHAPE. The binary states what it speaks (TrackScrollPhysics'
// constantsToExport: TRACK_SCROLL_CONTRACT_VERSION plus a capability list); JS
// states what it requires; the comparison is a pure verdict, and a bad verdict
// is a LOUD dev-time failure naming the fix. There is deliberately NO
// compatibility shim: an old binary is a thing to reinstall, not a thing to
// support. Shimming would re-create the silent degradation in a nicer costume.
//
// RN-free on purpose (the motion authority's rule): the pure lane falsifies the
// verdict law; the impure half — reading NativeModules and barking — lives at
// the one attach site.

/** BUMP WITH THE BINARY. Must equal TRACK_SCROLL_CONTRACT_VERSION in
 *  ios/TrackScrollKit/Sources/TrackEngineFacts.h — the C suite pins the native
 *  half of that equality, this module's spec pins the JS half. Version 1 is the
 *  historical UNVERSIONED contract, which exports no version at all and is
 *  therefore diagnosed by ABSENCE. */
export const TRACK_NATIVE_CONTRACT_VERSION = 2;

/** The surfaces the live JS actually calls or waits on. Every one of them is a
 *  silent no-op against a stale binary, which is why they are named here rather
 *  than implied by the version number: the version says "different", the
 *  capabilities say WHICH thing will not happen. */
export const TRACK_NATIVE_REQUIRED_CAPABILITIES = [
  'snapToOutcome',
  'hiddenIntent',
  'settleEvent',
  'generationStampedEdge',
  'externalBottomInset',
] as const;

export type TrackNativeContractReport =
  | {
      contractVersion?: unknown;
      capabilities?: unknown;
    }
  | null
  | undefined;

export type TrackNativeContractVerdict =
  | { status: 'ok'; version: number }
  /** No native module at all — tests, a JS-only harness, a broken link. */
  | { status: 'absent' }
  /** A binary that predates the handshake: it exports no version. */
  | { status: 'unversioned' }
  | { status: 'stale'; found: number; expected: number }
  /** The binary is NEWER than this bundle — equally a mismatch, and the fix is
   *  the other direction (reload JS), so it must not be reported as "stale". */
  | { status: 'ahead'; found: number; expected: number }
  | { status: 'missing-capabilities'; version: number; missing: string[] };

/** THE VERDICT LAW, pure. Order matters: absence of the module, then absence of
 *  a version, then version disagreement, then capability gaps — each check is
 *  only meaningful once the one before it passed. */
export const resolveTrackNativeContractVerdict = (
  report: TrackNativeContractReport,
  expected: {
    version: number;
    capabilities: readonly string[];
  }
): TrackNativeContractVerdict => {
  if (report == null) {
    return { status: 'absent' };
  }
  const found = report.contractVersion;
  if (typeof found !== 'number' || !Number.isFinite(found)) {
    return { status: 'unversioned' };
  }
  if (found < expected.version) {
    return { status: 'stale', found, expected: expected.version };
  }
  if (found > expected.version) {
    return { status: 'ahead', found, expected: expected.version };
  }
  // A matching version with a missing capability means the CONSTANT was not
  // bumped when the surface changed. Checking anyway is what makes the version
  // an honest claim instead of a number someone forgot.
  const declared = Array.isArray(report.capabilities)
    ? report.capabilities.filter((value): value is string => typeof value === 'string')
    : [];
  const missing = expected.capabilities.filter((name) => !declared.includes(name));
  if (missing.length > 0) {
    return { status: 'missing-capabilities', version: found, missing };
  }
  return { status: 'ok', version: found };
};

/** A verdict that is not 'ok' means the track's native lane is degraded — this
 *  is the fact any consumer reads, so the degradation is a value rather than a
 *  log line nobody sees. 'absent' is degraded too: the pure jest lane never
 *  reaches the bark site, and a real device with no module has no physics. */
export const trackNativeContractIsHealthy = (verdict: TrackNativeContractVerdict): boolean =>
  verdict.status === 'ok';

/** The message the owner reads at 2am. It must name (a) what is wrong, (b) what
 *  will silently NOT happen, and (c) the exact fix — a message that only says
 *  "mismatch" sends the reader back into the code that is not the problem. */
export const describeTrackNativeContractVerdict = (
  verdict: TrackNativeContractVerdict
): string | null => {
  const fix =
    'FIX: rebuild and reinstall the app (xcodebuild + simctl install), then relaunch — a JS reload alone cannot fix this.';
  const consequence =
    'Until then: snap commands never complete, the sheet fence never restores, reveals wait out the 700ms deadline, and hides never report their edge.';
  switch (verdict.status) {
    case 'ok':
      return null;
    case 'absent':
      return `[TRACK-CONTRACT] NativeModules.TrackScrollPhysics is missing — the track has no motion engine. ${consequence} ${fix}`;
    case 'unversioned':
      return `[TRACK-CONTRACT] The installed TrackScrollKit binary predates the contract handshake (it exports no contractVersion; this bundle requires v${TRACK_NATIVE_CONTRACT_VERSION}). ${consequence} ${fix}`;
    case 'stale':
      return `[TRACK-CONTRACT] STALE BINARY: TrackScrollKit speaks contract v${verdict.found}, this bundle requires v${verdict.expected}. ${consequence} ${fix}`;
    case 'ahead':
      return `[TRACK-CONTRACT] STALE BUNDLE: TrackScrollKit speaks contract v${verdict.found}, newer than this bundle's v${verdict.expected}. FIX: reload JS from the current source (the binary is ahead — do not rebuild).`;
    case 'missing-capabilities':
      return `[TRACK-CONTRACT] TrackScrollKit claims contract v${verdict.version} but does not declare: ${verdict.missing.join(', ')}. Either the binary is stale and its version constant was not bumped, or a capability was removed without a bump. ${fix}`;
    default: {
      const exhaustive: never = verdict;
      return String(exhaustive);
    }
  }
};

/**
 * Does the INSTALLED binary declare this capability?
 *
 * A stale binary does not merely no-op the surfaces it lacks: subscribing to an
 * event it never registered throws a native RCTEventEmitter error whose text
 * ("`trackDidSettle` is not a supported event type") buries the actionable
 * verdict this module already printed. Callers ask FIRST; the contract bark
 * stays the one message that names the fix.
 */
export const trackNativeDeclaresCapability = (
  report: TrackNativeContractReport | null | undefined,
  capability: (typeof TRACK_NATIVE_REQUIRED_CAPABILITIES)[number]
): boolean => Array.isArray(report?.capabilities) && report.capabilities.includes(capability);
