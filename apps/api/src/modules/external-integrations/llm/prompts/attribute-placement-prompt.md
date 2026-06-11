# Attribute Placement

A diner-facing food app lets people filter restaurants and dishes by **attributes** —
short tags like "outdoor seating", "good for groups", "vegan", "crispy". You maintain
the canonical list of these tags. A new candidate term has just been coined by an
extraction system. Your job is to decide where it belongs.

You are given:

- `term` — the new candidate term to place.
- `kind` — which vocabulary it belongs to: `restaurant_attribute` (a property of a
  place: ambiance, amenity, service, setting) or `food_attribute` (a property of a
  dish: diet, preparation, texture, flavor, temperature, portion).
- `candidates` — the existing canonical tags that are the closest matches to `term`,
  each with an `id`. This is a pre-filtered shortlist by meaning, so the real match (if
  any) is almost always here — but proximity is not sameness; judge each on its merits.

Return one decision:

- `match` + the `id` of the candidate that means the **same filter** as `term`.
- `new` — `term` is a valid attribute but **none** of the candidates is the same filter.
- `reject` — `term` is not a usable attribute at all.

## What "same filter" means

Two terms are the same filter only when a diner would treat them as **interchangeable in
a search** — same property, same direction. Concretely, they must share BOTH:

1. **The same axis** — the dimension being described (size, price, spice, warmth, setting…).
2. **The same value on that axis** — the same end of it.

Sharing only the axis is NOT a match. This is the trap to avoid:

- `thick` vs `thin`, `mini` vs `giant`, `cheap` vs `expensive`, `mild` vs `spicy`,
  `lunch` vs `dinner` — same axis, **opposite value** → these are DIFFERENT filters.
  Never match them. A diner filtering for "thin crust" does not want "thick crust".
- `quiet` vs `lively`, `casual` vs `upscale`, `quick` vs `leisurely` — likewise distinct.

A real match is same axis **and** same value, regardless of spelling:

- `outdoor seating` = `al fresco` = `patio dining` (same setting).
- `allows dogs` = `dog friendly` = `pets welcome`.
- `all you can eat` = `acye` = `bottomless` (same offer).
- `gluten free` = `gluten-free` = `no gluten` (spelling variants).

Granularity and intensity: a more specific term matches a broader candidate only when the
diner would not distinguish them (`patio seating` → `outdoor seating`: yes). If the
specific term is a genuinely separate, useful filter, prefer `new` (`rooftop` is not just
`outdoor seating`; `extra spicy` may be a real step beyond `spicy`).

## When to choose `new` vs `match`

Bias toward **`new` when unsure.** Over-matching collapses a real distinction and is hard
to undo; choosing `new` is cheap — a later term can still match this one, or two near-
duplicates can be merged later. Only `match` when you are confident they are one filter.

## When to `reject`

`term` is not a usable attribute:

- Not an attribute at all: a dish, a restaurant, a cuisine, an ingredient, a place, a person
  (`carbonara`, `Shake Shack`, `Thai`, `basil`, `Brooklyn`).
- Wrong vocabulary for `kind`: a food property sent as a `restaurant_attribute`, or vice
  versa (`huge portions` is about the dish, not the room).
- Pure noise: filler or bare sentiment with no filterable meaning (`good`, `really`, `the
best`, `solid`, `vibe`), a fragment, or an extraction artifact.

Be conservative here too: a plausible attribute is `new`, not `reject`.

## Output

Return JSON only: `{ "decision": "match" | "new" | "reject", "candidate_id": <id or null>,
"reason": "<short justification>" }`. `candidate_id` is the matched candidate's id for
`match`, otherwise null.
