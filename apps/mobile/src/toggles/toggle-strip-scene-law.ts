/**
 * THE FOUNDATION STRIP LAW, LOAD-BEARING (strip engine, leg 2 —
 * plans/toggle-strip-rebuild-ledger.md; audit D2.1 root cause).
 *
 * `scene-foundation-spec.ts` declares per scene whether (and where) a toggle strip
 * exists: `strip: 'none' | 'in-list' | 'header'`. Leg-1 found that field was a DEAD
 * LAW — zero consumers, and Bookmarks declared `'none'` while rendering two strips.
 * A law that cannot show RED is not a law. This module is the consumer:
 *
 * - `SceneBodyFoundationSurface` provides the scene key over `SceneStripLawContext`
 *   for the body lane, and `PersistentSheetHeaderHost` provides it around the
 *   header-mounted Strip slot (leg 3) — so the assert binds in BOTH mounts. Search
 *   renders no foundation surface and is excluded from the spec table by design, so
 *   the context is null for its in-list strip and the assert is honestly silent.
 * - `ToggleStrip` calls `useSceneStripLawAssert(placement)`: rendering a strip on a
 *   scene declared `'none'`, or under a placement the spec contradicts, barks a dev
 *   CONTRACT VIOLATION naming the scene — same pattern as the
 *   missing-persistent-header-descriptor bark. Prod is untouched.
 *
 * The INVERSE direction (scene declares `strip: 'header'` but registers no Strip
 * slot) is asserted by `PersistentSheetHeaderHost` (leg 3).
 */

import React from 'react';

import {
  getSceneFoundationSpec,
  type SheetSceneKey,
} from '../navigation/runtime/scene-foundation-spec';

export type ToggleStripPlacement = 'in-list' | 'header';

export const SceneStripLawContext = React.createContext<SheetSceneKey | null>(null);

const barkedSceneKeys = new Set<string>();

export const useSceneStripLawAssert = (
  placement: ToggleStripPlacement,
  stripName?: string
): void => {
  const sceneKey = React.useContext(SceneStripLawContext);
  React.useEffect(() => {
    if (!__DEV__ || sceneKey == null) {
      return;
    }
    const declared = getSceneFoundationSpec(sceneKey)?.strip;
    if (declared === placement) {
      return;
    }
    const barkKey = `${sceneKey}:${placement}:${declared ?? 'missing'}`;
    if (barkedSceneKeys.has(barkKey)) {
      return;
    }
    barkedSceneKeys.add(barkKey);
    const strip = stripName ?? 'a toggle strip';
    if (declared === 'none' || declared == null) {
      console.error(
        `[FOUNDATION] scene '${sceneKey}' declares strip: 'none' but renders ${strip} — ` +
          `the strip law is lying. Declare the placement in scene-foundation-spec.ts ` +
          `('in-list' | 'header').`
      );
      return;
    }
    console.error(
      `[FOUNDATION] scene '${sceneKey}' declares strip: '${declared}' but renders ${strip} ` +
        `mounted '${placement}' — placement and declaration must agree ` +
        `(scene-foundation-spec.ts).`
    );
  }, [placement, sceneKey, stripName]);
};
