# What does this word do in an ask?

You are certifying the VOCABULARY of a food-discovery app's search index. Each
numbered case gives you ONE word and ONE language. Answer one question about
it:

**When this word appears in a search, does it name a particular seekable
thing, name a kind of place or a class of consumable so broad it works like a
kind of place, or only wrap the ask around whatever else is named?**

THE LENS — a searcher, not a dictionary. Imagine the word arriving in a food
app's search box, typed by a speaker of the stated language. Ask what a
results page scoped to this word would be ANSWERING.

THE THREE ROLES:

- `particular` — the word names a specific thing a person could seek: a dish,
  a drink, an ingredient, a cuisine, a flavour or quality OF THE FOOD ITSELF,
  or a proper name. A results page scoped to it is answering a preference the
  word itself expressed. Breadth alone does not disqualify: a cuisine word is
  still particular, because it narrows WHAT is eaten.
- `venue_category` — the word names a KIND of establishment, or a class of
  consumable so broad that seeking it is really seeking a kind of place. It
  is a REAL preference — a person who types it wants something by it — but
  the preference is about WHERE or WHAT KIND OF PLACE, not about which
  particular item. A results page scoped to it is a ranked browse of places
  of that kind.
- `frame` — the word is about the RESULT LIST or the ACT OF ASKING, never
  about the thing itself: ranking and goodness of the results, proximity,
  reference to the searcher themself, politeness, verbs of wanting and
  looking-for, or asking-shape of any kind. Deleting it from the query loses
  nothing about WHAT is sought. A person who types ONLY frame words is
  asking the app to just show them what is good — that ask is real, and it
  is answered by an unscoped ranked browse, which is exactly why the word
  must not be mistaken for a thing to look up.

THE DECIDING TEST between `particular` and `frame`, and it is not optional:
**a property that some venues or dishes HAVE and others LACK is
`particular`.** Atmosphere, amenity, service mode, seating, policy, price
feel, dietary quality — romantic, quiet, cheap, takeaway, pet-friendly,
terrace, late-night, spicy, vegan — every one of these scopes the results to
the places or dishes that actually have it, which is a preference the app
answers by filtering. That is naming something sought. `frame` is reserved
for words every result competes on equally — best, top, good — where
scoping is meaningless because nothing lacks the property; those rank the
list, they do not narrow it. Ruling a venue quality `frame` DELETES a real
ask ("romantic restaurant" losing romantic), which is the single most
expensive mistake this rule can make.

WHAT DECIDES IT:

- JUDGE THE WORD AS SPELLED, IN THE LANGUAGE GIVEN. Diacritics are part of
  the word; two spellings that differ only by an accent are different words
  with different answers. Do not repair, transliterate, or strip a spelling
  into a word you find more familiar.
- A SPELLING THAT IS NOT A WORD OF THE STATED LANGUAGE IS `particular`. A
  borrowed dish name sits in a language's text constantly, and it is
  precisely the thing a person is searching for. A word that is not in the
  stated language cannot be doing that language's framing work.
- WHEN A WORD COULD PLAY MORE THAN ONE ROLE, the more contentful role wins:
  `particular` over `venue_category` over `frame`. If a person could
  genuinely be seeking the specific thing it names, it is particular; if the
  only thing they could be seeking by it is a kind of place, it is
  venue-category; it is frame only when there is nothing it names for them
  to seek at all.
- THE INDEX IS NOT EVIDENCE. This app's own index is contaminated: junk
  surfaces are banked in it — "best" exists as a ghost restaurant name,
  "good taco" as a live entity. That a word appears in the index, in entity
  names, or in past searches says NOTHING about its role. Your ruling is
  consulted BEFORE any index lookup and is independent of what the index
  banked. Judge the word, never the bank.
- THE WHOLE-DOMAIN WORD IS `frame`, by ruling. A word whose meaning is the
  app's ENTIRE domain — "food" and its exact equivalents meaning
  eating-in-general — adds nothing to an ask typed into a food app: the
  search box already means food. It drives a browse and expresses no
  preference to record. This is the one place breadth does decide: total
  breadth is no preference at all. A word for a KIND of food place or a
  genuine subclass is still `venue_category` — it narrows something.
- A PROPER NOUN, A BRAND, OR A PLACE NAME is `particular`: it names
  something specific to seek.

THE LANGUAGE TAG `und` means nobody could determine the language of this
word. Answer for the word as a bare string that some human typed into a food
search: give the role its most natural food-search reading has in any
language that spells it this way, applying the same precedence — particular
if any such reading names a specific seekable thing.

GOLD CASES — these exact answers are the calibration of the rule:

| word          | language | answer         | why                                                             |
| ------------- | -------- | -------------- | --------------------------------------------------------------- |
| `tacos`       | en       | particular     | names a dish                                                    |
| `birria`      | es       | particular     | a stew — a specific thing to order                              |
| `牛肉面`      | zh       | particular     | beef noodle soup — a dish                                       |
| `boba`        | en       | particular     | a drink                                                         |
| `coffee`      | en       | particular     | a drink a person can seek by name                               |
| `restaurants` | en       | venue_category | a kind of place; the preference is about where                  |
| `bar`         | en       | venue_category | a kind of establishment                                         |
| `bakery`      | en       | venue_category | a kind of establishment                                         |
| `餐厅`        | zh       | venue_category | "restaurant" — a kind of place                                  |
| `best`        | en       | frame          | ranks the results; names nothing sought — the ghost restaurant  |
|               |          |                | banked under this spelling is contamination, not evidence       |
| `top`         | en       | frame          | ranks the results; names nothing sought                         |
| `near`        | en       | frame          | proximity of the results; names nothing sought                  |
| `me`          | en       | frame          | the searcher themself; never a thing to look up                 |
| `最好`        | zh       | frame          | "best" — ranks the results                                      |
| `food`        | en       | frame          | the whole domain — adds nothing in a food app's search box      |
| `romántico`   | es       | particular     | an atmosphere some venues have and others lack — a real filter  |
| `tranquilo`   | es       | particular     | quiet — a venue property, not a ranking of results              |
| `llevar`      | es       | particular     | takeaway — a service mode a venue offers or does not            |
| `good`        | en       | frame          | goodness of the results; nothing lacks it, so it scopes nothing |
| `busco`       | es       | frame          | "I look for" — the act of asking, names nothing sought          |

Return ONLY JSON matching the enforced output schema: for each case,
`word_role` (`particular`, `venue_category` or `frame`) and `reason` — one
short sentence naming the ACTUAL ground, in the terms above. The reason is
read by people auditing verdicts; a blank reason leaves the word unjudged.
