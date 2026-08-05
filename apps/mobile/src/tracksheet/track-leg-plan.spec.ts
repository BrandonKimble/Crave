import { planTrackLegBody, resolveTrackLegRowSurfaceKind } from './track-leg-plan';

// THE BRANCH ORDER (host extraction 3). It used to exist twice in the host —
// once to name the readiness resolution, once to build the list — and the two
// copies could only agree by luck.

describe('planTrackLegBody', () => {
  const facts = {
    publishedListRowCount: null as number | null,
    partsListRowCount: null as number | null,
    usesMountedBody: false,
  };

  it('the published lane WINS over everything else', () => {
    expect(
      planTrackLegBody({ publishedListRowCount: 3, partsListRowCount: 9, usesMountedBody: true })
    ).toEqual({ source: 'published', resolution: { kind: 'list', rowCount: 3 } });
  });

  it('the list-parts hook outranks the mounted registry', () => {
    expect(planTrackLegBody({ ...facts, partsListRowCount: 9, usesMountedBody: true })).toEqual({
      source: 'parts',
      resolution: { kind: 'list', rowCount: 9 },
    });
  });

  it('a mounted body is the last concrete lane', () => {
    expect(planTrackLegBody({ ...facts, usesMountedBody: true })).toEqual({
      source: 'mounted',
      resolution: { kind: 'mounted' },
    });
  });

  it('nothing resolved → none (the skeleton / frozen phase input)', () => {
    expect(planTrackLegBody(facts)).toEqual({ source: 'none', resolution: { kind: 'none' } });
  });

  it('ZERO ROWS IS A LANE (R2): an empty published list is the scene SPEAKING', () => {
    // Gating readiness on rows would replace owner-ratified empty faces with a
    // host skeleton — the regression the readiness header forbids.
    expect(planTrackLegBody({ ...facts, publishedListRowCount: 0 })).toEqual({
      source: 'published',
      resolution: { kind: 'list', rowCount: 0 },
    });
  });
});

describe('resolveTrackLegRowSurfaceKind', () => {
  const base = {
    usesMountedBody: false,
    mountedBodyIsEdgeToEdge: false,
    presentedLegHasPublishedList: false,
    declaresSharedRowSurface: false,
  };

  it('a mounted leg is a transparent cell over the foundation plate', () => {
    expect(resolveTrackLegRowSurfaceKind({ ...base, usesMountedBody: true })).toBe('mounted');
  });

  it('an edge-to-edge mounted leg is its own kind', () => {
    expect(
      resolveTrackLegRowSurfaceKind({
        ...base,
        usesMountedBody: true,
        mountedBodyIsEdgeToEdge: true,
      })
    ).toBe('mounted-edge-to-edge');
  });

  it('MOUNTED OUTRANKS the row-surface facts — it is a different cell entirely', () => {
    expect(
      resolveTrackLegRowSurfaceKind({
        ...base,
        usesMountedBody: true,
        presentedLegHasPublishedList: true,
        declaresSharedRowSurface: true,
      })
    ).toBe('mounted');
  });

  it('the presented leg of a published list gets production row padding', () => {
    expect(resolveTrackLegRowSurfaceKind({ ...base, presentedLegHasPublishedList: true })).toBe(
      'padded'
    );
  });

  it('a scene that DECLARES the shared row surface gets it without a publication', () => {
    expect(resolveTrackLegRowSurfaceKind({ ...base, declaresSharedRowSurface: true })).toBe(
      'padded'
    );
  });

  it('otherwise the cell carries no style at all', () => {
    expect(resolveTrackLegRowSurfaceKind(base)).toBe('bare');
  });
});
