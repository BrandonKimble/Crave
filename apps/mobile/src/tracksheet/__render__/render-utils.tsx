// ─── Shared drivers for the render-lane specs ────────────────────────────────

import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

import { TrackSheetRouteHost } from '../TrackSheetRouteHost';
import { flashListRegistry } from './mocks/flash-list-mock';
import { harness, resetHarness, type HarnessFrame, type HarnessWorld } from './harness';

export { harness, resetHarness };

export const flushAsync = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

export const renderHost = async (): Promise<ReactTestRenderer> => {
  let renderer: ReactTestRenderer | null = null;
  await act(async () => {
    renderer = TestRenderer.create(<TrackSheetRouteHost />);
  });
  // Flush the native attach promise so the physics engine is bound.
  await flushAsync();
  return renderer as unknown as ReactTestRenderer;
};

export const setFrame = async (partial: Partial<HarnessFrame>): Promise<void> => {
  const world = harness.world;
  const prev = world.frameStore.get();
  await act(async () => {
    world.frameStore.set({ ...prev, ...partial, switchId: prev.switchId + 1 });
  });
};

type ScrollHandlers = {
  onScroll: (event: {
    contentOffset: { y: number };
    layoutMeasurement: { height: number };
  }) => void;
  onBeginDrag: (event: { contentOffset: { y: number } }) => void;
  onEndDrag: (event: { contentOffset: { y: number } }) => void;
};

const scrollHandlers = (): ScrollHandlers => {
  const instance = flashListRegistry.instance;
  if (instance == null) {
    throw new Error('no FlashList mounted');
  }
  return instance.props.onScroll as ScrollHandlers;
};

/** Drive the native track: a scroll frame (τ write). */
export const scrollTo = async (y: number): Promise<void> => {
  await act(async () => {
    scrollHandlers().onScroll({ contentOffset: { y }, layoutMeasurement: { height: 844 } });
  });
};

export const emitNative = async (name: string, payload?: unknown): Promise<void> => {
  await act(async () => {
    harness.world.emit(name, payload);
  });
};

/** THE REST FACT, as the engine states it. The page no longer INFERS settle
 * from τ stability — the native spring reports its own completion
 * (trackDidSettle, one generation-stamped emission per motion episode), so the
 * driver emits that event. τ is written first so every τ-rider sees the resting
 * value in the same order a real frame would deliver it. */
let settleGeneration = 0;
export const settleAt = async (
  detentTau: number,
  options?: {
    atDetent?: boolean;
    hiddenEngaged?: boolean;
    cause?: 'spring' | 'decelerate' | 'dragEnd';
  }
): Promise<void> => {
  await scrollTo(detentTau);
  settleGeneration += 1;
  await emitNative('trackDidSettle', {
    generation: settleGeneration,
    tau: detentTau,
    posture: detentTau,
    atDetent: options?.atDetent ?? true,
    detentTau: (options?.atDetent ?? true) ? detentTau : null,
    cause: options?.cause ?? 'spring',
    hiddenEngaged: options?.hiddenEngaged ?? false,
  });
};

export const beginDrag = async (y = 0): Promise<void> => {
  await act(async () => {
    scrollHandlers().onBeginDrag({ contentOffset: { y } });
  });
  // The drag's belt-and-braces re-attach resolves async; flush it so the
  // attach listeners (restore replay) fire.
  await flushAsync();
};

export const endDrag = async (y = 0): Promise<void> => {
  await act(async () => {
    scrollHandlers().onEndDrag({ contentOffset: { y } });
  });
};

export const sendMotionCommand = async (
  snapTo: 'expanded' | 'middle' | 'collapsed' | 'hidden',
  settleToken: number | null
): Promise<void> => {
  const world = harness.world;
  const target = world.motionTarget;
  if (target == null) {
    throw new Error('no sheet motion target registered');
  }
  await act(async () => {
    target.motionCommandValue.value = {
      snapTo,
      token: Date.now() + Math.random(),
      settleToken,
    };
  });
};

export const nativeCallsNamed = (world: HarnessWorld, name: string) =>
  world.nativeCalls.filter((call) => call.name === name);

export const clearRecords = (world: HarnessWorld): void => {
  world.nativeCalls.length = 0;
  world.txn.offers.length = 0;
  world.txn.amends.length = 0;
  world.txn.seals = 0;
  world.surface.readyMarks.length = 0;
  world.surface.motionPendingMarks.length = 0;
  world.settleCompletions.length = 0;
};

/** A published list-body snapshot for the scene-input lane. */
export const listPublication = (
  rows: string[],
  forEntryId?: string | null
): { sceneBodyContent: Record<string, unknown>; sceneBodyForEntryId?: string | null } => ({
  sceneBodyContent: {
    surfaceKind: 'list',
    data: rows,
    renderItem: (info: { item: string }) => React.createElement('published-row', { id: info.item }),
    keyExtractor: (item: string) => item,
  },
  sceneBodyForEntryId: forEntryId,
});

export const findAllByType = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node) => node.type === type);
