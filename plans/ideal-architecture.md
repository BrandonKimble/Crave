# The From-Scratch Test — ideal architecture vs what exists (2026-08-30)

Derived by the coordinator from three evidence passes done the same day:
docs/llm-systems-map.md (~55 systems censused), plans/judge-ledger-audit.md
(hand-judged accuracy of every sameness judge), and
plans/category-and-knowledge-split-study.md (60.3% cross-mention category
inconsistency; cuisine split verified clean). Question asked of every
piece: if we rebuilt from zero knowing everything we know, would this
survive as-is?

## What survives the test unchanged (the keepers)

1. **One LLM gateway** — every call through LLMService. Keeps cost truth,
   rate governance, and the census greppable.
2. **Verdict-first ledger** (claim_verdicts): buy a judgment once, record
   the reason, re-buy only on rule-version change, crash-resume from
   stored plans. This is the single best primitive in the system.
3. **Testimony/knowledge split**: collection transcribes what people
   SAID; knowledge systems compute what the world IS (once per concept,
   ledgered). The v17 campaign finished aligning the prompt to this.
4. **Quarantine-then-adjudicate** (pending attributes): new vocabulary
   can't dirty live data while awaiting judgment.
5. **Judge duality**: the same sameness doctrine applied at birth
   (prevent the twin) and by sweep (catch the ones born anyway).
6. **Merge mechanics**: entity_redirects + user-anchor rehome + every
   name preserved as a searchable surface/alias. Nothing thrown away.
7. **Deterministic ownership laws**: one-writer services, derived-index
   base class, observed-span contract, community-scoped wipes,
   place-grounded-restaurants-never-deleted, governed spend envelopes.

## What from-scratch would do differently (the deltas — this IS the plan)

### D1. ONE sameness court (highest leverage)
Today: 4 mechanisms (entity_match birth judge, entity_dedupe sweep,
attribute placement, attribute merge lane) over 3 prompts + parallel
sweep shells. From scratch: ONE court architecture — per-KIND doctrine,
per-KIND context curation, per-KIND survivor policy — behind one sweep
shell and one birth hook. The doctrine recognizes the real split the
owner named: names (places/dishes/ingredients) match on IDENTITY;
meanings (attributes) match on INTERCHANGEABILITY (would a user
filtering by one want the other's evidence).
Rederivation is grounded in the ledger audit's measured failures:
- Add a REJECT outcome (junk terms currently MUST become entities —
  "5 piece", "clay", "South Lamar Location" minted while the judge's own
  reason called them garbage).
- Modifier-swarm doctrine (the 12-entity omakase family): specific
  preparations stay separate ACROSS restaurants, but variants inside ONE
  restaurant unify — which requires context the judge doesn't get today.
- Fix the silent kind-name mismatch (service sends restaurant_attribute/
  food_attribute; prompt defines place_attribute/item_attribute).

### D2. The context-curation standard (what the judge SEES)
From the audit's wrong verdicts, every judge call carries:
1. The verbatim mention sentence + which restaurant's thread it came from.
2. Each candidate's home restaurant(s) + a same-restaurant flag
   (the OTOKO rule made mechanical).
3. For attributes: 2–3 real usage examples per candidate.
4. Market scope (already present) + schema-forced evidence-style reasons
   (58% of attribute verdicts today say just "match").

### D3. Survivor policy: evidence-count, not a dictionary
Owner-ruled 2026-08-30: no manually maintained canonical vocabulary.
Survivor = more evidence (connections/mentions), tie → plainer/shorter.
Cold start is benign: aliases preserve every spelling for search, sweeps
re-run, so an early "wrong" survivor self-corrects. (The prompt still
anchors the model's OWN emissions to plain forms — that's emission
discipline, not a merge-time dictionary.)

### D4. Category rollup moves to dish-knowledge (evidence-forced)
60.3% of multi-connection foods disagree with themselves on categories;
reconciliation still passes real errors (eggplant parm → eggplant) and
19 banned cuisine-as-category edges; 529 missing head-noun parents have
a read-time workaround in search. Categories are identity-derived world
knowledge → a dish-knowledge facet exactly like cuisines (S4 template:
projection + ledger + merge adjudication). Collection prompt's C.3 step 3
is then REMOVED in a full rederivation (not blanked — the section re-
derived without the responsibility), pins updated, certified ×3.
~150 batched calls rides the pending backfill.

### D5. Venue cuisine profile: add the two missing evidence sources
The believed dish-set→venue-cuisine lane DOES NOT EXIST (aspirational).
Add, as evidence rows into the existing one-writer projection
(derivePlaceAttributes):
- corpus dish-set implications (what its praised dishes' cuisines imply);
- the venue-name signal (measured: 98% right, 2% product-word homographs
  which other evidence outvotes — "Texas French Bread" loses to Google
  types + editorial + dishes).

### D6. One prompt-versioning mechanism
FOUR fingerprint mechanisms coexist; only 2 of ~20 prompts are
registry-versioned — the rest change silently on deploy. From scratch:
every prompt is a registry kind (or carries a *-rule.ts release ledger,
one convention, not four). Governance debt, not user-facing; schedule
after the reload.

### D7. Reachability: dead machinery gets a pulse or gets deleted
Built-but-unreachable: attribute merge lane (flag off + never
scheduled), restaurant-name court (docket feeder never built),
demand-vocabulary learner (manual only), restaurant janitor (flag
default false), user-taste-profile builder (no caller at all).
Rule: each either joins a rail (nightly convergence / knowledge
maintenance) with its flag deliberately set, or is deleted. Decide per
system at post-reload wiring time; the map's flags section is the docket.

### D8. Two smaller unifications (queued, not urgent)
- Fold the relevance gate's private verdict table into claim_verdicts
  (it gets no budget metering/rehearing/crash-resume today).
- One span-grounding contract shared by extraction and search.
- Ontology applyPlan merges become ledgered like everything else.

## Sequencing (owner-approved ordering logic: everything that changes
extraction/resolution lands BEFORE the expensive full reload)

1. **Judge-court rederivation (D1+D2)** — full rhino treatment: ledger-
   audit-grounded rederivation of entity-match + attribute prompts, the
   reject outcome, context enrichment at both call sites, unified sweep
   shell, gold cases per kind incl. every wrong verdict from the audit
   as a pin; certification ×3 per prompt.
2. **Category move (D4)** — dish-knowledge facet + C.3 rederivation +
   cert; then the collection prompt is final for the reload.
3. **Bundle-size experiment** → pick docs-per-chunk.
4. **Full Austin chronological reload** on final prompt + final judges.
5. **Post-reload**: attribute-merge backlog drain (incl. the four
   atmospheres + bar/pub review), D5 venue-cuisine sources, D3 survivor
   flip in both merge services, D6 versioning, D7 reachability docket,
   D8 unifications, locale gold gates re-run (standing requirement).

## Verdict

The foundation passes the from-scratch test: gateway, ledger,
testimony/knowledge split, quarantine, judge duality, merge mechanics
are exactly what a clean-sheet design would build. The gap is
CONSOLIDATION (four sameness mechanisms → one court), CONTEXT (judges
decide blind today), and PLACEMENT (categories per-mention → per-
concept; two venue-cuisine sources missing). Nothing needs demolition;
everything needs the same three moves the v17 prompt campaign proved
out: rederive from principle, ground in the ledger's measured failures,
certify against pins.
