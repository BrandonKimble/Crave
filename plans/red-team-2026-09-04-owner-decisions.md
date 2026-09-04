# Holistic red team — owner decisions batch (2026-09-04)

Everything below is a design choice, not a bug I can fix alone. Each item
says what a user or the bill experiences under each option, and my
recommendation. "Take all recommendations" is a valid answer.

## 1. Moved-place re-enrichment is a weekly Places spend loop (E-3)

**What happens today:** when Google says a place moved, the janitor
re-enriches the restaurant with a full name search plus details every
week, forever, and creates a second location row instead of fixing the
first. Cost per moved place per week: an autocomplete + chooser + full-SKU
details call. Staging has 0 moved rows today; prod will accumulate them.

**Options:**
- A (recommended): a Google redirect is Google's own verdict — one lean
  details call on the new place id, rewrite the location row in place,
  clear the moved flag. No judge, no autocomplete, done once.
- B: keep the loop but cap it (retry N times then archive the row).

## 2. The resurrection loop (E-4)

**What happens today:** an active restaurant whose chooser lands on a
Google place already owned by an ARCHIVED, un-redirected restaurant pays
autocomplete + details on every mention forever, never strikes, never
alarms, and leaves the grounding verdict marked executed with no merge.
Staging has 230 archived places without redirects.

**Options:**
- A (recommended): an archived owner without a redirect is the same
  business coming back — revive it and merge the newcomer into it as a
  ledgered place merge (user anchors survive, one entity).
- B: treat the archived owner as the loser — move its location row to the
  newcomer under the merge lock (also ledgered).
Either ends the loop; A keeps the older entity's history.

## 3. The operator sweep ignores the worker-lane hold (E-6)

**What happens today:** when the worker lane is held (too many declines),
`enrich-restaurants.ts` still spends. The per-run tripwire can't arm under
20 judged attempts, so a `--limit=10` run never trips.

**Recommendation:** one hold, evaluated at the `enrichPlace` chokepoint,
fed by the durable decline window; the per-run tripwire becomes a second
reader of the same window. No decision needed beyond "yes".

## 4. Two answers to "is this domain owned?" (E-7)

**What happens today:** enrichment-time domain merge considers ARCHIVED
same-domain twins (no status filter); the nightly sweep considers active
only. An archived un-redirected oldest candidate can make enrichment throw
AFTER grounding committed, so the restaurant is grounded but reported as
an error and never gets secondary-location expansion or cuisine extraction.

**Recommendation:** one `ownedDomainCluster(domain)` (active, redirect-
resolved) used by both; the post-grounding tail runs regardless of a
merge refusal. No decision needed beyond "yes".

## 5. Resuming a breached campaign (G-2) — happening NOW

**What happened today:** the v23 Austin shadow was estimated at $12.89
and has spent $20.08 against a $20.43 envelope with two jobs left. If it
breaches, resume is broken for manifest campaigns: the service re-quotes
extraction-only and the script hashes with a different tolerance, so
`resume-campaign.ts` always fails with a stale-hash error.

**Options:**
- A (recommended): one `quoteResume()` on the service used by both the
  service and the script (no re-derivation); a resumed envelope is floored
  at what has already been spent plus tolerance, so a resume can never
  re-breach instantly. I can land this today.
- B: forbid resume for manifest campaigns; a breach means a new campaign.

**Also for you:** the v23 estimate undershot by ~55%. The prior-replay
rate came from v21/v22 runs; v23 is a longer prompt and its interactive
tail (entity matching under a bigger corpus) cost more. The tolerance
absorbed it this time. I'd like to re-measure the manifest rates from
this run before the next city.

## 6. The invariants harness across sessions

**What happened today:** a second Claude session ran `yarn invariants` in
the same working tree while this session was mid-edit; the harness
mutates source files, and one of its edits got committed by mistake and
made the API unbootable on main for ~40 minutes.

**Recommendation:** the harness takes a repo-level lock file and refuses
to start while another runner holds it; the pre-commit hook refuses when
the lock is held. Cheap, and it closes the class. "Yes" is enough.

## 7. The mobile docket (from the 2026-08-19 red team, still open)

- **P0:** the polls/home feed runtimes are instantiated twice, permanently
  (every fetch, socket, and toggle consequence runs 2x). Fix needs a
  ruling on which host owns the runtime.
- Return-to-origin scroll restore is dead end to end.
- The shell-residency subsystem is inert (liveness hardwired true).
- Frame-budget governor still budgets in per-frame constants (120Hz
  class).
Options: (A) rule now and I fix under the perf harness; (B) park until
after Austin launch. My recommendation: A for the P0 only, B for the rest.

## RULINGS (2026-09-04 evening, owner): all recommendations accepted

- Items 1–7: the recommended option in each (1A, 2A, 3 yes, 4 yes, 5A landed,
  6 landed, 7A for the P0 only; the rest of the mobile docket parked).
- Google spend law for every enrichment change: never a lesser Places call
  when the rewritten row or a consumer needs the full details fields; optimize
  only where a cheaper SKU covers every consumed field, and say which.
- The wholesale/shelf law (B.2) stays exactly as written.
- The resolution rederivation is approved in full: roster recall + write-time
  embeddings + recallability invariant; ledgered rejects + parked names;
  grounding inside the shadow; subtree chunking + re-chunk on replay; then
  the four prompt principles with gold cases (v24).
- After the non-prompt work lands: a 1,000-mention audit from raw source →
  model output → resolution → entity/event, categorised by cause, with the
  model's own reasoning captured for every wrong decision, to rederive the
  prompt's principles from the full set of classes rather than the cases
  found today.
