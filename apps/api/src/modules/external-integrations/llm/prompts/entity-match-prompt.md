# Entity Match

A diner-facing food app keeps a canonical list of **entities** — the real restaurants and
dishes people talk about. An extraction system has just pulled a new entity name out of a
Reddit discussion. Your job is to decide whether it names the **same real-world entity** as
one already in the list, or a new one.

You are given:

- `term` — the newly-extracted entity name to resolve.
- `kind` — what it is: `restaurant` (a specific place/business) or `food` (a dish, drink, or
  food item).
- `candidates` — the existing entities that are the closest matches to `term`, each with an
  `id`. This is a pre-filtered shortlist by name and meaning, so the real match (if any) is
  almost always here — but proximity is not sameness. Judge each on its merits.

The shortlist has already been scoped to the right market, so two candidates that share a
name are NOT here because of location — assume same-market when judging restaurants.

Return one decision:

- `match` + the `id` of the candidate that is the **same entity** as `term`.
- `new` — `term` is a real entity but **none** of the candidates is the same one.

## What "same entity" means

Two names are the same entity when they refer to the **same thing in the real world** — a
diner would consider them one and the same, not two options to choose between.

### Restaurants (`kind = restaurant`)

**Match** — the same business under a name variant:

- Spelling / spacing / punctuation: `Shake Shack` = `Shakeshack` = `Shake-Shack`;
  `Joe's Pizza` = `Joes Pizza`.
- Abbreviations and obvious typos of the same name: `McDonalds` = `McD's`; `Chipotle` =
  `Chiptole`.
- The same brand with a generic descriptor added or dropped: `Joe's Pizza` =
  `Joe's Pizzeria` = `Joe's Pizza & Pasta`; `Tacos El Rey` = `El Rey Tacos`. The distinctive
  brand token(s) are the same; the difference is only a category word (pizza, pizzeria, cafe,
  grill, kitchen, restaurant) or word order.
- A common short form people actually use for that place: `Halal Guys` = `The Halal Guys`.

**Keep separate** (`new`) — a genuinely different business:

- Different brand tokens, even if the category matches: `Joe's Pizza` ≠ `Tony's Pizza`;
  `Lucali` ≠ `Roberta's`.
- A different concept from the same owner or a sub-brand that operates as its own place,
  unless a candidate clearly IS that place.
- When the distinctive name differs at all and it is not plainly a typo/spelling variant,
  prefer `new`. Two different restaurants must never be merged.

### Dishes (`kind = food`)

**Match** — the same dish under a name variant:

- Spelling / phrasing / abbreviation: `bacon egg and cheese` = `bacon, egg & cheese` = `BEC`;
  `spaghetti and meatballs` = `spaghetti & meatballs`.
- Different words for the same dish: `soup dumplings` = `xiao long bao`; `fried chicken
sandwich` = `fried chicken sando`.
- A modifier that does not change which dish it is: `cheese pizza` ≈ `pizza` only when the
  shortlist has no more specific match — but a real sub-type is its own dish (below).

**Keep separate** (`new`) — a different dish:

- A distinct preparation or sub-type a diner orders on purpose: `margherita pizza` ≠
  `pepperoni pizza`; `pork ramen` ≠ `chicken ramen`; `spicy tuna roll` ≠ `california roll`.
- A component vs the dish: `pizza dough` ≠ `pizza`; `marinara` ≠ `spaghetti`.
- A broader category when the shortlist already has the specific dish, or vice versa, when a
  diner would not accept one for the other.

## How to decide

For each candidate, ask: would treating `term` and the candidate as one entity be **correct**
— same place, same dish — not merely similar? Merge only on a confident yes. A wrong merge
fuses two real entities and is far costlier than a spurious new one, so when the distinctive
name differs and it is not an obvious variant, choose `new`.

## Output

Return JSON only, matching the enforced output schema. `candidate_id` is the
matched candidate's id for `match`, otherwise null. If the schema requests a
`reason`, keep it to a short justification.
