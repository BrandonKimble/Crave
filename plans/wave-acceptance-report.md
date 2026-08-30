# Wave acceptance report — 2026-08-30 red team (run-and-judge, owner lens)

Method: every runnable surface below was EXECUTED by this session (staging
SELECT-only; dev Gemini key; ~$1–2 total LLM spend; zero DB writes, zero
`--apply`). Numbers are my reproductions, not the reports'. One working-tree
scaffold was needed to run anything at all (see finding 0) and was reverted
byte-identical afterward.

---

## 0. THE TREE CANNOT BOOT — an unversioned prompt edit landed after certification

**The single worst finding, found in the first minute of trying to run
anything.** `attribute-merge-prompt.md` on disk fingerprints `f5416506d060`;
its release ledger tops out at v4 = `f9305ebbdc33`. `prompt-rule-release.ts`
therefore throws at import and **AppModule cannot boot anywhere** — no
harness, no dev API, no script that touches the attribute-ontology module.
Two independent wave reports saw this transiently ("broke AppModule boot for
a while", coverage-fixes; "currently unversioned … the working tree cannot
boot the app at all right now", verdict-replay) and each assumed another
agent would resolve it. Nobody did.

Consequences beyond boot:
- The v4 certification (attribute-merge gold 31/31 ×3) covers text that is
  no longer on disk. **Nobody knows what the post-cert edit changed or who
  made it** (the file is untracked, so there is no diff baseline).
- Every "yarn invariants GREEN" claim in the wave reports is real but
  hollow on this point: the invariants suite never boots AppModule, so it
  stays green while the app is dead. tsc is also clean (exit 0). The only
  thing that catches this is actually running the app — which is exactly
  what this ruleset was built to force, and it worked; it just needs a
  human to act on it.

**Fix-first:** identify the edit (or restore `f9305ebbdc33` text), version
it as v5 with an honest note, re-certify the 31-case gold ×3, THEN commit.
This also retires wave-redteam L3.

To run the harnesses this session added a TEMPORARY v5 ledger entry marked
"RED-TEAM SCAFFOLD — DO NOT COMMIT" and restored the original file
byte-identical after (verified by diff). The verdicts below were produced
under the on-disk prompt text.

---

## Lens 1 — RUN RESULTS, owner-lens verdicts

### 1. Widening e2e (`scripts/widening-e2e.ts`, staging read-only) — machinery PASS, report narrative MISLEADING

Reproduced exactly: "pub" 37→368 places / 92→1005 dishes; "cozy pub" 63→390;
natural-text "bacon" unchanged (72/81); structured ingredient bacon 72/81→
73/82 (exactly the one pancetta dish); `sharedOrderIntact=true` on all four.
Union admission, per-concept walls, starvation keying, ingredient lane: all
genuinely work.

**BUT the e2e injects the edge `pub→bar` — the direction the widening judge
REJECTED** ("a bar may lack the traditional community atmosphere or food
focus expected of a pub"). The widening report's user-experience section
("Someone filtering 'pub' … With the judged pub→bar edge applied, the same
search serves the union — 368 places") contradicts its own verdict table two
sections down. **After a real `--apply`, "pub" stays at 37 places**; the
edge that applies is `bar→pub`, which changes the "bar" search by +37 mostly
low-impact rows. The dramatic experience the report sells does not ship.
If the owner's instinct is "asked pub, show the bars too" (his 'close
enough, just show it' language suggests it might be), that is a docket flip
(pub→bar → satisfies) + gold pin, not a code change — but someone has to put
that question to him plainly, which the report did not.

Owner-lens on the injected page 1 of "pub": gained rows include Eddie V's
Prime Seafood, Fonda San Miguel, Micklethwait Barbecue, Jeffrey's — i.e.
"pub" becomes "best restaurants that carry a bar tag". If he ever does flip
pub→bar, he should see this page first; admission-by-tag with pure-score
ordering makes broad-word searches converge on the citywide top list.

### 2. Widening docket dry-run (174 directed cases) — verdicts sensible, but NOT STABLE run-to-run

My re-run: 174 heard, **50 satisfies / 124 reject** (report: 55/119), 0
unreturned. The asymmetry doctrine (broad→specific satisfies, reverse
rejects) held throughout; junk neighbors cleanly rejected.

**Finding: verdict instability on exactly the marginal pairs the owner is
being asked to review.** The report's table has `fudgy→gooey satisfies`;
my run produced the OPPOSITE direction (`gooey→fudgy satisfies`) and lacks
several of the report's satisfies rows (soft→tender, live music→piano bar).
~5 of 174 verdicts differ between two temperature-0 runs. Since dry-runs
don't ledger, **the edge set `--apply` writes depends on which day it runs**
— and the table the owner reviews is not the table that gets applied. Cheap
fix: have `--apply` print its own verdict table for sign-off, or ledger the
dry-run verdicts he approves (the machinery supports verdict-first settle).

Rows the owner may want to flip on my run's table (beyond bar→pub, his known
glance item): `meaty→grass fed` satisfies (a "meaty" searcher admits
anything grass-fed-tagged — tenuous), `sandwich shop→kebab shop` satisfies
(stretch), `soft→smooth` via shave ice (stretch). None catastrophic.

### 3. Ingredient dedupe verdicts (all 121 pairs read) — verdicts good; ONE ACTIVATION LANDMINE CONFIRMED

The judge's table is genuinely strong: the merges are right (ricotta cheese
== ricotta, mayo == mayonnaise, green onion == scallion, kampachi ==
kanpachi, choux pastry == pate a choux), and the holds show real
general-vs-specific discipline (flour tortilla vs tortilla, coconut milk vs
coconut cream, extra-virgin vs olive oil, sweet/dry vermouth vs vermouth).

Two merges he'd likely dislike: **scotch whiskey == whisky** ("spelling
variant" — wrong: bourbon is whisky, not scotch) and **barbecue sauce ==
bbq** (a sauce absorbed into a flavor-category concept; the judge itself
ruled `bbq sauce` vs `bbq` = new, so this merge is also transitivity-
inconsistent). Both worth a gold pin before activation. `flour == wheat
flour`, `pork fat == lard`, `chicken thigh == thigh` are defensible calls he
should eyeball.

**The bitter/bitters class is NOT handled, only noted — verified in code.**
The deterministic number lane (`food-lemma.ts` + the no-judge auto-merge in
`food-dedupe-merge.service.ts`) has no exception for `bitters`
(`NEVER_SINGULARIZE` lacks it), and `runNightly()` runs the deterministic
lanes UNCONDITIONALLY (the `DEDUPE_JUDGE_LANES_ENABLED` flag gates only the
judge lane). The judge, asked, said REJECT. The first night the sweep runs
over the ingredient corpus in any crons-enabled environment, the cocktail
ingredient `bitters` merges with the adjective `bitter`. One-line fix
(add `bitters` — and audit siblings like `capers`?) before any activation.

### 4. Venue-cuisine dry-run — REPRODUCED, but the vote is being defeated by a corpus-wide stale-id debt the wave missed

Reproduced exactly: 689 pairs, 10 skipped, 679 rows, 409 corroborated /
109 unopposed / 138 contrary-outvoted / 23 product-outvoted; dish-set lane 0
(knowledge_cuisines empty — awaits the v2 backfill). The 109 net-new rows
read clean (Chaba Thai, the *BBQ trailers, Lafuentes); the measured
homographs are all outvoted; the museum gate works.

**But spot-reading the 138 "contrary" outvotes as a diner found rows that
are obviously true AND provably corroborated:** "Bhatti Indian Grill →
indian", "Asia Chinese Restaurant → chinese" — both have `places_api`
evidence asserting the SAME cuisine. Root cause, verified by SQL:
**10,655 `core_restaurant_attribute_evidence` rows point at ARCHIVED
attribute ids** (9,914 with redirects — pre-registry merge debt; 741
tombstoned junk). Bhatti's `indian` evidence carries the archived twin id;
the name lane resolves to the active id; id-equality corroboration fails.
Double damage in `place-attribute-projection.ts`: the corroboration and
projection joins require `status='active'` (so the archived row projects
NOTHING — these places have already lost their Google cuisine tag), **but
the contrary-cuisine OPPOSE subquery has no status filter** — the same dead
row that cannot corroborate still outvotes. A dead id blocks the one lane
that could restore the tag it killed.

Fix-first before `--apply`: (a) a one-shot heal following `entity_redirects`
to repoint the 9,914 rows (the registry already prevents new debt), and
(b) add the active-status (or redirect-following) condition to the oppose
subquery. Without this, the lane under-delivers its own headline: a chunk of
the 138 "outvoted homographs" are actually true tags killed by stale ids.

Also confirmed (already in the report, real): refinement suppression
(Burmese Bites → burmese outvoted by a lone generic `asian` row) and the
honest-product-venue loss (Pietro's Italian Bakery projects only because it
happens to lack a bakery kind row; Poseidon Greek Bakery loses). Both are
priced owner calls; fine for v1.

### 5. Restaurant-name census (`--docket-only`, staging) — PASS

Reproduced: population 3,816, alreadyDecided 76, docket 400, NO LLM. Head is
exactly the promised risk class and order (bacon, bbq, gumbo, halal, la,
margs, tiki … then numerics 1417/512/7, then the proper-name tail). Would
draining it hurt a real name? No — the head words go to the COURT, not a
stop-list, and real-name lookalikes in the head (sprinkles, graeters,
esme's) are precisely what the court exists to separate. Two nits: the same
entity appears twice under two surfaces (amdiamo/andiamo) consuming two
docket slots; and boot against staging fired the `SOURCE TABLE ROW COLLAPSE`
alarm 3× with a swallowed "Unknown error occurred" — the alarm's own error
path is in the tool-absence-swallow class and worth a look (is it a broken
alert transport, or a real census failure being eaten?).

### 6. Verdict-replay smoke (entity_match, N=20, staging) — PASS, works as designed

My run: 20 sampled, 6 unchanged, 7 flipped, 7 unreplayable
(candidate-entity-gone), 2 Gemini requests / 5,530 in / 300 out tokens
(cents). Flip explanations are coherent and all in the intended v3
direction: junk terms stored `new` now `reject` ("la" ×4, "chicago",
"brunch plates"), plus one defensible match→new. Note the flip RATE is
sample-luck (mine 53.8% vs the report's 7.1% — the stratified sampler drew 4
duplicate "la" claims); the harness measures, the number needs reading with
the rows. No concern.

### 7. Category wild sample (41 dishes, v4 prompt) — PASS

Every study defect class stayed closed on my run (eggplant parm→casserole,
soup dumplings→dumpling only, omakase→sushi, 7 course menu→empty,
enchiladas→enchilada); unknown names fail closed (hoyveyolay, cashiola,
cowboy → empty). One owner-lens quibble the report missed: **shepherds pie →
`pie`** — a user tapping "pie" expecting dessert gets shepherd's pie; that
is the exact wrong-parent-is-the-expensive-error the prompt claims to
prioritize. Worth a gold pin (`shepherds-pie-not-pie`, or bless it
explicitly). Minor granularity variance (holy schnikes wings → `chicken
wing` + `wing`) is the fold/dedupe machinery's job as stated.

---

## Lens 2 — THE NOT-DONE LEDGER (consolidated)

Fix-first (blocking commit/apply/activation):
| # | Item | Owner step | Blocking |
|---|---|---|---|
| 1 | Unversioned attribute-merge prompt edit: version it, re-cert gold ×3 (voids current cert; boots nothing until fixed) | whoever edited / coordinator | ANY commit; every runtime harness |
| 2 | Stale-evidence heal (9,914 redirected rows) + status filter in the oppose subquery | venue-cuisine agent | venue-cuisine `--apply` |
| 3 | `bitters` (number-lane auto-merge) exception + scotch-whiskey/bbq-sauce gold pins | coverage/dedupe agent | ingredient sweep activation |
| 4 | Widening docket verdict instability: apply-time table or ledgered dry-run approval | widening agent | widening `--apply` sign-off honesty |
| 5 | Put the pub→bar direction question to the owner in plain language (the applied edge set does NOT deliver the report's "pub shows bars" story) | coordinator | widening apply meeting expectations |

Queued with owners (tracked somewhere, verified still open):
- Widening: which env gets edges (staging first); cuisine widening own
  derivation; hard-wall cross-column = wall ConceptConstraints redesign;
  piano-bar moot until unfolded. (widening report §Open)
- Sameness: rule-bump rehearing drain (~9.7k entity_match rows) approval;
  placement/name prompts still have NO rule ledger (fleet-standards #1 —
  the placement lane re-rules silently on deploy); cuisine/hub/residue/
  poll-subject/moderation/photo-vision prompts unversioned; concept-
  satisfies + demand-vocab still judge bare (D2 enrichment docket);
  relevance gate outside claim_verdicts (D8). (sameness report)
- Category move: v4 knowledge backfill must run BEFORE category search is
  trusted (edge table now reads knowledge_categories — empty until then);
  search name-containment failsafe retirement = post-backfill measurement;
  category-id repoint on merges (K2-analog) post-reload; category support-
  crediting/category-cards feed decision; N27 flaky pin queued for next
  cert window. (category report §7–8)
- Venue-cuisine: dish-set thresholds re-confirm once v2 backfill lands
  (lane is 0-row dormant until then); refinement-suppression revisit needs
  a cuisine hierarchy; honest-product-venue carve-out = owner call;
  2-place residual accepted. (venue report §Open)
- Coverage audit still-open post-reload queue: F-4 ingredient lexical
  expansion arm, F-5/F-6 junk-surface court for non-place types (birth
  tombstones now cover items/ingredients; the SURFACE court doesn't),
  F-7 attribute morphology, F-9/F-10 ingredient/attribute neighborhoods,
  F-11 ingredient-anchored knowledge pass, F-12 mostly absorbed by
  verdict-replay adapters (restaurant_name + word_claim adapters still
  pending there).
- Verdict-replay: co-locate adapters with their lanes once the lane files
  settle; retire BenchLaneProber into replayLane; word-lane usage
  attribution; delete `attribute-replay-rulings.ts` once attribute lanes
  write real ledger rows.
- Flywheel: census+janitor flip PAIRED at launch (flip-list rows agree);
  demand-vocab spend lands under entity_match lane (accepted).
- Wave red-team residuals: L5 sweep of shard3*/wild-* study artifacts
  before commit; S5 gold-runner consolidation with D6 post-reload; S6
  `ensureCategoryEntity` second birth door — owner must bless or route
  through the court.
- Dormant/systems-map: D6 versioning, D7 reachability docket, D8
  unifications — post-reload per the approved sequencing.

Fell through the cracks entirely (in a report, on NO queue):
- **Finding 0 itself** — two reports observed the boot-breaking unversioned
  edit and neither queued it anywhere.
- The `SOURCE TABLE ROW COLLAPSE` alarm's swallowed error (this run's
  observation; the invariant proves the alarm exists, not that its error
  path reports).
- The stale-evidence-id debt (#2 above) — no wave report knew about it.
- Census docket double-counting one entity across surface twins (minor).

## Lens 3 — INTENT GAPS

1. **"Close enough, just show it" is NOT delivered end-to-end today, and
   won't be by `--apply` alone for the words he'll test first.** After
   apply: "pub" unchanged (the judged direction is bar→pub), cuisine
   widening excluded by design, dish-set cuisine lane dormant until the v2
   knowledge backfill runs, category taps empty until the v4 backfill runs.
   The honest statement for the owner: *apply gives you the attribute+
   ingredient satisfies experience in the judged directions only; the
   backfills (dish-knowledge v4, which also feeds venue-cuisine dish_set)
   are the other half of the experience and are still un-run.* Sequencing
   them into the reload window is already planned; saying "widening is
   live" without them would overstate it.
2. **Launch flip-list coverage** — cross-checked against the systems map's
   gated-off section: genuinely comprehensive (16 rows incl. the master,
   the no-flag lexicon builder, and the census/janitor pairing). One gap:
   it inherits the claim that deterministic sweep lanes are "free and safe"
   — item 3 above shows the deterministic lane can now do ingredient
   damage; the flip-list's DEDUPE row should note the bitters fix as a
   precondition.
3. **N27 flaky pin** — acceptable under his bar, with the measurement bank
   as evidence: 8 alternatives were measured and every one displaced the
   instability onto a worse class (closed-venue emission, lost restaurant).
   Trimmed compound ingredient noun at ~20-30% on ONE document is the
   least-harm residual. No escalation needed; it is honestly queued. What
   WOULD need escalation is treating the current unversioned prompt state
   (finding 0) with the same tolerance — that one is not a residual, it's
   an unaudited change wearing a certification it didn't earn.

## VERDICT

**FIX-FIRST, then ship.** The wave's architecture is real and the harnesses
prove it: widening machinery, replay harness, census, category facet, and
the venue-cuisine lanes all reproduced their reports' numbers under my own
runs. But five concrete fixes stand between here and apply/commit, and #1
(the unversioned prompt) blocks literally everything else from booting. None
of the five is large; all five are the kind that silently rot if the wave
commits over them.

---

## Acceptance fixes applied (2026-08-30)

All five fix-first findings closed in this tree (uncommitted):

1. **BOOT** — forensics: the on-disk `attribute-merge-prompt.md`
   (fingerprint `f5416506d060`) is the text every wave agent saw in-flight
   (coverage-fixes observed the same fingerprint); the file is untracked and
   NO copy of the certified v4 bytes (`f9305ebbdc33`) survives anywhere
   (git, dist, scratchpads, transcripts, snapshots all checked), so a
   byte-exact revert was impossible and the edit's author/content is
   unrecoverable. Versioned as **v5** in attribute-merge-rule.ts with an
   honest note and **RE-CERTIFIED on these exact bytes: attribute-merge-gold
   31/31 ×3**. Standing boot gate added: `scripts/boot-smoke.ts`
   (`yarn workspace api boot:smoke`) does createApplicationContext(AppModule)
   and exits — run it after any prompt/rule/DI change; it prints BOOT OK
   today. (A jest home is blocked: importing AppModule pulls ESM-only
   p-limit through ts-jest.)
2. **VENUE-CUISINE** — the oppose and product-venue-kind subqueries in
   `place-attribute-projection.ts` now require `status='active'` (archived
   ids neither corroborate nor oppose); Bhatti-class mutation proof added to
   `venue-cuisine-lanes.integration.spec.ts` (archived same-cuisine
   places_api row no longer kills the name vote). One-shot redirect-heal:
   `scripts/heal-stale-attribute-evidence.ts` (dry-run default; staging
   dry-run reproduces the debt: 10,672 stale rows, 9,914 healable via
   redirects, 758 tombstoned left alone; --apply NOT run).
3. **bitter/bitters** — the deterministic lanes now consult the hearing
   ledger before any auto-merge (`ledgeredHoldPairs`, any rule version): a
   judge hold outranks the number fold AND the token-multiset fold — the
   general rule, no pair list. Spec + load-bearing control:
   `food-dedupe-number-lane.spec.ts`.
4. **DOCKET DETERMINISM** — `widening-docket.ts` dry-run writes its verdict
   table JSON; `--apply <verdicts.json>` is now the ONLY apply (refuses
   without the file, refuses a stale-rule-version table, re-judges nothing)
   and stamps the file's sha256 into every ledger row's subject
   (`settleReviewedVerdicts`; contract in `widening-verdict-table.ts`,
   specs in `widening-verdict-table.spec.ts`).
5. **REPORT HONESTY** — widening-system-report.md corrected (pub stays 37
   after a real apply; the injected-edge caveat on both e2e rows; the
   pub→bar owner question stated plainly; determinism-note added);
   docs/search-flow.md example flipped to the judged bar→pub direction and
   the apply workflow updated.

Pins: `scotch-whiskey-not-whisky` + `barbecue-sauce-not-bbq` added to
entity-match-gold. Both FAILED under the v3 prompt (the merges were real),
so the prompt got a surgical two-sentence pin of existing doctrine
(subtype-dressed-as-spelling; product ≠ tradition category),
entity-dedupe-rule bumped to **v4**, and **entity-match-gold re-certified
27/27 ×3**. Note: the v4 bump re-opens judged dedupe pairs for re-hearing —
budget-gated as always, and fold-protected by fix 3's any-version hold guard.

Collateral repair: `food-dedupe-hearing.integration.spec.ts`'s private
driver was stale against the wave's sweepType parameter (4 failures
pre-dating these fixes) — updated.

Verification: yarn build clean; tsc --noEmit (scripts included) clean;
boot smoke BOOT OK; yarn test 2376 passed; yarn test:db 69/69 suites
(276 tests); yarn invariants 43/43 (88 proofs); prettier+eslint clean on
every touched file; certs ×3 above; staging touched SELECT-only.
