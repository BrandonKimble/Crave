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

Two terms are the same filter when a diner searching **either** one would be happy to get
the **other's** results — interchangeable in BOTH directions. Apply that test, both ways, to
every pair.

**Match** when they are interchangeable both ways:

- Spelling/phrasing variants: `gluten free` = `gluten-free` = `no gluten`; `allows dogs` =
  `dog friendly`.
- Different words, same meaning: `outdoor seating` = `al fresco` = `patio dining`;
  `all you can eat` = `acye` = `bottomless`.
- **Same-direction intensity of one quality**: `good value` = `great value` = `s-tier value`;
  `big` = `huge` = `massive`; `upscale` = `mid-upscale`; `michelin` = `3 michelin stars`. A
  "good value" searcher wants the "great value" places, and vice versa.
- **A subtype that is just a variant of a broader filter**, with no distinct pull of its own:
  `backyard` / `garden` / `patio` → `outdoor seating`; `live jazz` → `live music`. Someone
  searching the broad term wants these, and someone searching the variant is satisfied by the
  broad set — interchangeable both ways → merge.

**Keep separate** (`new`) when interchangeability fails in **either** direction:

- **Opposite values** (fails both ways): `thick` vs `thin`, `cheap` vs `expensive`, `mild` vs
  `spicy`, `lunch` vs `dinner`, `quiet` vs `lively`. Someone filtering "thin crust" does not
  want "thick".
- **A narrower filter people seek on purpose** (fails one way): `rooftop` is a specific want —
  a "rooftop" searcher is NOT satisfied by generic `outdoor seating`, even though every
  rooftop is outdoor. Keep it separate.
- **A meaningful step a searcher picks**: `spicy` vs `extra spicy` (someone avoiding heat
  cares); `not too sweet` (mildly sweet) vs `not sweet` (unsweet).
- **A shared word spanning two axes**: temperature `hot` ≠ spice `hot`. Judge by meaning, not
  the surface word.

The test cuts both ways: do not collapse opposites or distinct wants, and do not split true
synonyms, intensity variants, or plain subtypes.

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
- **A dish role or course, not a property** → `side`, `palette cleanser`, `appetizer`, `main`,
  `dessert`-as-course describe where a dish sits on a menu, not a filterable quality of it.
- **An ambiguous, context-stripped fragment** → a term that asserts no clear property on its
  own because it lost the words that gave it meaning: `medium` (medium what?), `sat only`,
  `sunset`, `weekdays`, `classic service`. If you cannot state what property it filters by
  without guessing the missing context, reject it.
- **Wrong vocabulary for `kind`**: a food property sent as `restaurant_attribute` or vice
  versa (`huge portions` is the dish, not the room; `good value` / `cheap` / `accessible` are
  the place, not the dish). EXCEPTION — meal periods and serving contexts (`breakfast`,
  `brunch`, `late-night`, `happy hour`, `tasting`) are **dual-scope**: never reject these for
  scope; judge them within the requested `kind`.
- **Praise, accolades, or recommendation language** — anything judging how good or
  worth-visiting something is, not what it is: bare praise (`good`, `the best`, `solid`), and
  accolades that read like features but aren't (`award winning`, `worth the trip`, `must-try`,
  `hidden gem`, `iconic`, `top-notch`). Drop them, plus filler (`really`, `vibe`) and
  extraction artifacts.

A plausible, reusable attribute is `new`, not `reject` — but apply the bar above firmly.

## Output

Return JSON only: `{ "decision": "match" | "new" | "reject", "candidate_id": <id or null>,
"reason": "<short justification>" }`. `candidate_id` is the matched candidate's id for
`match`, otherwise null.
