// ─── FALSIFIER: plate-first ToggleStrip (strip choreography fix 1, 2026-08-08) ─
//
// THE LAW: the strip's white cutout material renders on the FIRST committed
// frame of every mount — geometry from declared data (band height, window
// width, the warm cache), measurement only refines. The pre-fix gate
// (`contentRowWidth > 0 && rowHeight > 0 && maskedHoles.length > 0`) committed
// at least one transparent band over frost on EVERY fresh mount: pills present
// (the SegmentedToggle layout-first twin paints frame 1), white absent — the
// owner's witnessed gap.
//
// This runs the REAL ToggleStrip engine (react-native / reanimated / surface
// seams stubbed by this lane's standing mocks). No onLayout is ever dispatched
// here, so the tree under assertion IS the first commit's — exactly the state
// the old gate left transparent.
//
// RED-PROVEN BY MUTATION (executed 2026-08-08; counts are what the runs printed):
//   M-E1 `contentRowWidth > 0` restored into plateRenderable (the width gate)
//        -> 1 RED (cold mount: material absent from the first committed tree
//           AND the [STRIP] transparent-band bark fired; the warm mount
//           survives ONLY because the new contentRowWidth cache seed exists —
//           which is that seed's own proof)
//   M-E2 the full pre-fix gate (width && rowHeight && holes) restored at the
//        render site
//        -> 1 RED (cold mount commits a transparent band; a correctly-seeded
//           warm mount passes the old gate — the defect was always the fresh
//           mount, exactly as the owner witnessed)
//
// Sacred behaviors are NOT asserted here because they are NOT touched: scroll
// physics, rubber band, warm scrollX restore and the flanking-pane illusion all
// ride the same CutoutBandMaterial with the same inputs once measurement lands.

import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

import { ToggleStrip } from '../../toggles/ToggleStrip';
import type {
  ToggleStripCacheSeat,
  ToggleStripLayoutCache,
} from '../../toggles/toggle-strip-layout-cache';

const bandMaterialPanes = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node) =>
      node.props?.testID === 'cutout-band-pane-left' ||
      node.props?.testID === 'cutout-band-pane-right'
  );

const stripBarks = (spy: jest.SpyInstance) =>
  spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('[STRIP]'));

describe('plate-first ToggleStrip — the white material exists on commit 1', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('a FRESH (cold) mount commits the band material in its first tree — no transparent band, and the [STRIP] bark stays silent', async () => {
    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ToggleStrip placement="header" backdrop="chrome-frost" testID="cold-strip">
          <control key="a" />
          <control key="b" />
        </ToggleStrip>
      );
    });
    const tree = renderer as unknown as ReactTestRenderer;
    // The white material's flanking panes tile the band solid on commit 1
    // (zero holes yet — the plate sharpens additively under the fade cover).
    expect(bandMaterialPanes(tree)).toHaveLength(2);
    expect(stripBarks(errorSpy)).toHaveLength(0);
    await act(async () => {
      tree.unmount();
    });
  });

  it('a WARM mount (cache seat seeded, incl. contentRowWidth) commits the band material exactly the same — the seed makes frame 1 exact, not merely covered', async () => {
    const cache: ToggleStripLayoutCache = {
      viewportWidth: 390,
      rowHeight: 32,
      contentWidth: 420,
      contentRowWidth: 380,
      holeMap: {
        'strip-slot-.$a': { x: 0, y: 0, width: 180, height: 32 },
        'strip-slot-.$b': { x: 188, y: 0, width: 120, height: 32 },
      },
      controlLayouts: {},
      scrollX: 0,
    };
    const seat: ToggleStripCacheSeat = {
      read: () => cache,
      write: () => undefined,
    };
    let renderer: ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <ToggleStrip
          placement="header"
          backdrop="chrome-frost"
          testID="warm-strip"
          cacheSeat={seat}
        >
          <control key="a" />
          <control key="b" />
        </ToggleStrip>
      );
    });
    const tree = renderer as unknown as ReactTestRenderer;
    expect(bandMaterialPanes(tree)).toHaveLength(2);
    expect(stripBarks(errorSpy)).toHaveLength(0);
    await act(async () => {
      tree.unmount();
    });
  });
});
