# THE AUSTIN LAUNCH-LOAD PLAN — one approval sheet (2026-08-30)

Built read-only from staging (SELECT-only), the local pushshift archive, the
spend-campaign ledger, and the committed reports. Every number below states
its evidence. Prompt/judges/chunking are final at HEAD `50850a637`
(LLM_CHUNK_MAX_DOCS=30 settled by the bundle-size experiment).

---

## THE APPROVAL SHEET

**Bottom-line cost (one-off):**

- **3-year-window plan (recommended): ~$200–400 total.**
  LLM extraction ~$110–160 · Places grounding ~$70–225 (capped, see risk #1)
  · queued knowledge backfills ~$5–10 · relevance gate <$1.
- Full-archive-to-2012 variant: adds ~$60–80 LLM and little else (pre-2023
  data mostly references dead places — Places churn risk goes UP).

**Duration:** ~1–2 weeks wall-clock. Batch-rail extraction of ~350k docs runs
in waves (the 39.8k v16 replay drained overnight; this is ~9x that volume →
~3–6 days of batch cycles), then grounding retries, backfills, verification
gates, and one full nightly cycle watched before arming the flip-list.

**Decisions you must make (3):**

1. **Archive window — 3 years or everything?** The 2026-07-06 ruling
   recommended 3y (closure decay makes years 4–5 the most-dead, most
   Places-wasteful data; backfilling later is one idempotent command,
   un-loading is not a thing). Your words were "full archive load."
   Recommendation: **3y now**, revisit after the coverage eyeball.
2. **NYC rides along or not?** The v17 re-extract naturally covers the whole
   89.9k-doc corpus (Austin 39.8k + NYC 50.1k) for ~$15 extra. Recommendation:
   **yes** — one coherent corpus under one prompt, and NYC's archive backlog
   stays parked.
3. **Where does the launch corpus live?** The 2026-08-09 iteration ruling
   says staging is the lab and prod LLM rails stay disarmed. This plan runs
   ENTIRELY ON STAGING. But "launch" eventually means prod, and there is no
   staging→prod promote script — re-running on prod would re-pay the whole
   LLM bill. You must rule: (a) bless a staging→prod data promote path
   (cheap, needs building/verifying), or (b) accept a second paid run on
   prod at launch (~$110–160 again), or (c) declare staging's DB becomes
   prod's. **This is the biggest unpriced fork in the plan.**

Fast path: take all recommendations → approve a **$450 hard cap** ($250 of it
a Places checkpoint), 3y window, Austin+NYC re-extract, staging target.

---

## 1. SCOPE CENSUS — what exists vs what's missing

**Staging today (queried 2026-08-30):**

| community  | posts | comments | date range        | active-run coverage |
| ---------- | ----- | -------- | ----------------- | ------------------- |
| austinfood | 1,358 | 38,444   | 2022-01 → 2026-07 | 39,793 / 39,802     |
| foodnyc    | 1,734 | 48,365   | 2020-10 → 2026-07 | 50,099 total        |

Austin's 39.8k docs are **almost entirely a 2023 slice** (36.4k of them dated
2023; 2024 has 755 docs, 2025 has 1,848). 38,962 docs carry the active
registry prompt (v16, hash `70776b66…`, activated 08-29); 831 still sit on
the retired v1 hash.

**The final prompt (v17) is NOT yet registered** — it lives at
`apps/api/src/modules/external-integrations/llm/prompts/collection-prompt.candidate.md`
(certified 173/173 ×3, commit `337352b57`). **Zero docs are extracted under
it.** The registry holds versions 1–16 only.

**The archive (local disk, `austinfood_{comments,submissions}.zst`, spans
2012 → 2025-12, counted by decompression):**

| year                   | posts (with comments) | comments |
| ---------------------- | --------------------- | -------- |
| 2023                   | 4,525                 | 127,192  |
| 2024                   | 5,543                 | 178,988  |
| 2025                   | 5,556                 | 172,576  |
| full archive 2012–2025 | 27,120 raw posts      | 635,360  |

So the honest picture is **worse than "half never processed"**: within the
3-year window alone (~2023-08 → 2025-12) the archive holds ~400–430k comments
across ~13k commented posts; staging has processed ~38k comments. **Roughly
90% of the in-window archive was never extracted.** 2026 (Jan–Jul) is partly
covered by past chronological collection (661 comments) — thin; the
chronological catch-up closes it.

**The three workstreams, sized:**

- **(a) Re-extraction of the existing corpus under final v17:** 39,802 Austin
  docs (or 89,901 with NYC — decision #2). Pointer-flip replay; no
  collection needed.
- **(b) Archive backlog (3y window):** stage-0 gates drop ~10–15% (bots,
  deleted, zero-comment posts; the 2026-07-07 measurement: −45% of posts,
  comments survive at higher rates) and the relevance gate keeps 94.3% on
  austinfood. Net **~320–370k NEW documents** (minus the ~36k 2023 docs
  already loaded, dedupe is by source id — additive and idempotent).
- **(c) Ongoing chronological:** r/austinfood runs ~170 comments/day (2025
  actuals ≈ 172k/yr). ~5k docs/month once schedulers arm.

---

## 2. COST — banked actuals only

**LLM extraction — $0.31/1k docs measured, three independent runs:**
spend_campaigns ledger: `reextract:austinfood:v16` 39,802 docs = **$12.19**;
v15 = $11.52; v14 = $13.89; the 08-20 dual-city 89,901-doc run = $11.89.
The bundle-size experiment banked $0.39/1k as the certified worst case.

| item                               | volume           | cost                        |
| ---------------------------------- | ---------------- | --------------------------- |
| (a) re-extract Austin under v17    | 39.8k docs       | **$12–16**                  |
| (a') + NYC                         | +50.1k docs      | **+$15–20**                 |
| (b) archive backlog, 3y            | ~320–370k docs   | **$100–145**                |
| (b) relevance gate on backlog      | ~13k post titles | **<$1** (measured $0.15/6k) |
| full-archive variant instead of 3y | ~560k docs total | $170–220                    |

**Places grounding — $0.045 per NEWLY grounded location** (re-measured
2026-08-02 against the BigQuery billing export: 7,115 locations / $323.10;
the old $0.028 summed the wrong column). Yield evidence:

- The existing ~40k-doc Austin corpus produced ~4,200 grounded Austin
  restaurants (July fresh-start actuals, the $118 lesson).
- Discovery is deeply saturated: the July run measured discovery falling
  407→~25 per 100 posts with 91–97% re-mention rates. The backlog is more
  of the SAME subreddit and years — new-place yield per doc will be far
  below the first pass, but 2024–2025 material adds genuinely new openings.
- Also retried on this load: the **1,021-entity ungrounded backlog** — 303
  never-attempted plus the 716 reopened v1 rejections (chooser rule v2
  `87b7c24515d7` auto-reopens them; 707 bogus strikes already voided).
  Most of these are existing entities getting grounded — they are exactly
  what the $0.045 unit covers.
- **Honest range: +1,500–5,000 newly grounded locations → $70–225.**
  This is the widest band in the plan; it gets a checkpoint, not a guess
  (see risk #1). No fake midpoint offered.

**Queued knowledge backfills (must run regardless — R6 sequencing):**

- Category (v4) knowledge backfill: ~150 LLM calls — **~$1–2**.
- Cuisine re-run over fresh entities — **~$3** (banked estimate).
- Cuisine-widening v2 / venue-cuisine dish-set lane: 0-row dormant until the
  v2 backfill lands; the reviewed 174-edge set already applied — **~$1–2**.
- Embedding backfill: script-driven, negligible ledger lines historically.
- **Dish-knowledge synthesis (5AM flag) is UNPRICED at this scale**: it runs
  once per new dish, and the backlog will mint thousands of new dishes.
  Meter the first armed night and set a campaign cap before leaving it on.

**Ongoing run-rate after launch (context, not part of the one-off):**
chronological ~5k docs/mo ≈ $2/mo LLM + a Places trickle; janitor
~$6–27/wk Places (flip-list row); nightly judge lanes are capped by design
(census ≤50 calls/night, demand-vocab ≤100).

---

## 3. CHOREOGRAPHY — the ordered runbook

**Environment: STAGING, per the 2026-08-09 iteration ruling. Prod stays
disarmed throughout** (`CRONS_ENABLED` absent/false on prod worker,
`COLLECTION_SCHEDULER_ENABLED=false`). Any prod promotion is decision #3 —
not part of this run.

**Wipe vs replay: NO WIPE.** The shadow-replay + pointer-flip machinery is
the tooling's proven strength (v14–v16 all ran through it); the
community-scoped wipe is a disaster tool. Restaurants-never-deleted and
user-anchor laws bind regardless; activation GC (`gc-unsupported-entities`)
cleans derived residue afterwards. A wipe would also re-open the $118 Places
class for zero benefit.

**Phase 0 — preconditions (no spend):**

1. Commit state is clean at `50850a637`+; sweep the untracked fixture debris
   (shard3\*, d4 run results) per redteam R5.
2. Fix-first items from campaign-redteam-v3 confirmed landed: chooser v2 gold
   gate + >90%-decline tripwire (RED-proven), strike void applied, twin
   merges applied, reason tripwire live. Strike state fresh: verify
   fc distribution shows the voids.
3. R6 guard: confirm the category-edge builder refuses to replace 4,907
   standing edges from an empty `knowledge_categories` — or hold
   `FOOD_CATEGORY_EDGE_BUILDER_ENABLED` off until the backfill (step 6).

**Phase 1 — register + re-extract the existing corpus under v17:** 4. `bench.sh` / `reextract.sh push collection-prompt.candidate.md` → version
17; campaign estimate for 39.8k (or 89.9k) docs; **owner approval #1**
(~$15–35). Shadow replay (`activate:false`), batch rail, poller drains
over hours. Verify shadow isolation (app unchanged while it runs). 5. Diff → triage (AUTO / AGENT-REVIEW / OWNER-DECISION, incl. the v17
refusal section — banked refusals must surface) → **owner approval #2**
→ activate (pointer flip) → activation GC → anchor-audit clean.

**Phase 2 — knowledge backfills (before any nightly can run):** 6. Category v4 backfill (~150 calls) → cuisine re-run (~$3) → cuisine
widening v2 backfill → venue-cuisine dish-set re-confirm → embedding
backfill script. Order matters: category backfill BEFORE the edge
builder ever fires (R6).

**Phase 3 — archive backlog, chronological order:** 7. Campaign estimate for the 3y backlog (~$100–145); **owner approval #3**.
Run archive ingestion oldest-first in month/quarter waves (stage-0 gates

- relevance gate on; batch rail — its poller runs on the worker runtime
  regardless of `CRONS_ENABLED`; `LLM_BATCH_POLL_ENABLED` is only an
  explicit off-switch, never an arming flag). New docs extract directly under active v17 — no shadow needed.

8. **Checkpoint per wave:** doc counts vs archive census, batch failure
   taxonomy clean (the lease/quarantine machinery from the 07-08 audit is
   built — watch it, don't babysit it), `cost-reconcile.sh` after each wave.
9. **SEQUENCED GROUNDING (waves 3-4 red team W1 — chooser v2 has ZERO live
   verdicts; do not let the unmeasured judge run job-by-job first):**
   a. FIRST run the tripwired `enrichMissingPlaces` batch sweep over the
   1,021-entity ungrounded backlog — the sweep's per-run tripwire halts
   on a >90% decline rate before strikes pile up.
   b. OBSERVE v2's live acceptance rate land in `claim_verdicts` (lane
   place_grounding at the v2 rule version). A healthy sweep = real
   selected verdicts at a sane rate, not just gold-harness certs.
   c. ONLY THEN arm mention-driven retries (the worker lane). That lane now
   carries its own durable-breadcrumb decline alarm
   (`worker-lane-decline-alarm.ts`: trailing-2h window, >90% decline over
   ≥20 attempts → fail-closed hold + critical ops alert, no strike
   spend) — but the alarm is the backstop, not the plan; the sweep-first
   ordering is what keeps a broken v2 from ever meeting the mention
   firehose.
   **Places checkpoint at $125 spent** (~2,800 new groundings): eyeball a
   sample, then release the rest of the cap or stop.

**Phase 4 — chronological catch-up + turn everything on:** 10. Chronological collection closes the 2026 gap (archive ends 2025-12;
staging has slivers of 2026 → collect 2026-01 → today, then steady
state). 11. Arm the flip-list ON STAGING per `plans/launch-flip-list.md`, in its
own order: `CRONS_ENABLED` first; collection (the batch POLLER already
runs on any worker, cron switch or not — only submission needs arming
via collection); knowledge
rail + name census + janitor TOGETHER (court-without-janitor leaves
ghost entities); demand/intake flags last (no user demand yet — they
idle). Watch ONE FULL NIGHTLY CYCLE's logs + spend, `cost-reconcile.sh`,
then declare the load done. 12. Verification gates before calling it launch-ready: anchor audit clean,
same-name dupe gate ≈0, ungrounded share re-census (expect the 12.2%
to drop hard), category search live post-backfill, the four stretchy
widening edges eyeballed on real search pages, k-anonymity/demand
surfaces left to settle — the demand read-models run on 15-min/1–4-day
cadences, so demand-fed surfaces (curated lists, taste profiles) read
empty-ish for days after arming. That is expected, not a defect.

---

## 4. RISK REGISTER

1. **Places over-spend if new-place yield beats the estimate** — the one
   genuinely open-ended line. Mitigation: the $125 mid-cap checkpoint
   (step 9), the chooser tripwire (halts on >90% decline shape instead of
   spending strikes), and the hard $250 Places ceiling. Restaurants are
   never deleted, so every dollar here is banked knowledge even if we stop.
2. **The prod fork (decision #3) is unpriced.** If the answer is "re-run on
   prod," the whole LLM line roughly doubles at launch time. Decide before
   Phase 3, not after.
3. **Dish-knowledge synthesis at 10x corpus scale is unmetered.** Arm it
   last, meter night one, cap it.
4. **Batch-rail queue time.** ~350k docs ≈ ~12k batch requests; Gemini Batch
   turnaround is hours per wave — plan for 3–6 days and don't panic-retry
   (the transient/deterministic error taxonomy is built; trust it).
5. **First-nightly wipes (R6 class).** Any builder that derives from a
   not-yet-backfilled table can silently zero a derived surface. Phase 2
   before any flip; keep the edge-builder flags off until backfills land.
6. **Demand cadence illusion.** 1–4-day read-model cadences mean the app
   looks under-populated right after arming; verify against the tables,
   not the home screen.
7. **Held owner items ride along unresolved:** 7 apostrophe-twin pairs held
   for owner, pub→bar direction question, retail-brand tightenings — none
   block the load, all should be answered before public launch.
8. **Old-data closure churn** (if full-archive variant chosen): pre-2023
   years are the most likely to ground dead places — paid enrichment for
   venues the janitor then archives. The 3y window is the mitigation.

---

_Evidence trail: staging SELECT-only queries this session (doc census, prompt
registry, spend_campaigns); local zst decompression counts; plans/
campaign-redteam-v3.md, grounding-fix-report.md, archive-prefilter-pipeline.md,
wave-acceptance-report.md, launch-flip-list.md, austin-reextract-handoff.md;
commits `50850a637`, `337352b57`, `1e0c17907`._
