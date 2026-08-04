/**
 * N10/A3 — THE DISPLAY BOUNDARY, in types.
 *
 * A concept has THREE strings and they are not interchangeable:
 *   - `name`     — the CANONICAL English string. It is the concept's
 *                  identity-adjacent text and the token every matcher in the
 *                  product speaks. It is NOT a display string.
 *   - label      — what the user SEES (entity_labels, per locale).
 *   - submitToken — what the client SENDS BACK when the user taps the thing.
 *
 * The third one is the round-4 dependency that makes the other two safe: the
 * mobile attribute-tap submits the DISPLAYED STRING as the search query. The
 * moment a Spanish user sees "vegetariano" on a chip, the tap submits
 * "vegetariano" and matching breaks — unless the DTO also carries the
 * canonical token to submit. So every localized read surface emits
 * `entityId` + `submitToken` beside the localized `name`: display and
 * matching stop being the same field, which is the whole point of the
 * concept/label split.
 */

/** The minimum a caller must know to render a concept. */
export interface DisplayableEntity {
  entityId: string;
  /** The canonical English name — the fallback and the submit token. */
  name: string;
}

/**
 * A resolved label index for one locale: entityId → label form. Built by
 * EntityDisplayService in ONE query per read, never per row (the per-row
 * lookup is how a list page becomes N+1).
 */
export type LabelIndex = ReadonlyMap<string, string>;

/** The pair every localized DTO field carries. */
export interface LocalizedName {
  /** Localized, for the eye. */
  name: string;
  /** Canonical, for the matcher. Never localized, never absent. */
  submitToken: string;
}
