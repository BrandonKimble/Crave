import React from 'react';

import { SceneLoadingSurface } from '../../../../components/skeletons';
import { SEARCH_RESULTS_BANDS } from './search-results-page-bands';

/**
 * THE results-list empty skeleton — ONE element, minted once (F1329).
 *
 * This element is IDENTITY-SENSITIVE: both the scene-model owner's snapshot equality check
 * and the body-input owner's body-content equality check compare it by reference, and the two
 * owners coalesce their values with `??` at the consumer. It was declared TWICE — once per
 * module, with the same props and two different justifying comments — so the two "stable"
 * elements were stable within a module and DIFFERENT from each other across the seam they
 * feed. Reference equality is exactly the property a duplicate destroys.
 *
 * It covers the window between the initial-loading cover lifting (or a hard-swap reveal
 * beginning) and the first results row painting, so the reveal never flashes blank.
 */
export const RESULTS_LOADING_EMPTY_COMPONENT = React.createElement(SceneLoadingSurface, {
  rowType: SEARCH_RESULTS_BANDS.restaurants.materialRowType,
});
