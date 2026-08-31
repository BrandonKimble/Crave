# Grounding fix report — R1/R2/R3 (campaign red-team v3), 2026-08-30

Pre-reload fix pass. All code uncommitted; staging writes limited to the two
sanctioned effects (strike void, twin merges), both applied after dry-run
verification.

## R1 — the 716-decline sweep: root cause, with evidence

**One-liner: the chooser was judged sane; its CONTEXT was broken — every
hearing saw exactly ONE community snippet as its entire textual world, and
rule v1 treated any location wording in that snippet as an absolute
geography veto.**

Attribution (staging, `claim_verdicts` lane `place_grounding` + the
`lastEnrichmentAttempt` breadcrumbs — the whole ledger for this lane was
written by the 08-20 run: 2,445 selected, 3,904 rejected, 01:10→03:18 UTC):

- Of the 716 declines, **384 were live chooser rejections and 332 were
  remembered-rejection replays** of verdicts minted earlier in the same run
  (8 had empty candidate sets). No deploy accident: the prompt on disk still
  fingerprints to ledger v1 (`401cdeee6a1d`), and candidate retrieval
  demonstrably ran (full candidate sets stored in the breadcrumbs).
- The stored rejection reasons decompose into three failure modes:
  1. **Stray-snippet geography veto** — the decisive class. `deriveSourceSnippet`
     fed the single highest-upvote mention body. Rudys (1,315 Austin events,
     candidate set CONTAINING five real Austin/Round Rock Rudy's branches)
     was declined: *"source text specifies Rudy's dive bar on 8th (NYC
     context), candidates are all Texas BBQ locations."* Shake Shack: a
     Bryant Park trip snippet. Joes Bakery: a "Middle Village" snippet.
     One unrepresentative sentence out of hundreds of mentions vetoed the
     whole in-market brand cluster.
  2. **Named-branch-absent rejection** — Easy Tiger: *"source specifies 6th
     Street location, all Austin candidates are other branches (The Linc,
     South Lamar)"* — the E 6th branch is closed; rule v1's brand-cluster
     step only allowed picking a NAMED branch, so a present in-market brand
     was rejected for the sake of a branch Google no longer lists.
  3. **Genuinely bad candidate sets** — Chiefs Bbq (only name match in
     Panama City), Valentinas (pizza/nails/other cities), generic names
     ('Library', 'Coffee Shop'). These declines were CORRECT judgments over
     the sets retrieved; they heal via retry + the R2 twin merges (the
     Valentinas mentions now flow to the grounded Valentina's).
- Every decline was classified DEFINITIVE and spent a strike
  (682 → fc=1, 34 → fc=2, threshold 3 = janitor archive), with zero alarm.

## What was rederived vs repaired

- **Repaired (plumbing / D2-grade context)**: `deriveSourceSnippet` →
  `deriveSourceSnippets` (restaurant-location-enrichment.service.ts): the
  chooser now sees up to THREE distinct top-upvote snippets (joined with
  `---`) plus the entity's **mention count**; `LLMPlaceChooserInput` grew
  `mentionCount`, threaded through the one chooser call site.
- **Rederived (rule v2, restaurant-place-chooser.prompt.ts)**:
  - Geography gate: the SOURCE MARKET anchors; snippets are **samples, not
    a census** — a single out-of-market snippet never vetoes a strong
    in-market identity match (weight scales with mention count). Unchanged
    law: an out-of-market candidate is still never selected on name
    plausibility or snippet wording alone (the v1 gold pins for this
    still pass).
  - Brand clusters: named-branch-absent-but-brand-present now selects the
    best in-market branch — grounding is business-level; branch
    reconciliation is downstream.
- **Ledgered**: place-grounding-rule.ts release **v2, fingerprint
  `87b7c24515d7`** — deliberately re-opens every v1 remembered rejection
  (the 332 replays become non-binding automatically: `decidedVerdicts`
  filters by rule version).

## Gold suite + certification (×3)

`scripts/fixtures/chooser-gold-cases.json` grew from 6 synthetic to **10
cases**, the new 4 built from the real 08-20 rows (real candidate sets from
`lastEnrichmentAttempt`, real snippets from staging docs):

- must-SELECT: `rudys-r1-market-anchor-over-stray-trip-snippet` (real
  Ft Worth trip snippet + real 6-candidate set), `easy-tiger-r1-named-
  branch-absent-brand-present` (real E-6th snippets + real 5-candidate set).
- must-DECLINE: `chiefs-bbq-r1-identity-absent-in-market` (real Panama/
  Lamberts/Ho-Ho set), `generic-name-unknown-market-r1` — pins that v2's
  loosening does NOT leak into selecting wrong businesses or unanchored
  generics. Plus all 6 pre-existing pins (incl. both out-of-market vetoes).

Cert: `prompt-gold.ts --kind=chooser --repeat=3`, three independent runs —
**10/10 PASS, 0 FLAKY, in all three runs** (results:
`scripts/fixtures/chooser-gold.r1.run{1,2,3}.result.json`). Note: the
pinned predecessor builder also passes WITH the new multi-snippet+count
context — independent confirmation that the impoverished context, not the
judge alone, produced the 716.

## The alarm

`src/modules/restaurant-enrichment/grounding-sweep-tripwire.ts` — pure
accumulator, merge-tripwire's sibling: after ≥20 judged attempts
(no_match/updated; skips and errors count as neither), a decline rate >90%
throws `GroundingSweepHaltError`. Wired at BOTH batch chokepoints:

- `enrichMissingPlaces` (the service batch loop) — halt + **ops alert**
  (`grounding_sweep_halted`, severity critical, via OpsAlertsService);
- `scripts/reground-ghosts.ts` (the sweep that ran 08-20) — halt, loud
  stderr, exit 2.

Spec-proven RED on the 716 shape: `grounding-sweep-tripwire.spec.ts` feeds
716 straight declines and proves the run halts after spending **19**
strikes, not 716; green on a 50% mixed run; boundary pinned at exactly 0.9;
outage-only runs neither halt nor dilute.

## Strike void

`scripts/void-broken-sweep-strikes.ts` (dry-run default, `--apply`).
Identification: active places whose LAST attempt is the sweep's own
breadcrumb (`failureReasonCode='no_acceptable_candidate'` AND failureAt in
2026-08-20 00:00–04:00Z window), decrement fc by exactly 1 (the sweep
attempted each once), floored at 0.

Applied on staging after dry-run: **707 rows voided** (676 fc=1→0, 31
fc=2→1; 716 minus 9 entities that had just been merged away as twin
losers). The fc=2 cohort — Easy Tiger, La Bbq, Chiefs Bbq, Amys… — is now
two full strikes away from janitor archive going into the reload.

## R2 — place twins

Root cause of the sweep's blindness: `sweepSameNameDuplicates`' exact-fold
lane gated membership on `activeSupportExistsSql` = **item-row support
only**; most twin members had place mentions or a grounded location but no
item rows, so they were dropped before grouping (plus: staging's scheduler
is off, so the nightly never ran here anyway).

Changes (restaurant-entity-merge.service.ts + business-identity-rules.ts):

- exact-fold grouping now admits every active fold twin; the D5
  shadow-shell law moved into the judgment loop: a pair where NEITHER side
  has items, active mentions, or a grounded location is held (spec'd).
- evidence hierarchy rule 3 widened: a side with NO community evidence
  cannot conflict — it merges into its evidenced fold twin (Vincents shell
  beside grounded Vincent's was un-mergeable forever under the old
  both-empty-only arm). Two sides that both carry evidence still need the
  same dominant metro (Gueros pin intact). Specs updated + passing.
- possessive-clitic twins (Rudys/Rudy's, Joes/Joe's) need no new string
  law: `identity_key` (the one fold authority) already folds them
  identically — the gate, not the fold, was the bug.
- new `--fold-only` lever on scripts/merge-duplicate-restaurants.ts so a
  one-off apply touches only the sanctioned exact-fold docket (domain +
  prefix lanes left to the nightly).

Merge mechanics unchanged and verified: grounded side is always canonical;
merge = rehome events/references/connections/locations + archive loser
(never a delete; place-grounded restaurants survive); user anchors rehomed
via the shared anchor-rehome; identity-locked with under-lock re-resolution.

### Verdict table (staging, applied over 6 converging passes)

| Fold | Verdict | Direction |
|---|---|---|
| alamo springs cafe, andiamo, asahi imports, blaze pizza, deans, desi brothers, ginos, greens sausage house, hot dog johnnys, joes bakery, joes crab shack, kings inn, millers smokehouse, nikis tokyo inn, pietros italian bakery, rabels roadhaus bbq, rodney scotts bbq, sams, toast tea, vincents, yank sing, zorbas | MERGE | ungrounded/possessive-variant twin → grounded winner |
| chicha san chen | MERGE | grounded NYC branch → grounded Austin (same owned domain = one brand, round-13 F3 law) |
| valentinas (×3 actives) | MERGE ×2 | both ungrounded variants → grounded Valentina's (converged pass 2) |
| cm (×6 actives) | MERGE ×4 | junk-initialism consolidation into one survivor (ghost-janitor food) |
| craftsman and wolves, cypress | MERGE | evidenced ungrounded twin pairs, same dominant community |
| super burrito, mughlai indian cuisine | **HELD for owner** | grounded–grounded with DISTINCT place ids — genuinely two physical listings; needs the chain/branch ruling |
| m tea, taqueria jalisco 4, the alley, tiger sugar, truth | **HELD (D5)** | both sides evidence-free shells — never merged mechanically |

**32 merges applied; 7 folds held.** Post-apply census: the only remaining
active exact-fold twins are the 7 held folds. Rudys→Rudy's "Country Store"
(a token-boundary PREFIX pair, not exact-fold) is deliberately left to the
revived conflict-path self-heal: with chooser v2 accepting, the first
mention-driven retry merges it via the "place already owned" path — and the
prefix lane's ambiguity guard covers the rest.

## R3 — rule ledgers

- **Place chooser**: already ledgered (place-grounding-rule.ts, 2026-08-13);
  bumped to v2 as part of R1.
- **Cuisine judge**: NEW `src/modules/restaurant-enrichment/venue-cuisine-rule.ts`
  — fleet-standard `resolvePromptRule` ledger, v1 = the certified text
  (`8fdb8cb2cd26`, verified against disk). The service's input-fingerprint
  gate now keys on the resolved fingerprint (unversioned edit ⇒ loud load
  failure), and `ruleVersion` is stamped into each venue's
  `cuisineExtraction` metadata (no schema change needed).
- **Still unversioned elsewhere** (noted, NOT fixed here): moderation,
  relevance-gate, poll-subject, attribute-name, attribute-placement,
  cuisine-hub, residue prompts have no release ledger (collection-prompt
  has its own PromptRegistry versioning; word-* lanes are ledgered via
  word-vocabulary-lanes; entity-match via entity-dedupe-rule).

## Gates

- `yarn build` — clean.
- Targeted tests: restaurant-enrichment module 10 suites / 63 tests PASS
  (incl. new tripwire spec, updated business-identity-rules spec).
- `yarn invariants` — 43 invariants, 88 proofs, all green.
- `yarn boot:smoke` — BOOT OK.
- Nothing committed (per brief).

## Addendum — chooser-to-standard verification (2026-08-30, coherence audit)

**Verdict: v2 IS the principled house shape — no v3 rederivation warranted.**

- **Prompt vs philosophy canon**: read line-by-line against the 2026-08-11/16
  canon. It states the error economics once at the top and derives everything
  from it; the mental process is named ordered gates (identity, geography,
  stop-or-continue, brand clusters, what-the-place-is, ties); "samples, not a
  census" and mention-count weighting are principles, not incident patches;
  the store-typed examples (bodega/cheese shop/supermarket) teach the class
  "category is weak evidence, the text's eating-behavior decides", not an
  enumerated allowlist. No non-exhaustive lists standing in for principles.
  Contested boundaries are pinned by 10 real gold cases covering BOTH sides
  of every line (must-select market-anchor + brand-cluster; must-decline
  out-of-market, identity-absent, unanchored-generic), certified 10/10 ×3.
- **Mechanical hygiene**: temperature 0, enforced `responseJsonSchema` with
  the audit-reason policy, decision ledger row per hearing (query, snippets,
  locale, full candidate set, model), caller-profile model/ceiling, the
  78KB-system-prompt inheritance bug already closed, rule ledgered
  (place-grounding-rule.ts v2 `87b7c24515d7`) so remembered rejections
  re-open on any bump. D2-grade context confirmed: 3 snippets + mention
  count + market + dual-source candidate metadata.
- **Candidate fetch**: autocomplete (raw entity name + locationBias) with a
  searchText fallback lane, merged/ranked/deduped by placeId, 5+5 candidate
  caps, locale-retry query appends missing city/region. Not starving the
  chooser: the 08-20 decline census showed the failure lived in CONTEXT and
  rule v1, with full healthy candidate sets in the breadcrumbs; genuinely
  bad sets (Chiefs Bbq, generics) were correct declines over what exists.
- **Apostrophe trace** (no new spend — real breadcrumb, staging entity
  c85605ae "Rudys"): query `"Rudys"` → Google returned "Rudy's Country
  Store and BBQ" (Selma), "Rudy's \"Country Store\" and Bar-B-Q" (N Lamar,
  Austin) among 20 candidates — the apostrophe-less form retrieves the
  apostrophed listings. The comparison side is pinned by the
  `rudys-r1-market-anchor-over-stray-trip-snippet` gold case (must-SELECT,
  passed all three cert runs). Fold-law note: Places queries go out RAW
  (never canonicalFold'd), which is correct — Google's matcher is
  fold-tolerant and diacritics/apostrophes are signal to it.
- One considered-and-rejected edit: an explicit "punctuation/possessive
  drift is identity-neutral" line in the prompt. The model already rules
  this correctly (gold-pinned); adding it would restate an instance the
  principle covers and force a fingerprint bump that re-opens every v2
  remembered rejection for zero behavioral gain.
