// THE PHASE PROBE'S FALSIFIERS. An instrument's spec must prove it can show RED
// — that a real delay produces a real number and a MISSING phase produces a hole
// rather than a plausible zero. Each test below fails if the module ever starts
// inferring a mark from its neighbours.

import {
  beginTrackPressPhaseSpan,
  beginTrackPressRowWindow,
  finishTrackPressRowWindow,
  formatTrackPressRowWindow,
  peekTrackPressRowInvokes,
  peekTrackPressRowWindow,
  finishTrackPressPhaseSpan,
  formatTrackPressPhases,
  noteTrackPressBodyFact,
  noteTrackPressChromeBuild,
  noteTrackPressCommit,
  noteTrackPressPartsCost,
  noteTrackPressPhase,
  noteTrackPressRowInvoke,
  noteTrackPressRowProbeMode,
  noteTrackPressSubtreeRender,
  peekTrackPressPhaseSpan,
  resetTrackPressPhaseSpan,
  trackPerfToEpochMs,
  TRACK_PRESS_PHASE_TTL_MS,
} from './track-press-phase-probe';

describe('track press phase probe', () => {
  beforeEach(() => resetTrackPressPhaseSpan());

  it('reports each span from its own clock reading (a slow phase shows RED)', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('polls', 'route-committed', 1020);
    noteTrackPressPhase('polls', 'host-render', 1180); // the 160ms gap
    noteTrackPressPhase('polls', 'parts', 1185);
    noteTrackPressPhase('polls', 'legs-built', 1190);
    noteTrackPressPhase('polls', 'layout-effect', 1200);
    noteTrackPressPhase('polls', 'passive-effect', 1210);
    noteTrackPressPartsCost('polls', 4.2);
    const span = finishTrackPressPhaseSpan('polls', 1290);
    expect(span).not.toBeNull();
    const line = formatTrackPressPhases(span!);
    expect(line).toContain('layout-effect->passive=10ms');
    expect(line).toContain('passive->paint=80ms');
    expect(line).toContain('press->committed=20ms');
    expect(line).toContain('committed->host-render=160ms');
    expect(line).toContain('host-render->parts=5ms');
    expect(line).toContain('legs->layout-effect=10ms');
    expect(line).toContain('partsCost=4.2ms');
    expect(line).toContain('total=290ms');
  });

  it('counts commits, chrome builds and the body fact where they happen', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressCommit('polls');
    noteTrackPressCommit('polls');
    noteTrackPressChromeBuild('polls');
    noteTrackPressChromeBuild('polls');
    noteTrackPressChromeBuild('polls');
    noteTrackPressBodyFact('polls', 25, 'frozen', 'same', 'same');
    // First-write-wins: a later commit's body cannot restate the flip frame's.
    noteTrackPressBodyFact('polls', 1, 'live', 'new', 'changed');
    noteTrackPressSubtreeRender('polls', 'page', 'update', 160.0);
    noteTrackPressSubtreeRender('polls', 'list', 'update', 12.0);
    noteTrackPressSubtreeRender('polls', 'row', 'mount', 21.4);
    noteTrackPressSubtreeRender('polls', 'row', 'mount', 18.6);
    const line = formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1100)!);
    expect(line).toContain('commits=2');
    expect(line).toContain('chromeBuilds=3');
    expect(line).toContain('rows=25');
    expect(line).toContain('body=frozen');
    expect(line).toContain('dataIdentity=same');
    expect(line).toContain('dataContent=same');
    expect(line).toContain('rowProbe=full');
    // Each named subtree is reported SEPARATELY so the reader does the
    // subtraction on measured numbers (page - list = the page's own render).
    expect(line).toContain('sub:page=160.0ms/max160.0/0m1u');
    expect(line).toContain('sub:list=12.0ms/max12.0/0m1u');
    expect(line).toContain('sub:row=40.0ms/max21.4/2m0u');
  });

  it('reports zero counts and unknown body honestly when nothing was observed', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    const line = formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1100)!);
    expect(line).toContain('commits=0');
    expect(line).toContain('chromeBuilds=0');
    expect(line).toContain('rows=?');
    expect(line).toContain('body=?');
    expect(line).toContain('dataIdentity=?');
    expect(line).toContain('dataContent=?');
    // A subtree that never rendered is ABSENT, never a fabricated zero.
    expect(line).toContain('subtrees=none');
  });

  it('prints a HOLE, never a zero, for a phase that never happened', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('polls', 'host-render', 1180);
    const line = formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1290)!);
    // route-committed was never marked: both spans touching it are unknown.
    expect(line).toContain('press->committed=?');
    expect(line).toContain('committed->host-render=?');
    // ...but the phases that DID happen still report.
    expect(line).toContain('total=290ms');
    expect(line).toContain('partsCost=?');
  });

  it('distinguishes a genuinely zero span from a missing one', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('polls', 'route-committed', 1000);
    const line = formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1000)!);
    expect(line).toContain('press->committed=0ms');
    expect(line).toContain('committed->host-render=?');
  });

  it('is first-write-wins: a re-render cannot push a mark later', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('polls', 'host-render', 1100);
    noteTrackPressPhase('polls', 'host-render', 1250);
    expect(peekTrackPressPhaseSpan()?.marks['host-render']).toBe(1100);
  });

  it('ignores marks for another scene and never fabricates a report', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('home', 'host-render', 1100);
    noteTrackPressPartsCost('home', 99);
    noteTrackPressCommit('home');
    noteTrackPressChromeBuild('home');
    noteTrackPressBodyFact('home', 7, 'live', 'new', 'changed');
    noteTrackPressSubtreeRender('home', 'row', 'mount', 50);
    noteTrackPressRowInvoke('home', 0);
    expect(peekTrackPressPhaseSpan()?.marks['host-render']).toBeUndefined();
    expect(peekTrackPressPhaseSpan()?.partsMs).toBeNull();
    expect(peekTrackPressPhaseSpan()?.commits).toBe(0);
    expect(peekTrackPressPhaseSpan()?.chromeBuilds).toBe(0);
    expect(peekTrackPressPhaseSpan()?.body).toBeNull();
    expect(peekTrackPressPhaseSpan()?.subtrees.size).toBe(0);
    expect(peekTrackPressPhaseSpan()?.rowInvokes).toBe(0);
    expect(finishTrackPressPhaseSpan('home', 1200)).toBeNull();
  });

  it('drops a stale span rather than reporting a fabricated multi-second phase', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    expect(finishTrackPressPhaseSpan('polls', 1000 + TRACK_PRESS_PHASE_TTL_MS + 1)).toBeNull();
    expect(peekTrackPressPhaseSpan()).toBeNull();
  });

  it('a new switch supersedes an unfinished span', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('polls', 'host-render', 1100);
    beginTrackPressPhaseSpan('home', 2000);
    expect(peekTrackPressPhaseSpan()?.sceneKey).toBe('home');
    expect(peekTrackPressPhaseSpan()?.marks['host-render']).toBeUndefined();
  });

  // ── THE ROW WINDOW ────────────────────────────────────────────────────────
  // Round 3's row probe reported ZERO because it lived inside the flip span,
  // which closes at the flip's paint — rows FlashList mounts in a later commit
  // fell outside it by construction. These tests are that blind spot, stated.

  it('keeps counting rows after the flip span has closed', () => {
    beginTrackPressRowWindow('polls');
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressSubtreeRender('polls', 'row', 'mount', 5);
    noteTrackPressRowInvoke('polls', 0);
    // The flip's paint: the phase span closes here.
    expect(finishTrackPressPhaseSpan('polls', 1100)).not.toBeNull();
    // Rows that land in the RELEASE commit must still be counted.
    noteTrackPressSubtreeRender('polls', 'row', 'mount', 7);
    noteTrackPressSubtreeRender('polls', 'row', 'mount', 9);
    noteTrackPressRowInvoke('polls', 0);
    const tally = finishTrackPressRowWindow('polls');
    expect(tally).toEqual({
      mounts: 3,
      updates: 0,
      totalMs: 21,
      maxMs: 9,
      invokes: 2,
      distinct: 1,
    });
  });

  it('only counts ROW subtrees in the row window, and only for its scene', () => {
    beginTrackPressRowWindow('polls');
    noteTrackPressSubtreeRender('polls', 'page', 'update', 160);
    noteTrackPressSubtreeRender('home', 'row', 'mount', 40);
    expect(peekTrackPressRowWindow()).toEqual({
      mounts: 0,
      updates: 0,
      totalMs: 0,
      maxMs: 0,
    });
  });

  it('counts INVOCATIONS separately from profiled mounts — the two zeros differ', () => {
    beginTrackPressRowWindow('polls');
    beginTrackPressPhaseSpan('polls', 1000);
    // Cells were rendered, but none reached the row Profiler (the wrapper is
    // not on their path). invokes must see them; mounts must not.
    noteTrackPressRowInvoke('polls', 0);
    noteTrackPressRowInvoke('polls', 0);
    expect(peekTrackPressRowInvokes()).toBe(2);
    expect(peekTrackPressRowWindow()?.mounts).toBe(0);
    expect(formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1100)!)).toContain(
      'rowInvokes=2'
    );
  });

  it('counts DISTINCT indices, so a re-invoked row cannot look like a new one', () => {
    beginTrackPressRowWindow('polls');
    beginTrackPressPhaseSpan('polls', 1000);
    // The progressive-render loop re-invokes the SAME indices across passes.
    // 6 invocations, 3 distinct rows — conflating them would point the fix at
    // the render window when the truth is the convergence loop (or vice versa).
    [0, 1, 2, 0, 1, 2].forEach((index) => noteTrackPressRowInvoke('polls', index));
    const line = formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1100)!);
    expect(line).toContain('rowInvokes=6');
    expect(line).toContain('rowDistinct=3');
    const window = finishTrackPressRowWindow('polls')!;
    expect(window.invokes).toBe(6);
    expect(window.distinct).toBe(3);
  });

  it('reports the row A/B mode a span was measured under', () => {
    // A 'bare' measurement filed as 'full' would look like the cards are free.
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressRowProbeMode('polls', 'bare');
    expect(formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1100)!)).toContain(
      'rowProbe=bare'
    );
  });

  it('splits the JS tail at the txn reveal', () => {
    beginTrackPressPhaseSpan('polls', 1000);
    noteTrackPressPhase('polls', 'layout-effect', 1100);
    noteTrackPressPhase('polls', 'reveal', 1105);
    noteTrackPressPhase('polls', 'passive-effect', 1128);
    const line = formatTrackPressPhases(finishTrackPressPhaseSpan('polls', 1237)!);
    expect(line).toContain('layout-effect->reveal=5ms');
    expect(line).toContain('reveal->passive=23ms');
    expect(line).toContain('passive->paint=109ms');
  });

  it('formats the row window with an honest hole when nothing mounted', () => {
    beginTrackPressRowWindow('polls');
    const line = formatTrackPressRowWindow('polls', finishTrackPressRowWindow('polls')!);
    expect(line).toContain('invokes=0');
    expect(line).toContain('distinct=0');
    expect(line).toContain('mounts=0');
    expect(line).toContain('avg=?');
  });

  it('converts a performance.now mark into the press anchor’s epoch', () => {
    // perf 500 read when perf reads 800 and the wall clock reads 10_000
    expect(trackPerfToEpochMs(500, 10_000, 800)).toBe(9_700);
  });
});
