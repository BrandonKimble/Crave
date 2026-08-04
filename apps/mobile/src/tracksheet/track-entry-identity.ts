// ─── ENTRY IDENTITY (transition end-state contract, G-ENTRY / amendment A3) ──
//
// THE ONE new abstraction of the end-state plan: the unit of sheet state is the
// STACK ENTRY, not the scene kind. Scroll memory, chrome/strip/title caches,
// mounted-body React identity and leg identity all key on `sceneKey#entryId`.
//
// WHERE entryIds COME FROM — derived, never minted here: the route stack
// algebra (app-overlay-route-stack-algebra.ts) mints `entryId` once per push
// ("entries are VALUES"), and the PresentationFrame carries
// `presentedEntryId` (W1 slice 1, C5). The track consumes that identity.
//
// THE ROOT EXCEPTION: top-level tab scenes (the resident legs) are
// SINGLETONS — one logical entry forever. Their stack entries can be re-minted
// across tab revisits, and keying a resident by a re-minted id would silently
// drop its scroll memory on every revisit. Residents therefore pin to the
// `root` entry id; only child scenes (the ones that can genuinely stack twice
// — two DM threads, two userProfiles) carry per-push identity.

export type TrackEntryKey = string;

export const TRACK_ROOT_ENTRY_ID = 'root';

const SEPARATOR = '#';

/** `sceneKey#entryId`; a null/absent entryId is the scene's singleton root. */
export const makeTrackEntryKey = (sceneKey: string, entryId?: string | null): TrackEntryKey =>
  `${sceneKey}${SEPARATOR}${entryId ?? TRACK_ROOT_ENTRY_ID}`;

/** The scene half of an entry key (chrome descriptors, foundation specs). */
export const trackEntrySceneKey = (entryKey: TrackEntryKey): string => {
  const index = entryKey.indexOf(SEPARATOR);
  return index < 0 ? entryKey : entryKey.slice(0, index);
};
