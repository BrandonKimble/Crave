// ─── R7 FALSIFIERS: OA1 (the world join) + worldJoin-as-declared-data ─────────
//
// OA1: "a world-join scene revealing cards before map items (or vice versa) is a
// RED violation." Three layers proven here:
//   1. THE MECHANISM (txn level): a world episode declaring {paint, mapFrame,
//      sheet} cannot reach 'revealed' with one side missing — cards admission
//      and the native ramp both derive from the same 'revealed' edge.
//   2. THE AUDIT (pure): at a reveal that DID fire (degrade, plan mutation,
//      false offer), a missing residency fact is a violation. Proven RED by
//      mutation during R7: auditWorldJoinAtReveal was temporarily mutated to
//      ignore mapFrameClean — the cards-before-map case below failed — then
//      reverted.
//   3. THE DECLARATION (data): world-join membership is scene-descriptor data;
//      deleting listDetail's `worldJoin: true` row fails the test here AND
//      bypass-barks [WORLD-JOIN] at runtime (ListDetailPanel).

import {
  commitTransitionTxn,
  getLiveTransitionTxn,
  offerTransitionJoinInput,
  resetTransitionTxnHolderForTest,
  sealTransitionTxnJoin,
  setTransitionTxnViolationSink,
  stageTransitionTxn,
} from '../../../../navigation/runtime/transition-engine/transition-transaction';
import { sceneParticipatesInWorldJoin } from '../../../../navigation/runtime/scene-foundation-spec';
import { auditWorldJoinAtReveal } from './world-join-contract';

describe('OA1 — the world-join mechanism (txn level)', () => {
  afterEach(() => {
    setTransitionTxnViolationSink(null);
    resetTransitionTxnHolderForTest();
  });

  const stageWorldEpisode = () => {
    const txn = stageTransitionTxn(
      { kind: 'revise', targetSceneKey: 'search', sourceSceneKey: 'search', entryId: null },
      {
        content: { kind: 'skeleton' },
        joinInputs: ['paint', 'mapFrame', 'sheet'],
        movesSheet: true,
        joinLivenessMs: 10000,
      }
    );
    commitTransitionTxn(txn);
    sealTransitionTxnJoin(txn);
    return txn;
  };

  it('cards cannot reveal before map items: paint+sheet landed, mapFrame missing → still joining', () => {
    setTransitionTxnViolationSink(() => {});
    const txn = stageWorldEpisode();
    offerTransitionJoinInput('paint');
    offerTransitionJoinInput('sheet');
    expect(txn.phase).toBe('joining');
    expect([...txn.pendingJoinInputs]).toEqual(['mapFrame']);
  });

  it('map items cannot reveal before cards: mapFrame+sheet landed, paint missing → still joining', () => {
    setTransitionTxnViolationSink(() => {});
    const txn = stageWorldEpisode();
    offerTransitionJoinInput('mapFrame');
    offerTransitionJoinInput('sheet');
    expect(txn.phase).toBe('joining');
  });

  it('the last input reveals — both sides surface in the same edge', () => {
    setTransitionTxnViolationSink(() => {});
    const txn = stageWorldEpisode();
    offerTransitionJoinInput('paint');
    offerTransitionJoinInput('mapFrame');
    expect(txn.phase).toBe('joining');
    offerTransitionJoinInput('sheet');
    expect(txn.phase).toBe('revealed');
    expect(getLiveTransitionTxn()).toBe(txn);
  });
});

describe('OA1 — the reveal audit (RED at a split reveal)', () => {
  it('a joined world revise is green', () => {
    expect(
      auditWorldJoinAtReveal({ isWorldRevise: true, rowsResident: true, mapFrameClean: true })
    ).toBeNull();
  });

  it('cards-before-map is RED (revealed while the map frame is not resident)', () => {
    const violation = auditWorldJoinAtReveal({
      isWorldRevise: true,
      rowsResident: true,
      mapFrameClean: false,
    });
    expect(violation).not.toBeNull();
    expect(violation!.missing).toEqual(['mapItems']);
  });

  it('map-before-cards is RED (revealed while rows are not resident)', () => {
    const violation = auditWorldJoinAtReveal({
      isWorldRevise: true,
      rowsResident: false,
      mapFrameClean: true,
    });
    expect(violation).not.toBeNull();
    expect(violation!.missing).toEqual(['cards']);
  });

  it('both missing names both sides', () => {
    expect(
      auditWorldJoinAtReveal({ isWorldRevise: true, rowsResident: false, mapFrameClean: false })!
        .missing
    ).toEqual(['cards', 'mapItems']);
  });

  it('a toggle is exempt by design (its cards swap IS the reveal; the crossfade is the settle)', () => {
    expect(
      auditWorldJoinAtReveal({ isWorldRevise: false, rowsResident: false, mapFrameClean: false })
    ).toBeNull();
  });
});

describe('worldJoin is DECLARED data (OA1 family membership, R7)', () => {
  it('listDetail declares membership (the OA1 family = {search/results, listDetail}, extensible by data)', () => {
    expect(sceneParticipatesInWorldJoin('listDetail')).toBe(true);
  });

  it('search is a member by construction (excluded from the table; the episode target)', () => {
    expect(sceneParticipatesInWorldJoin('search')).toBe(true);
  });

  it('non-family scenes are not members (deleting a row flag is a RED here, never a silent bypass)', () => {
    expect(sceneParticipatesInWorldJoin('polls')).toBe(false);
    expect(sceneParticipatesInWorldJoin('pollDetail')).toBe(false);
    expect(sceneParticipatesInWorldJoin('home')).toBe(false);
  });
});
