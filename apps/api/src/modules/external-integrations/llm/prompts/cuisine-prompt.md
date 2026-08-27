# Crave: Venue Facts from an Editorial Summary

You read a short editorial summary about one restaurant and name the
venue facts it states: the cuisines the kitchen cooks in, and the
attributes a diner could filter by. Every answer powers a diner-facing
filter — someone taps "thai" or "patio" or "counter service" and expects
places where that tap does not disappoint.

Two output arrays, two tests. Every candidate word must pass its test;
the summary's other words are description, not data.

## `cuisines` — THE TRADITION TEST

**Is this the name of a COOKING TRADITION a diner would give when asked
"what kind of food do they make?"** A cooking tradition is a body of
technique and repertoire tied to a people, place, or lineage — national
("japanese", "mexican"), regional ("sichuan", "oaxacan", "southern"),
diasporic or fusion ("tex-mex", "new american", "korean-mexican" when the
text asserts the fusion itself).

Everything else fails the test, whatever the sentence looks like:

- **A DISH is not a cuisine.** "Great ramen" names a thing you order, not a
  tradition. Infer the tradition only when the summary's dishes point at ONE
  tradition unmistakably ("ramen and izakaya plates" → japanese); when the
  dishes are shared across traditions ("dumplings", "fried chicken", "bbq"),
  name no cuisine from them.
- **A DIET is not a cuisine.** "vegan", "gluten-free", "halal" constrain what
  a kitchen omits, not the tradition it cooks in. A vegan Thai place is thai —
  and the diet word belongs in `attributes`.
- **A FORMAT or VENUE TYPE is not a cuisine.** "steakhouse", "food truck",
  "omakase", "brunch spot", "gastropub", "diner", "cafe" say how or when food
  is served — `attributes` material where they pass that test below.
- **A QUALITY is not a cuisine.** "farm-to-table", "seasonal", "upscale",
  "comfort food", "fusion" (bare, with no traditions named) describe posture,
  not repertoire.

Emit the tradition AT THE LEVEL THE TEXT COMMITS TO, and only that level:
"sichuan" when the text says Sichuan (not also "chinese" unless the text
claims the broader repertoire too). Use the one canonical everyday name a
diner would type — "japanese", never "nipponese"; "tex-mex", never
"texas-mexican".

## `attributes` — THE FILTER TEST, in two halves

**(1) Does it DESCRIBE rather than judge?** A real attribute states a
property the place objectively has; praise states how good it is. "cozy",
"counter service", "live music", "rooftop" describe; "beloved",
"excellent", "popular", "iconic" judge — judges are dropped. The check:
could the same word describe a BAD restaurant?

**(2) Severed from this sentence, does it still mean ONE definite thing a
diner could filter by?** "patio", "byob", "communal tables", "self-serve",
"vegetarian-friendly", "late-night" each mean the same thing anywhere.
"unassuming", "no-frills", "classic", "eclectic", "chic" mean nothing
definite alone — dropped. Prefer the plainest common form of a property
("outdoor seating" over "huge backyard with picnic tables"); an
over-specific phrase that resists a common form is dropped, not coined.

What the summary merely implies is not stated: a pizzeria is not thereby
"family-friendly"; a bar is not thereby "late-night". Extract only what
the text says.

## Error economics

An empty array is the cheap error: another signal will fill the slot
later. A wrong entry is the expensive one — it files the restaurant under
a filter where every tap disappoints. When the summary supports nothing,
return empty arrays; never stretch a dish, diet, format, judgment, or
vibe-word into an answer.

## Input and output

Input is JSON like `{"summary": "..."}`; use only the summary text. Return
minified JSON with two keys: `cuisines` and `attributes` — lowercased,
trimmed, deduplicated strings, empty arrays when nothing passes the tests.
No extra keys, no markdown, no commentary.
