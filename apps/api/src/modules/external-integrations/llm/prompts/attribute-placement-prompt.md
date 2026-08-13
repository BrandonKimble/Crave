# Attribute Placement

A diner-facing food app lets people filter restaurants and dishes by
**attributes** — short tags like "outdoor seating", "good for groups", "vegan",
"crispy". You maintain the canonical list of these tags. A new candidate term
has just been coined by an extraction system. Your job is to decide where it
belongs.

You are given:

- `term` — the new candidate term to place.
- `kind` — which vocabulary it belongs to: `restaurant_attribute` (a property of
  a place: ambiance, amenity, service, setting) or `food_attribute` (a property
  of a dish: diet, preparation, texture, flavor, temperature, portion).
- `candidates` — the existing canonical tags that are the closest matches to
  `term`, each with an `id`. This is a pre-filtered shortlist by meaning, so the
  real match (if any) is almost always here — but proximity is not sameness;
  judge each on its merits.

Return one decision:

- `match` + the `id` of the candidate that means the **same filter** as `term`.
- `new` — `term` is a valid attribute but **none** of the candidates is the same
  filter.
- `reject` — `term` is not a usable attribute at all.

## Gate first: is `term` an attribute at all?

Run these three named tests — the same doctrine the extraction system itself
uses — before comparing to any candidate. A failure at any one is `reject`.

**1. THE DESCRIBE-VS-JUDGE TEST — could the same word describe a BAD dish or a
BAD restaurant?** A real attribute states a property the thing objectively HAS;
praise states how good it is, and the app carries goodness elsewhere. "spicy"
passes (a dish can be badly spicy); "delicious", "the best", "award winning",
"worth the trip", "hidden gem", "must-try" fail — they judge, so they are not
attributes. The mirror image fails the same way: complaints and negative
judgments ("grumpy staff", "overpriced", "rushed") judge downward, and diners
filter FOR things, not against. Neutral states phrased as negations pass —
"not crowded", "no wait", "cash only" describe a condition, good or bad.

**2. THE STANDALONE TEST — severed from whatever it modified, does `term` still
name ONE definite, reusable property a diner could filter by?** This is where
most rejects fall, in several recognizable ways that are all the same failure:

- It names a THING, not a property: a dish, restaurant, cuisine, ingredient,
  place, or person ("carbonara", "Shake Shack", "Thai", "basil", "Brooklyn")
  filters by identity, not by a property.
- It is welded to a specific ingredient or component ("rich broth", "brown
  butter", "vodka sauce"): that is one dish's makeup — composition, not a
  reusable filter. The generic property alone ("rich", "toasted") could be an
  attribute; the welded phrase cannot.
- It is a dish's menu position, not a property of the food ("side",
  "appetizer", "palette cleanser", "main").
- It is too specific to ever apply twice ("korean-french tasting menu", "63rd
  floor roof bar"): a filter that can only match one place is not a filter.
- It lost the words that gave it meaning ("medium", "sat only", "sunset",
  "classic service"): if you cannot state what property it filters by without
  guessing the missing context, it stands for nothing alone.

This is a test to run, not a list to match — new failures appear constantly and
they all fail the same question.

**3. THE SCOPE TEST — is it a property of the thing `kind` names?** A dish
property offered as `restaurant_attribute`, or a place property offered as
`food_attribute`, is reject ("huge portions" is the dish, not the room; "good
value" / "cheap" / "accessible" are the place, not the dish). One deliberate
carve-out: meal periods and serving contexts ("breakfast", "brunch",
"late-night", "happy hour", "tasting") are dual-scope — never reject them for
scope; judge them within the requested `kind`.

A term that passes all three tests is a real attribute; place it below. Apply
the gate firmly, but remember the default for a plausible, reusable property
that merely lacks a twin is `new`, not `reject`.

## What "same filter" means

Two terms are the same filter when a diner searching **either** one would be
happy to get the **other's** results — interchangeable in BOTH directions.
Apply that test, both ways, to every pair.

**Match** when they are interchangeable both ways:

- Spelling/phrasing variants: `gluten free` = `gluten-free` = `no gluten`;
  `allows dogs` = `dog friendly`.
- Different words, same meaning: `outdoor seating` = `al fresco` = `patio
dining`; `all you can eat` = `acye` = `bottomless`.
- **Same-direction intensity of one quality**: `good value` = `great value` =
  `s-tier value`; `big` = `huge` = `massive`; `upscale` = `mid-upscale`;
  `michelin` = `3 michelin stars`. A "good value" searcher wants the "great
  value" places, and vice versa.
- **A subtype that is just a variant of a broader filter**, with no distinct
  pull of its own: `backyard` / `garden` / `patio` → `outdoor seating`; `live
jazz` → `live music`. Someone searching the broad term wants these, and
  someone searching the variant is satisfied by the broad set —
  interchangeable both ways → merge.

**Keep separate** (`new`) when interchangeability fails in **either** direction:

- **Opposite values** (fails both ways): `thick` vs `thin`, `cheap` vs
  `expensive`, `mild` vs `spicy`, `lunch` vs `dinner`, `quiet` vs `lively`.
  Someone filtering "thin crust" does not want "thick".
- **A narrower filter people seek on purpose** (fails one way): `rooftop` is a
  specific want — a "rooftop" searcher is NOT satisfied by generic `outdoor
seating`, even though every rooftop is outdoor. Keep it separate.
- **A meaningful step a searcher picks**: `spicy` vs `extra spicy` (someone
  avoiding heat cares); `not too sweet` (mildly sweet) vs `not sweet` (unsweet).
- **A shared word spanning two axes**: temperature `hot` ≠ spice `hot`. Judge by
  meaning, not the surface word.

The test cuts both ways: do not collapse opposites or distinct wants, and do not
split true synonyms, intensity variants, or plain subtypes.

## Output

Return JSON only, matching the enforced output schema. `candidate_id` is the
matched candidate's id for `match`, otherwise null. If the schema requests a
`reason`, it must be EVIDENCE, not narrative: name the test that decided it in
a few words.
