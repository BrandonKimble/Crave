# Merge-vs-Widen Study — three worlds, walked as a real user (2026-08-30)

Owner question: is "keep words separate + search-time widening" at least as
good as "merge similar words upfront"? Method: REAL production searches
(SearchService via SearchOrchestrationService, staging corpus, Postgres
session opened `default_transaction_read_only=on` — the usage-ledger write
even errored out mid-run, proving zero persistence) under three in-memory
edge configurations, using the e2e harness's injection pattern:

- **A. TODAY** — no satisfies edges (what ships right now)
- **B. WIDENED** — exactly the docket's judged satisfies directions
  (stability run 1's table; identical to the majority-of-3 table)
- **C. MERGED-UPFRONT** — bidirectional edges per pair (the user experience
  a storage merge would give, simulated without merging)

Instruments: `apps/api/scripts/merge-vs-widen-study.ts` (new, probe-class,
modeled on widening-e2e.ts), `apps/api/scripts/widening-docket.ts` dry-run
×3. Raw data: scratchpad `study-results.json`, `docket-run{1,2,3}.log`.

## The headline finding nobody predicted: dish-side attribute tags are EMPTY

Before reading any pair table, know this: on staging, almost every
**item_attribute in the test set tags ZERO dishes** (`core_restaurant_items.
food_attributes`): cold, iced, fudgy, gooey, citrus, lemony, grass fed,
pasture raised = 0 tagged rows; soft = 3, tender = 4, sour = 2. The results
a user sees today for "cold" (62 places) or "lemony" (27) come from
item-name/text matching, not attribute tags. Place-side attributes are
richly populated (bar 1,614 places, bakery 696, sandwich shop 305, deli 133,
pub 126, pastry shop 65, kebab shop 24, shawarma 16).

Consequence: for the dish-side pairs, **neither widening NOR merging changes
what a user sees today** — the entire cold/iced, fudgy/gooey, citrus/lemony
debate is currently inert on real data. The edges are still worth applying
(they're admission-only and will engage as tagging fills in), but the
merge-vs-widen fight is really decided on the place-side pairs and the
ingredient pairs, where tags exist.

Second grounding surprise: several "attribute" queries don't ground as
attributes at all. "deli" grounds to the ITEM (page = "italian deli
sandwiches" at pizza shops, not delicatessens); "shawarma" grounds as a
dish. Widening edges on the attribute can't touch a query that grounded
elsewhere — a storage merge of the attribute entities wouldn't either.

## Part 1 — three-world tables (counts = places/dishes, staging viewport)

| query | A today | B widened | C merged | what actually changed |
|---|---|---|---|---|
| bar | 368/1005 | 368/1005 | 368/1005 | bar→pub satisfies is live in B but pub-tagged places were already all admitted — zero visible change |
| **pub** | 37/92 | 37/92 | **368/1005** | B: no edge (pub→bar rejected). C page 1 becomes Jeffrey's, J Carver's Oyster Bar, Micklethwait BBQ, Canje, Péché — the citywide top list wearing a "pub" label. A pub-seeker loses the pub page entirely |
| cozy pub | 63/371 | 63/371 | **390/1266** | same story with the cozy wall still on: C's page 1 is Jeffrey's/Uchi/Cisco's — "cozy pub" stops meaning pub |
| sandwich shop | 36/136 | **45/149** | 45/149 | B admits the delis: Royal Blue Grocery, Swedish Hill, Big Bites, Walton's, New World Deli — exactly what a sandwich seeker wants. B == C here |
| deli | 28/28 | 28/28 | 28/28 | grounds as the ITEM (dish "italian deli sandwiches"), so no attribute edge engages in any world |
| kebab shop | 7/20 | **9/24** | 9/24 | B admits Reem's + Levant Halal Mediterranean — right answer. B == C |
| shawarma | 14/36 | 14/36 | 14/36 | grounds as the dish; attribute edges never engage |
| bakery | 142/479 | 142/479 | 142/479 | bakery→pastry shop satisfies is live in B, but all 65 pastry-shop places were already admitted |
| pastry shop | 21/20 | 21/20 | 21/20 | reject direction; C adds nothing visible either |
| cold / iced | 62/55, 54/50 | unchanged | unchanged | zero tagged dishes → all three worlds identical |
| citrus / lemony | 2/2, 27/27 | unchanged | unchanged | same — lemony's 27 rows are name matches, not tags |
| sour / citrus | 38/33, 2/2 | unchanged | citrus C: **5/4** | C's citrus→sour arm admits sour-tagged rows: cheesecake @ Uncle Tetsu, 5-piece chicken @ Spicy Boys — a citrus seeker would call these wrong |
| sour / tangy | — | — | — | "tangy" has NO entity in the vocabulary (absence noted); sour/tangy can't be heard |
| fudgy / gooey | 14/15, 0/0 | unchanged | unchanged | gooey tags nothing and even the "gooey" query returns 0 everywhere |
| fudgy brownie | 19/23 | 19/23 | 19/23 | inert (no gooey rows to admit) |
| grass fed / pasture raised | 3/2, 0/0 | unchanged | unchanged | pasture raised tags nothing |
| soft | 26/24 | 26/24 | **30/28** | B empty (judge rejected BOTH soft/tender directions this session); C admits Chuy's fajitas, B. Cooper brisket via tender — arguably things a "soft" food seeker didn't ask for |
| tender | 21/22 | 21/22 | **23/24** | C admits Texas Roadhouse + Bahama Buck's (shave ice via soft!) — a tender-meat seeker shown shave ice is the merge cost in miniature |
| iced coffee | 46/47 | 46/47 | 46/47 | inert (tag sparsity) |
| **bacon (ingredient)** | 72/81 | **73/82** | 74/83 | B adds the pancetta arancini (bacon→pancetta satisfies). C adds guanciale too — also fine for a bacon seeker |
| **pancetta (ingredient)** | 1/1 | **2/2** | **74/83** | THE decisive row. B adds amatriciana @ Numero28 (pancetta→guanciale satisfies) — perfect. C floods the pancetta seeker with P. Terry's burgers, Chick-fil-A, breakfast tacos, Magnolia Cafe bacon — 72 smoked-American-bacon rows they explicitly didn't ask for |
| guanciale (ingredient) | 1/1 | 1/1 | **74/83** | same flood in C; B correctly refuses (guanciale→pancetta reject: "unique funky richness from the jowl") |
| soup dumplings (control) | 37/26 | — | — | the mature dish-side satisfies system: page 1 = soup dumplings @ Lin Asian Bar, Fat Dragon, Bee Dumpling + plain-dumpling rows admitted underneath — union admission with the asked dish on top. This is the behavior widening buys attributes/ingredients |

Ordering held everywhere: rows served by two worlds kept relative order
(admission-only, pure Crave Score — same as the e2e's sharedOrderIntact).

### Per-pair verdicts

- **WIDEN-WINS (decisive):** bar/pub (C destroys the pub page — 37 real
  pubs replaced by the citywide top-368), bacon/pancetta/guanciale (C gives
  the pancetta/guanciale seeker 72 wrong bacon rows; B gives each side
  exactly the right neighbor), soft/tender (C's shave-ice-for-tender rows).
- **TIE, widen == merge:** sandwich shop/deli, kebab shop/shawarma (B and C
  produce identical results because only one direction has anything to
  admit; the judged direction is the useful one).
- **TIE, both inert today:** cold/iced, citrus/lemony, fudgy/gooey, grass
  fed/pasture raised, bakery/pastry shop (tag sparsity or grounding).
- **MERGE-WOULD-WIN:** none found. In no pair did C show a diner-desirable
  row that B withheld wrongly. The closest is philosophical: if the owner
  believes "asked pub, show bars too", that's the pub→bar flip — and the C
  page-1 evidence above argues strongly AGAINST it.

## Part 2 — judge balance review

### Stability (docket ×3, 174 directed cases each, temp 0, same staging vocabulary)

- **168/174 (96.6%) identical across all three runs; 0 unreturned.**
- All 22 owner-pair directions were stable within this session.
- The 6 unstable rows flipped TOGETHER in run 2 (batch-correlated, not
  independent coin-flips): gyros→kebab shop, falafel→kebab shop,
  shawarma↔gyros (satisfies/reject/satisfies) and applewood bacon→bacon,
  guanciale→pancetta (reject/satisfies/reject). Majority = run 1's table.
- **Cross-SESSION instability is worse than within-session** and hits owner
  pairs: the widening report's reviewed table has fudgy→gooey satisfies +
  soft→tender satisfies; all three of today's runs unanimously ruled the
  OPPOSITE (gooey→fudgy satisfies; soft/tender both reject). Both readings
  come with coherent doctrine-quoting reasons. These two pairs are genuine
  coin-flips the doctrine does not settle — they need an owner ruling + gold
  pin, not a rule tweak. (Mitigation already built: --apply binds exactly
  the reviewed file, so drift can't change what ships — but WHICH file gets
  reviewed still varies by day on these rows.)
- Unstable-row reasons read as real ambiguity, not noise: gyros vs shawarma
  is "functionally identical spit meat" vs "greek vs middle-eastern
  seasonings" — both defensible; guanciale→pancetta is "standard
  substitute" vs "jowl funk can't be replicated". Fine owner-taste calls.

### Balance (all 174 read owner-lens)

The asymmetry doctrine held everywhere: broad→specific satisfies, reverse
rejects. Junk neighbors cleanly rejected (bakery→hot tub, cold→warm,
grass fed→non-gmo). The judge is **slightly loose, not strict**:

- Too loose (flip recommended): **meaty→grass fed** (a "meaty" searcher
  admits anything grass-fed-tagged — tenuous; acceptance report flagged the
  same), **soft→smooth** (justified via shave ice — a soft-food seeker
  shown shave ice).
- Borderline-loose (owner glance, no flip applied): gooey→cheesy (gooey
  dessert seeker admitted to melted-cheese rows — currently inert, gooey
  matches nothing), falafel→kebab shop (defensible in this corpus — Halal
  Bros et al. all serve falafel), sandwich shop→kebab shop,
  modern↔non-traditional (both directions satisfy = a de-facto merge, which
  is arguably right for that pair).
- Too strict: nothing clearly wrong. pub→bar reject looked like the
  candidate, but Part 1's C world is direct evidence the reject is RIGHT —
  widening pub into bar turns the pub page into the citywide leaderboard.
  citrus→lemony and sour→citrus/lemony all satisfy, so the flavor family
  is generous in the direction users want.
- **Gap class** (kept separate by the merge court AND no satisfies
  direction in either court — the user gets nothing from either mechanism):
  **modern/trendy** (both reject; each word reaches specific neighbors —
  modern→eclectic, trendy→funky — so the pair itself just isn't a
  containment) and **soft/tender** (both reject this session — and this one
  IS the cross-session coin-flip; if the owner wants soft→tender, pin it).
  Vocabulary absences: **tangy** has no entity (sour/tangy unhearable);
  piano bar folded; pizza truck never minted.

### Recommendation: **as-is** on both doctrines, no prompt changes

The instability is concentrated in genuinely ambiguous cases a rule cannot
settle (gyros-vs-shawarma taste calls), and the balance errors are 2 loose
rows out of 174 — cheaper to fix by editing the reviewed table (the
designed mechanism) than by a rule bump that re-opens all 174 verdicts and
forces re-certification. No prompt was touched, so no cert ×3 was owed.
If the owner wants belt-and-braces determinism later: pin fudgy/gooey and
soft/tender as gold cases at the next natural rule bump.

## Part 3 — the verdict, in plain language

**Widening wins. Keep the words separate.** Walked as a diner on real
staging searches, the widened world (B) never once hid something a user
wanted that the merged world (C) showed — every extra row C had was either
identical to B's (sandwich shop, kebab shop) or actively wrong (a pancetta
seeker buried under 72 American-bacon burgers; a pub seeker's page replaced
by the citywide top-368; a tender-meat seeker shown shave ice). Merging is
irreversible generosity in both directions at once; the judge's directed
edges deliver the same upside with none of that cost, and the ledger makes
every edge reversible. No pair should flip to a storage merge — even
modern/trendy (the gap pair) fails the same-claim test, and merging it
would buy nothing users visibly want.

Honest costs of the chosen world: (1) the judge drifts on ~3% of cases
run-to-run and on a couple of owner pairs across sessions — contained by
the review-file-binds design, but the owner should rule fudgy/gooey and
soft/tender personally; (2) most dish-side edges are inert until dish-side
attribute tagging actually fills in — the real gap isn't merge-vs-widen,
it's that item_attribute tags barely exist on staging (worth its own
investigation); (3) some words never reach their attribute at all ("deli",
"shawarma" ground as dishes), which neither mechanism fixes.

**Recommended final edge table: `plans/merge-vs-widen-final-verdicts.json`**
— the majority-of-3 table (run 1; majority on all 6 unstable rows) with two
owner-lens flips applied (meaty→grass fed → reject, soft→smooth → reject),
50 net satisfies edges (of 174 directed verdicts). Ready for
`yarn workspace api ts-node scripts/widening-docket.ts --apply plans/merge-vs-widen-final-verdicts.json`
(staging first, per the iteration-phase ruling). Rows for the owner's eye
before applying: pub→bar reject (this study says keep it), fudgy/gooey
direction, gooey→cheesy, falafel→kebab shop.

Zero persistent writes were made anywhere (read-only sessions; dry-runs
only; the two new files are this report + the verdict/study JSON).
