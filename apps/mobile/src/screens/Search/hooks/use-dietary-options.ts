import React from 'react';

import { searchService } from '../../../services/search';

export type { DietaryOption } from '../dietary-controls';
export { resolveDietaryControls } from '../dietary-controls';

import type { DietaryOption } from '../dietary-controls';

/**
 * The dietary toggle strip's OPTIONS come from the server's curated
 * vocabulary (spec §1.3: the `constraintClass` flag on the attribute
 * entities is the closed, owner-approved set) — never a hand-list in the
 * client. Adding or retiring a lifestyle toggle is therefore ONE curation
 * act on the data, and every surface follows.
 *
 * THE VOCABULARY IS NOT THE CONTROL SET. A persisted wall whose option the
 * fetch missed (offline first launch) or whose attribute was retired by
 * curation would otherwise be an INVISIBLE, UNCLEARABLE filter: results
 * silently walled with no chip to turn off. `resolveDietaryControls` unions
 * the fetched vocabulary with whatever is actually active, so every wall in
 * force always has a control that can release it.
 *
 * Fetched once per app session and memoized at module scope: the vocabulary
 * is ~6 rows and changes only by curation, so a per-mount request would be
 * pure waste. A failure yields an empty strip section (the chips simply do
 * not render) — never a broken header.
 */
let cachedOptions: DietaryOption[] | null = null;
let inFlight: Promise<DietaryOption[]> | null = null;

const loadDietaryOptions = async (): Promise<DietaryOption[]> => {
  if (cachedOptions) return cachedOptions;
  if (!inFlight) {
    inFlight = searchService
      .dietaryOptions()
      .then((options) => {
        cachedOptions = options;
        return options;
      })
      .catch(() => [])
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

const EMPTY_OPTIONS: readonly DietaryOption[] = [];

export const useDietaryOptions = (): readonly DietaryOption[] => {
  const [options, setOptions] = React.useState<readonly DietaryOption[]>(
    cachedOptions ?? EMPTY_OPTIONS
  );

  React.useEffect(() => {
    if (cachedOptions) return;
    let cancelled = false;
    void loadDietaryOptions().then((loaded) => {
      if (!cancelled && loaded.length > 0) {
        setOptions(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
};
