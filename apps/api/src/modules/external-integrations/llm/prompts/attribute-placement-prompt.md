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

Two terms are the same filter when a diner would be happy to get **both** results from one
search — interchangeable for filtering. Decide each pair by what a searcher actually wants.

**Match** when one term is just another way of saying the other, or a same-direction degree
of one quality a searcher would not distinguish:

- Spelling/phrasing variants: `gluten free` = `gluten-free` = `no gluten`; `allows dogs` =
  `dog friendly`.
- Different words, same meaning: `outdoor seating` = `al fresco` = `patio dining`;
  `all you can eat` = `acye` = `bottomless`.
- **Same-direction intensity of one quality** → merge: `good value` = `great value` =
  `s-tier value`; `big` = `huge` = `massive`; `upscale` = `mid-upscale`; `michelin` =
  `3 michelin stars`. A diner searching "good value" wants the "great value" places too.

**Keep separate** (`new`) when the difference is one a diner would deliberately choose
between:

- **Opposite values** on an axis: `thick` vs `thin`, `cheap` vs `expensive`, `mild` vs
  `spicy`, `lunch` vs `dinner`, `quiet` vs `lively`. Never merge opposites — someone
  filtering "thin crust" does not want "thick".
- **A meaningful step a searcher picks**: `spicy` vs `extra spicy` (someone avoiding heat
  cares); `not too sweet` (mildly sweet) vs `not sweet` (unsweet).
- **A shared word spanning two axes**: temperature `hot` ≠ spice `hot`. Judge by meaning,
  not the surface word.
- **A genuinely narrower filter**: `rooftop` is not just `outdoor seating`.

The deciding question for any degree/intensity pair: _would a search for the milder term be
worse off for including the stronger one?_ No → same filter, **match**. Yes → **new**. This
cuts both ways: do not collapse opposites, and do not split true synonyms over intensity.

## When to `reject`

`term` is not a usable attribute:

- **Not an attribute at all**: a dish, restaurant, cuisine, ingredient, place, or person
  (`carbonara`, `Shake Shack`, `Thai`, `basil`, `Brooklyn`).
- **Bound to a specific ingredient or component** → that is a dish's makeup, not a reusable
  filter: `rich broth`, `toasted garlic`, `brown butter`, `vodka sauce`, `thick layers`. The
  generic property alone (`rich`, `toasted`) can be an attribute; the ingredient-bound phrase
  is composition — reject it.
- **A complaint or negative-quality judgment** → the app recommends; diners filter FOR
  things, not against: `grumpy staff`, `overpriced`, `terrible acoustics`, `rushed`,
  `inefficient`, `loud`. Reject. (Neutral negatives that name a desirable state are fine:
  `not crowded`, `no wait`, `cash only`.)
- **Too specific to reuse** → if only one place or dish could ever have it, it is not a
  filter: `korean-french tasting menu`, `63rd floor roof bar`, `cocktails in early evening`,
  `relaxed edomae`. The reusable core (`tasting menu`, `rooftop bar`) is the attribute; the
  over-specific compound is not.
- **Wrong vocabulary for `kind`**: a food property sent as `restaurant_attribute` or vice
  versa (`huge portions` is the dish, not the room; `good value` / `cheap` / `accessible` are
  the place, not the dish). EXCEPTION — meal periods and serving contexts (`breakfast`,
  `brunch`, `late-night`, `happy hour`, `tasting`) are **dual-scope**: never reject these for
  scope; judge them within the requested `kind`.
- **Pure noise or sentiment**: bare praise or filler with no filterable meaning (`good`,
  `really`, `the best`, `solid`, `vibe`), a fragment, or an extraction artifact.

A plausible, reusable attribute is `new`, not `reject` — but apply the bar above firmly.

## Output

Return JSON only: `{ "decision": "match" | "new" | "reject", "candidate_id": <id or null>,
"reason": "<short justification>" }`. `candidate_id` is the matched candidate's id for
`match`, otherwise null.
