# The 1,000-mention audit — 2026-09-04

Owner order: "find all the issues, not just these, put them into categories, figure out exactly
why each happened, see patterns, outliers, flakiness, and understand the model's thought process
when it made the wrong decision — then rederive the ideal principle rather than patch silos."

## Method

- Population: the v23 Austin shadow (39,793 documents, 29,451 emitted mentions, 14,899 documents
  that emitted something, 24,894 silent).
- Sample: 998 units — 600 emitted mentions (random) and 398 silent documents (200 where v22 had
  emitted for the same source, 198 random). 608 distinct input chunks.
- Three model runs on those chunks, exact production request (registry prompt v23, same schema,
  thinking LOW): a fresh replay at temperature 0.1 (all 608), a second replay on 150 chunks for
  three-way stability, and two replays at temperature 0 on 60 chunks.
- A rationale interview per sampled source: the model is shown its own v23 output and asked which
  instruction decided, and which instruction argues the opposite. Gemini 3 Flash returns no thought
  summaries at any thinking level with a response schema, so this post-hoc account is the closest
  available record of the model's reasoning.
- Ten Fable classifiers, each with the full prompt and ~100 units, judged the IDEAL output per
  source against v23, with cause, rules quoted, stability, and doctrine questions. Every unit has
  a verdict line. Data: scratchpad `audit/` (units, verdicts_all.json, interview.jsonl,
  rationale*.jsonl, temp0_*.jsonl).
- Spend: ~$10 of Gemini (interactive, cached system prompt), outside any campaign — reconcile.

## Headline numbers

| | count |
|---|---|
| units | 998 |
| correct | 506 (51%) |
| partially wrong | 259 (26%) |
| wrong | 132 (13%) |
| debatable | 101 (10%) |
| wrong or partial | 391 |
| …of which the rerun disagreed on the very point (coin flip) | 171 (44%) |
| …rule exists and was misapplied | 199 |
| …prompt contradiction | 22 · prompt gap 49 · doctrine question 23 · downstream 2 · chunk context 4 |

Silent documents: 398, of which 97 were real misses (62 of those unstable). Emitted mentions: 600,
of which 242 fully correct for the whole source; most "partially wrong" is a missing sibling
(the dish the ask implied, the place carrier, an attribute), not a wrong mention.

## Stability (the largest single cause)

| setting | sources identical across runs | emit/silent flips among emitting sources |
|---|---|---|
| temperature 0.1, three runs, 150 chunks | 81.5% (2-of-3 agree 15%, no agreement 3.4%) | 16.7% |
| temperature 0.1, two runs, same 60 chunks | 86.4% | 10.0% |
| temperature 0, two runs, same 60 chunks | 94.9% | 3.4% |

One in six emitting sources is a coin flip at the production temperature. Temperature 0 cuts the
flip rate by two thirds at no cost. Recommendation: v24 runs at temperature 0; keep measuring.

## What the model was thinking

When wrong, the model named the OPPOSING instruction in its own rationale 91% of the time
(58% when correct) and reported high confidence only 39% of the time (90% when correct). The
failure is not ignorance of a rule. It is choosing between two applicable rules with no stated
precedence, and it knows it.

## The classes (stable, systematic — the rederivation targets)

Counts are stable (rerun agrees) wrong/partial units; unstable ones are excluded here.

1. **Assembly: a source must emit EVERYTHING it earned, and the model emits one thing.**
   missed_dish 50, carrier_wrong 38. A bare pick under a dish-targeted ask gets its carrier and
   never the inherited dish (Gate 3), or a "PLACE's DISH is insane" pick emits the dish and never
   the carrier (F.1 "both at once"). The rationales cite the very rule as the "opposite case".
   F.1 also contradicts itself for dish-only picks ("ALWAYS produces this carrier" vs "aimed at a
   dish → no carrier"). One principle owed: per source, per restaurant, the output is the UNION
   of what its clauses earned — carrier (pick or place-subject clause), inherited dish, own dishes,
   attributes — assembled by a checklist, never a single best mention.
2. **Genre reading survives the "no genre" law.** missed_vouch 33, negative_content_leak 4. A pan
   of one subject silences a sibling vouch; a thread's ask (negative, fact, plan) silences a
   verdict clause; conversely fact asks leak carriers when the asker adds a courtesy quality word.
   The A.2 NEGATIVE CONTENT bullet is written as a genre ("a reply to an explicitly negative
   ask"). One principle owed: acts are per clause, and only a subject's own clauses land it.
3. **Attributes: fit assertion without its blocking clause; describing words missed.**
   missed_attribute 36, false_attribute 17. `vegan` stamped on places the writer says are not
   vegan; `affordable` on "much more expensive"; dietary words dropped; venue-property facts
   ("lots of outdoor seating") earn nothing while a cuisine word stated in text is missed. The
   no-double-ride rule is applied backwards (`spicy` peeled out of "spicy boiled fish").
4. **As-written fidelity.** normalization_error 9, wrong_place 7, source_id_wrong 9. Names
   repaired toward the brand ("Tex Sueno" → `tex sueño`, "ATX Cocina" → `atx cucina`), letters
   dropped ("Bouldin Creek Café" → `bouldin creek caf`, then REFUSED downstream as
   span_not_in_cited_source — a correct pick lost twice), fuller forms borrowed from siblings or
   titles, `&amp;` emitted for "&", `place_source_id` pointing at the wrong source both ways.
5. **Yardstick and value.** false_vouch 28 (with class 6). The losing side of a comparison gets
   carriers; the winning benchmark of "X is better than Y" (subject found wanting) is missed;
   "great but not the best value" defeats a vouch under the prompt while the owner's doctrine
   says value never defeats taste. Gate 3's "subjunctive benchmark" carve-out contradicts the
   deal-posture principle.
6. **Retail and fact asks.** retail_leak 8, ask_leak 3, dish_noise 7. Grocery/meat-market picks
   emitted under shelf asks; receipts and priced lists birth dishes; occasions ("breakfast" ×6,
   "brunch"), structure words ("slice", "daily plate special", "combo"), size frames ("Texas size
   katsu", "2 or 3 meat plate") emitted as dishes — Gate 1's own sentence "I got the combo alone →
   combo" licenses the bare structure word the C.2 law forbids.
7. **Affirmations and adoption.** "Mine also", "can confirm!", "This. The filet is killer" emit
   nothing or only the dish; most flip on rerun — an assembly failure (class 1) plus instability.
8. **List shapes.** Headings ("TACOS:", "Kolaches-") sometimes bequeath their word to entries
   and sometimes not, even inside one source; long series drop members; question-marked
   nominations ("Uchiko?") read both ways.

Outliers written off as noise: single-unit oddities (a pun name, an in-joke read from world
knowledge, a URL-only reply, social-media handles) — each is a doctrine question below, not a
class.

## Doctrine questions for the owner (consolidated from 126)

1. Bakeries and dessert shops: a whole cake, a pastry, a kolache bought at a standalone bakery —
   served plate (the prompt's Quack's/babka examples) or carried-off good (B.2 as written)? This
   is the most frequent question (≈15 units) and the retail law as written says shelf.
2. Pick + dish: when a reply under a dish ask names a place AND vouches a specific dish, is the
   place carrier owed as well? (Recommend yes — the pick endorsed the place; F.1 "both at once".)
3. List headings: does a writer's own heading ("TACOS:") bequeath its dish/attribute word to
   every entry beneath it? (Recommend yes — it is the PLACE-for-FOOD formula written vertically.)
4. Question-marked nominations ("Uchiko?", "Have you tried X?") under a rec ask: pick or ask?
   (Recommend pick when it names a place the asker did not.)
5. Reported consensus ("highly rated", "this sub loves it"): testimony (A.1 says yes) or hearsay
   (A.2 says no)? The prompt says both. (Recommend consensus is testimony; an individual's
   relayed verdict is hearsay.)
6. Fit assertion: does an ask's "won't break the bank" / "vegan" / "cool vibe" load onto every
   bare pick, and what canonical words (`affordable`, `vegan`, `great atmosphere`)? Should soft
   "bonus points if…" clauses count? Should operational words ("eat inside", "fast") count?
7. Value downgrade: "great but pricey / not the best value" — vouch stands without `affordable`
   (owner doctrine) or defeated (prompt LANDING TEST)? (Recommend stands; `expensive` stated.)
8. Photo captions and receipts: a diner's own photo post "X at Y" with no verdict, or an eaten
   list with prices and no verdict — vouch or not? (Prompt: no. Model: yes, stably.)
9. Structure words: "lunch special", "combo with cheese", "slice" — dish or pro-form? (Owner
   doctrine says pro-form unless a food word or coinage; "lunch special" is the borderline.)
10. Grocery prepared counters when the text does not say where it is eaten (hot bar, soup bar,
    99 Ranch dim sum to go), catering delivered to a home, branded packaged beverages served at
    a restaurant (Maine Root): served or shelf?
11. Staff relatives ("my son is a server there"): self-promotion or word of mouth?
12. Ethics-scoped endorsements ("everybody go to X" for how they treat staff; "won't go back"
    after tip theft): does a non-food reason vouch or defeat?
13. Availability language: "haven't had them the last times we went" — dish gone or alive? A
    rename "X (now Y)" — ending or continuity?
14. Multi-dish and either/or asks: which dish phrases does a bare pick inherit (all, the title's,
    the one it answers)? Does a cuisine-family word ("sushi") inherit like "dim sum" or fail like
    "BBQ"?
15. Social handles (@name), puns ("a factory" for Cheesecake Factory), and hedged names ("I think
    it's called X"): emit verbatim / resolve / skip?

## Rederivation direction (prompt, v24)

Not more rules. The audit says the rules are known and mis-chosen. Three structural moves:
- A per-source ASSEMBLY CHECKLIST at the end of the procedure (carrier? inherited dish? own
  dishes? attributes with per-word blocking? source pointers?) so "everything earned" is the
  output shape, not a rule to remember.
- Delete the contradictions named above (F.1 dish-only picks, A.2 genre wording, Gate 1 bare
  structure word, Gate 3 subjunctive benchmark, consensus vs hearsay, LANDING TEST price-"but").
- State precedence once: acts are per clause; a subject lands only on its own clauses; the
  answer test decides bare nominations only; mode (served/shelf) before quality; as-written
  before everything downstream.
Plus temperature 0, and the owner rulings above pinned as gold cases in the cert deck.

## Non-prompt findings from the same data
- Diacritic loss at extraction ("caf") is refused downstream as span_not_in_cited_source: a correct
  pick is lost twice. The refusal is right; the fix is the as-written law (v24) — and a refusal
  reason worth watching in the diff.
- `extract_from_post` was false on a first-person review post (Bottega): the thread-level dedupe
  marks a post body covered by a prior run; the audit could not see the flag. Verify in the
  re-chunk work that a covered post body is never re-sent as emitting.
