import type { OverlayContentSpec, OverlayKey } from './types';

export type OverlayRegistry = Record<OverlayKey, OverlayContentSpec<unknown> | null>;

export const createOverlayRegistry = (registry: OverlayRegistry) => registry;
