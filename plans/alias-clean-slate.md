# The Alias Clean Slate — resolver/alias rederivation program (owner-approved 2026-09-02)

Owner ruling: the alias layer gets its long-term ideal shape, rebuilt from a
clean slate. Derived data (aliases, merges, un-adjudicated vocabulary) is
wiped on staging and regenerated under today's certified rules with full
ledgering; ground truth (documents, extractions, grounded restaurants, user
anchors) is never touched. Rationale: measured audit (2026-09-02) — ~93% of
alias-shaped extraction aliases unledgered; 16,719 'legacy' rows with no
provenance treated as testimony; 35 of 95 restaurant merges joined different
restaurants via shared ordering-platform domains; the pre-Aug judge flipped
60% of its own verdicts; the post-Aug-30 courts certify 25/25 and 38/38 —
the machinery is good, the stock is not.

## The zeroth principle (rederived from scratch, owner-prompted 2026-09-02)

**The alias table is a PROJECTION, never a store.** The system holds three
sources of name knowledge — TESTIMONY (documents + extractions), JUDGMENTS
(the verdict ledger), SPECULATION (versioned generator outputs) — and
`entity_surface` must be derivable from them at all times. Incremental
banking is cache maintenance; the wipe/regeneration is the proof the
projection property holds. Every reset behavior is a corollary: observed
rows follow the extraction generation, judged rows follow rule versions,
recall rows follow generator versions. Standing invariant: an active
surface row that cannot be re-derived from one of the three sources is a
defect.

## The one principle

**An alias is an identity claim and must meet the same bar as a merge.**
Aliases are classified by the GRADE OF CLAIM they make, never by which
service wrote them:

| grade | meaning | evidence | may route a mention (resolution)? | may decide sameness (dedupe/identity probes)? | serves search recall? |
|---|---|---|---|---|---|
| `observed` | a person wrote this string about this entity | verbatim extraction text, Google's display name | YES (identity by construction) | YES | YES |
| `judged` | a court ruled this string names this entity | an entity_match/dedupe/name-court verdict AT THE RULE IN FORCE | YES, only while its verdict's rule version is current | YES, same condition | YES |
| `recall` | a model's guess at how people type/translate it | vocabulary sweep, knowledge synthesis, cuisine templates, orthographic variants, query banking | **NEVER** | **NEVER** | YES (its only job) |

Consequences, each a build item:

1. **Schema**: `entity_surface` gains `claim_grade` (observed|judged|recall)
   and `origin_verdict_id` (FK-ish text key into claim_verdicts; NULL only
   for `observed`). CHECK: `judged` requires an origin verdict. The `source`
   column stays as writer provenance but no reader may branch on it for
   authority — grade is the authority.
2. **Resolution rederivation**: Tier 2 consults `observed` + in-force
   `judged` only ("in force" = origin verdict's rule_version equals the
   lane's current version; a rule bump silently demotes every judged alias
   to candidate until re-heard). `recall` never resolves a mention. Tier 2
   writes a RESOLUTION TRACE on every event (tier, matched surface_id or
   verdict key, fold version) — `metadata` is never `{}` again. The judge's
   match may bank ONLY the verbatim observed string as `observed`; the
   LLM-normalized string is banked as `judged` with the verdict key (ends
   the alias ratchet). Tier 2 SQL gains the rehearsal predicate Tiers 1/2.5
   already have.
3. **Merges**: every merge (food dedupe, restaurant same-name/prefix/domain
   sweeps, place-id collision, ontology) writes a claim_verdicts row BEFORE
   its effect — no more log-line-only merges. Merge folds land as `judged`
   with that verdict. Domain lane: shared-domain is evidence ONLY for an
   **allowlisted owned domain** (a domain is owned iff exactly the merging
   brand's entities carry it corpus-wide AND it is not a platform — replace
   the denylist regex in business-identity-rules.ts with this positive
   test); otherwise the pair goes to the judge with the domain shown as
   context, never auto-merged.
4. **Closed-place standdown**: an archived real place that holds the exact
   fold of a mention absorbs it (resolvable, hidden from search) — its
   mentions never leak to a look-alike (the Mandala→Mandola's class).
5. **Activation twin fix**: the rehearsal flip unifies same
   (type, identity_key) entities born across runs before going live
   (adoptedCrossRun must be able to be >0).
6. **Writers re-graded**: cuisine templates → `recall`; poll-typed text →
   `observed` but grade-limited to recall until a court hears it (a user's
   typo must not route mentions); labels (display) unchanged; orthographic
   variants → `recall`. The word-claim court's TESTIMONY_SOURCES set is
   replaced by grade: only `observed` is unevictable testimony.
7. **Invariants (each mutation-provable)**: every non-observed active
   surface has an origin verdict; a rule bump demotes judged aliases (RED
   test flips a version and asserts demotion); no cross-word Tier-2 hit
   without an in-force verdict; every merge has a ledger row older than its
   redirect; resolution trace non-empty on new events; ledger
   self-consistency alert (two opposite verdicts, same fold+candidate, same
   rule version).
8. **Gold pins for the identity judge**: bubbles (sparkling wine vs boba),
   mole vs mole plate, breakfast croissant vs breakfast sandwich, mandala
   vs Mandola's — all four absent today from entity-match gold.

## The generation-following law (owner, 2026-09-02)

Every alias layer resets with the thing that produced it:
- **observed** follows the EXTRACTION GENERATION: banked stamped with its
  extraction run; on activation of a new generation, observed spellings are
  regenerated from the active generation's events and spellings supported
  only by superseded runs are deprecated (backfill-observed.ts `--replace`
  becomes a standard activation step, same supersede choreography as
  events/projections).
- **judged** follows RULE VERSIONS: a bump demotes instantly via the
  in-force read; re-hearings re-arm. Re-extraction never resets judgments.
- **recall** follows its producing prompt's version (vocabulary re-pay per
  bump — the existing fleet law).

## The wipe + regeneration (staging; manifest-approved before running)

Preserved absolutely (existing law): place-grounded restaurants, user
anchors (preserved-anchors.sql), documents, extraction runs/outputs, the
claim_verdicts ledger (history; old-rule rows are naturally reopened).

Wiped: all entity_surface rows; all entity_redirects + merge state (325
archived losers un-archived; mention/connection re-pointing left to the
Austin corpus rebuild, which regenerates connections anyway); vocabulary
rows without a current-rule verdict.

Regenerated, in order:
1. **Observed spellings** — mechanical backfill from stored raw_output of
   the ACTIVE extraction generation (backfill-observed.ts). THE PAIRING BAR
   (settled during the build, 2026-09-02): a raw string pairs with an
   entity only by identity-by-construction — its canonical fold equals the
   entity's identity_key (or squeezed twin) among the entities that input's
   own events resolved to, exactly one match. The event's mention_key is a
   hash over pipeline-transformed fields and CANNOT be recomputed offline
   without a second pipeline implementation (probed: 0/59k pairings), and a
   string whose association needed a judge is a JUDGED claim by definition —
   it re-earns through a hearing at current rules, never by resurrecting the
   old pairing. Measured on the local corpus: 22k deterministic pairings →
   5.2k observed forms. $0.
2. **Merged twins** — the nightly convergence sweeps re-hear the corpus
   under current rules (entity_dedupe v-current, restaurant sweep with the
   owned-domain test), fully ledgered. Cost: judge hearings, bounded by the
   docket; manifest quotes it.
3. **Vocabulary/labels** — the certified sweep re-runs per locale (standard
   one-re-pay-per-bump price). Cross-word judged aliases start EMPTY and
   accrue only through hearings.
4. **Verification** — re-run the four failure probes (bubble, mandala,
   croissant, Sammie's-class), the alias census queries from the audit
   (foreign-name alias counts, colliding folds, name-twin stubs → all
   should collapse to ~0 or explained), and the search-harness gates.

Rule of conduct: if regeneration exposes judgment gaps, fix RULE +
RE-HEAR (version bump), never hand-edit rows.

## Sequencing

After v22 activation (done first). Build items 1–8 as one code campaign
(commit gates: build, full suite, invariants incl. the new RED proofs,
boot smoke), then the wipe manifest to the owner, then execute + verify on
staging. Prod inherits via the normal deploy + the eventual prod reload.
