import { planTrackCommitTxnBridge, type TrackTxnBridgeFacts } from './track-txn-bridge';

// THE ORDER LAW as a test instead of prose (host extraction 2). Every case here
// was previously asserted only by a thirty-line comment above a layout effect.

const txn = (over: Partial<NonNullable<TrackTxnBridgeFacts>> = {}): TrackTxnBridgeFacts => ({
  targetSceneKey: 'polls',
  phase: 'committed',
  contentKind: 'swap',
  ...over,
});

const plan = (liveTxn: TrackTxnBridgeFacts, scene = 'polls') =>
  planTrackCommitTxnBridge({ scene, liveTxn });

describe('planTrackCommitTxnBridge', () => {
  it('no live txn → the bridge touches the engine at all', () => {
    expect(plan(null)).toEqual([]);
  });

  it('a txn targeting ANOTHER scene is not ours — never offered into', () => {
    expect(plan(txn({ targetSceneKey: 'home' }))).toEqual([]);
  });

  it('THE ORDER LAW: arm, seal, THEN offer — chrome before paint', () => {
    // Offers made before the amend are DISCARDED (an input is consumed iff the
    // live plan declares it), and the seal is what stops the join waiting for
    // the idle boundary behind the 700ms sheet-settle fallback.
    expect(plan(txn())).toEqual(['amend-join-inputs', 'seal-join', 'offer-chrome', 'offer-paint']);
  });

  it('applies to a STAGED txn too (both pre-reveal phases arm)', () => {
    expect(plan(txn({ phase: 'staged' }))).toEqual([
      'amend-join-inputs',
      'seal-join',
      'offer-chrome',
      'offer-paint',
    ]);
  });

  it('THE HIDDEN FAMILY ROUTING: a freeze txn is never amended or sealed here', () => {
    // Amending a freezeUntilSnap txn to {paint, chrome} would clobber the
    // 'boundary' join the deferred-swap gate offers at the screen edge, and flip
    // content mid-slide (G-HIDDEN, R4). Paint is still offered.
    expect(plan(txn({ contentKind: 'freezeUntilSnap' }))).toEqual(['offer-paint']);
  });

  it('a txn already past the arming phases only offers paint', () => {
    expect(plan(txn({ phase: 'revealed' }))).toEqual(['offer-paint']);
  });

  it('paint is offered on EVERY txn of ours — the join always gets its input', () => {
    for (const facts of [
      txn(),
      txn({ phase: 'staged' }),
      txn({ phase: 'revealed' }),
      txn({ contentKind: 'freezeUntilSnap' }),
    ]) {
      expect(plan(facts)).toContain('offer-paint');
    }
  });
});
