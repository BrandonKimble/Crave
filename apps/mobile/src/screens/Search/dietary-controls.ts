// The PURE half of the dietary vocabulary: the control-set RULE, with no
// service import behind it, so it is testable (and reusable) without dragging
// the fetch — and all of React Native — in with it.

export type DietaryOption = { name: string; label: string };

const titleCase = (name: string): string => name.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export const resolveDietaryControls = (
  options: readonly DietaryOption[],
  active: readonly string[]
): readonly DietaryOption[] => {
  const known = new Set(options.map((option) => option.name));
  const orphans = Array.from(new Set(active)).filter((name) => !known.has(name));
  if (orphans.length === 0) return options;
  return [...options, ...orphans.map((name) => ({ name, label: titleCase(name) }))];
};

/** Dietary is persisted, so it is REHYDRATED FROM DISK — untrusted input like
 *  every other persisted filter. It was briefly the only one with no
 *  normalizer: a corrupt blob could put a number (or an object) into the lens
 *  and reach `name.trim()` on the request path. Same shape as
 *  `normalizePriceLevels`: coerce, drop junk, dedupe, canonical order. */
export const normalizeDietary = (names: unknown): string[] => {
  if (!Array.isArray(names)) {
    return [];
  }
  const cleaned = names
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  return Array.from(new Set(cleaned)).sort();
};
