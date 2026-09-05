# Prompt v24 — the rulings and the rederivation (2026-09-04)

Source: the 1,000-mention audit (plans/prompt-audit-2026-09-04.md), my own read of
100 v22-vs-v23 differences, and the owner's rulings of 2026-09-04 evening. This is
the spec the v24 text encodes. Nothing here is a patch; each line is the principle
the model is asked to run.

## What the audit proved about the model

- It knows the rules. When wrong it names the opposing instruction itself 91% of the
  time and reports low confidence. The failure is choosing between two applicable
  sentences, and skipping the assembly of everything a source earned.
- Its decisions are unstable at temperature 0.1 (one in six emitting sources flip
  between identical runs). Temperature is now 0 (10.0% → 3.4% flips).
- v22 and v23 share the same failure classes; neither is strictly better.

## Owner rulings (verbatim intent)

1. Bakeries and dessert shops make what they sell: a cake, pastry, kolache, cookie
   bought there is a PREPARED item, not a grocery shelf. The retail law (B.2) stays
   for stores that sell things they did not make, and for packaged goods.
2. A pick that also names a dish emits BOTH the place carrier and the dish. One
   comment is ONE restaurant vote and ONE vote per distinct dish — enforced in the
   scorer/projection, not by withholding the carrier. How the three counters treat
   one comment today (read end to end 2026-09-04):
   - the public crave score: dish lane per dish (a comment counts once per dish it
     names); restaurant = discounted aggregate of its dishes' endorsement (best dish
     fully, each next ×rho) plus a by-name praise term (deduped per source document,
     weighted 2×) — a "one-pool" variant (every ballot, by dish or by name, in one
     pool) already exists as a bake-off probe (config.pooling);
   - the search rollup (`restaurant_vote_totals`: the minimum-votes gate, the crave
     tie-break, the "N mentions · M votes" receipt): WAS every dish mention row and
     never the carrier — a five-dish comment = five votes, a praise-only comment =
     zero; NOW distinct source documents across dish mentions and carriers (commit
     4672b1dd1);
   - the restaurant's `general_praise_upvotes` projection: deduped per source
     document already.
   Options weighed: (A) count every mention (old rollup) — a listy comment is five
   people; (B) praise carriers only — a dish-only comment is invisible at
   restaurant level; (C) distinct documents per restaurant, per-dish counts
   untouched — one person, one vote, one vote per dish; (D) one-pool for the score
   too. Chosen: C for the rollup (done). For the score, the composite stays: a
   restaurant with five praised dishes SHOULD outrank one with one, and the rho
   discount already dampens breadth; its praise term is per-document already. The
   prompt's job is therefore simply to emit everything a source earned; fairness
   is the counters' job, and it is now consistent across them.
3. Structure and formatting are context. A heading, a label, a list shape supplies
   what an inline phrase would ("TACOS:" over a list is "PLACE for tacos" written
   vertically) — as a principle about reading, never a rule per format.
4. A question-marked nomination under a rec ask ("Uchiko?", "Have you tried X?") is
   a pick when it names a place the asker did not.
5. Only the writer's own experience is testimony. Reported consensus, "highly rated",
   a companion's verdict, "people say" — none of it. (A.1's "consensus reported"
   bullet is deleted.)
6. Fit words come from the ask's REQUIREMENTS, never its nice-to-haves ("bonus points
   if…"), and only onto a bare pick or an answer that hands the asked-for thing. The
   model chooses the natural canonical word itself (its judgment is the aliasing
   system's input); the prompt gives the kind of word, not a word list.
7. A value downgrade never defeats a vouch ("great but pricey" vouches; `expensive`
   is stated). Negative-but-true properties (expensive, salty, loud) are kept on an
   otherwise positive mention. Only a verdict that lands AT or BELOW the ordinary on
   taste withholds.
8. A diner's own photo post captioned "X at Y" is a vouch, the same way "X at Y" in
   a reply is.
9. THE DISH BOUNDARY, rederived from the v23 census (4,443 distinct names, 13,080
   mentions; every structure/format/occasion/frame word classed and read in context):
   a dish name names WHAT ARRIVES. Three probes, in order —
   (a) the thing, not its slot/time/mode/wish: a food, a house-named offering, or a
   format that IS the order (omakase 78 mentions/29 places, tasting menu 30/17, lunch
   special 32/24, thali, bento box, flight, board, 2/3 meat plate) names it; a menu
   slot (appetizer 11, entree, side, dessert 22, drink 15), a time (breakfast 15,
   lunch 5, brunch), a mode (buffet, hot bar, catering), or the wish (food 7, meal,
   plate of food) alone never does — praised as a whole it is a PLACE attribute
   (`dessert`, `breakfast`, `buffet`) so the search still finds the place; welded to
   a food word it stays as written (breakfast taco 266, side salad, dinner roll);
   (b) would another diner ask for it with the same words — the menu's own count
   stays ("3 meat plate", "double double", "5 piece"), the writer's quantity is
   stripped ("21 course omakase" → omakase, "12-inch pie" → pie); a schedule is
   never a name ("wednesday night special" → affordable, no dish) while a food- or
   coinage-named special is ("pork chop special", "the Jess special");
   (c) a stand-in ("the combo", "a slice", "the bowl") resolves to the SAME-PLACE
   offering the scope names ("the slice window" in a thread titled "homeslice pizza"
   → `pizza slice` — resolution, not invention); with no antecedent it stays as
   written ONLY when it is the venue's own offering by that name (bowls at Cava,
   slices at a slice shop — bowl 11/8 places, slice 11/8 places in the census); with
   neither, no dish. The "take the food from what the thread is about" idea was
   tested against the data and REJECTED as a general rule: it would invent words
   the source never wrote ("the bowls" at Loro would become "burger bowl"); only a
   word written in scope may be resolved to. Downstream, the dish-knowledge pass
   derives categories from the NAME alone, so `slice` alone will not reliably roll
   into pizza — one more reason resolution (not invention) matters.
10. Prepared by the kitchen counts, wherever it is eaten (a hot bar's named item, a
    bakery's cake, a restaurant's takeout). A format you attend (buffet, hot bar) is
    an attribute, never a dish. Catering is a service, not a plate: a food verdict on
    it stands as the place carrier; no dish unless named.
11. Staff relatives are judged by the text: "my son works there, the food is great"
    is word of mouth; the business's own voice, or "our"/"my shop", is promotion.
12. If they like the food, the food claim stands. A boycott or an ethics steer is not
    a food verdict and neither creates nor erases one.
13. A temporary stock-out ("haven't had them lately") is not a removed dish. Only
    removal or "used to" language kills a dish.
14. Multi-dish asks: a bare pick inherits the dish(es) the ask leads with when they
    are interchangeable ("crab rangoon / cream cheese wonton" → both); when the reply
    names its own dish, that dish is the link and nothing is inherited. A cuisine or
    tradition word in the ask ("sushi", "BBQ", "Indian") is never a dish; it reaches
    a pick only as a place attribute.
15. Social handles are not names; nothing emits from a handle.
16. Names and dish words are written AS the source wrote them — no brand repair, no
    diacritic added or removed, no expansion from a sibling or title, no `&amp;`.
17. Geography is never a gate (unchanged).
18. Shelf/wholesale law stays as written (unchanged).

## The four contradictions the audit found, resolved

- F.1: "an ANSWER-TEST pick ALWAYS produces this carrier" vs "aimed at a dish → no
  carrier". Resolution: a pick is a place-subject act and always carries; a verdict
  clause whose subject is a DISH earns the dish only. Both can be true of one source.
- A.2 NEGATIVE CONTENT written as a genre ("a reply to an explicitly negative ask").
  Resolution: acts are per clause; a bare pick under a negative ask nominates a
  criticized subject; a verdict clause lands as ever.
- Gate 1 "the bare word stands as its own generic dish" vs C.2 "never peel to a bare
  structure word". Resolution: ruling 9.
- Gate 3 "subjunctive benchmark earns at most affordable" vs A.2 deal posture.
  Resolution: a benchmark held up as the better value is a recommended deal (vouch +
  affordable); a benchmark merely priced is a fact.
- A.1 "consensus reported" vs A.2 hearsay. Resolution: ruling 5.
- LANDING TEST "price qualifying THIS subject's verdict defeats it" vs "a gripe on
  another axis stands". Resolution: ruling 7.

## The structural moves

1. THE ASSEMBLY: per source, per restaurant, the output is the UNION of what its
   clauses earned — the carrier (a pick or a place-subject verdict), the inherited
   dish, each own dish, each attribute with its per-word blocking, each source
   pointer. Stated once as a checklist the model runs before writing mentions.
2. Precedence, stated once: mode (served/shelf) before quality; acts per clause; a
   subject lands only on its own clauses; the ONE QUESTION decides only bare
   nominations; as-written before everything downstream.
3. The worksheet in the output: the schema gains a per-source `sources[]` block
   (subjects, acts, landing, inherited words, the temp_ids emitted) that the model
   fills BEFORE `mentions`. At LOW thinking the model skips the procedure; writing it
   down makes it run, and it records the reasoning for every mention.
4. Delete the sentences that only exist to argue with each other.
