# Forgotten commitments — red team, 2026-08-25

Lens: "what did we forget?" — triggered by the knowledge-attributes discovery (a designed
system never built while the drain and search evolved around it). This pass hunted every
designed-but-never-built, half-built, or sequenced-then-dropped commitment across plans/,
product/, business/, code comments, CI, git, and the staging DB — deliberately looking for
what plans/state-of-everything-20260825.md missed. Everything below is code-verified
unless marked otherwise.

Ranked by how much the live system misbehaves TODAY, then by how hard a future moment
will bite.

---

## TIER 1 — misbehaving or blind RIGHT NOW

### 1. 14 commits unpushed; CI red and not running; a static guard FAILS on current HEAD
- **Promised:** CLAUDE.md deploy law "push-main-first"; the 2026-08-02 lesson ("CI failed
  100 consecutive runs unnoticed because nothing consulted it").
- **Verified:** `git rev-list origin/main..main` = **14** — the entire iteration bench
  (S1–S3), the shadow-leak fix (357273e58), the batch-cancel fix, and all four v16
  verdict docs exist only on this laptop. Last CI run: 2026-08-20, **failure**; 4 of the
  last 5 runs red back to 08-09; zero runs since (nothing pushed). The failure is real:
  `scripts/app-route-runtime-delete-gate.sh` fails **locally on HEAD** —
  `FAIL restaurant_parent_scoped_route_contract_gate` (1 of 128 checks) — and the CI
  build job had real test failures at e7dc53b7f.
- **Why now:** the exact documented disease has recurred. Prod is frozen, so deploy.sh
  never consults CI, so red = silence. A laptop loss erases the bench and the leak fix.
  The sweep said "commit the two untracked v16 docs" — committed, push forgotten.
- **Disposition:** push main; triage the gate red (stale gate vs regression — either
  needs action); route CI-red into the nightly push-on-red channel while prod is frozen.

### 2. Staging runs PRE-FIX code — the shadow-leak fix is not deployed where shadows run
- **Promised:** v16-program: shadows run against staging; leak "fixed + pinned 357273e58."
- **Verified on staging DB:** no `iteration_runs` table (the bench's own state machine
  can't run there), and **zero** entities carry `born_extraction_run_id` or
  `status='rehearsal'` — the 339 leaked entities were minted live UNSTAMPED (that was
  the leak). The fix is in the 14 unpushed commits; staging hasn't been deployed since.
  **A shadow run today would leak again**, and the promised cleanup can't key on stamps
  that don't exist.
- **Disposition:** push + `deploy.sh --env staging` before ANY next shadow; prove the
  cleanup query can actually find the 339/943 leaked rows before relying on
  "rides rejection-sweep or activation."

### 3. Every link a user shares lands on the landing page
- **Promised (launch-BLOCKING, blueprint §5 + P4 verdict):** minimal shared web pages for
  the four artifact types + watermarked share card + day-one slug instrumentation —
  P4 explicitly says this "can't be retrofit-instrumented."
- **Verified:** the data layer is done (shareSlug columns, `@AllowUnentitled` share
  endpoints, mobile share sheet building `craveapp.ai` URLs) — but
  `apps/site/src/router.ts:75-103` serves only /, /privacy, /terms, /premium, and
  **302-redirects everything else to /**. No slug routes, no OG cards, no
  instrumentation; the onboarding attribution step lacks the P4 "a friend sent me a
  link" option, so slug arrivals can't be separated.
- **Why now:** sharing works in-app today and silently dead-ends — the app half assumes
  a web half that was never built. Same shape as drain-vs-enumerator.
- **Disposition:** build the slug pages (largest unbuilt launch-blocking item), or
  formally re-sequence with eyes open about the unretrofittable instrumentation.

### 4. Generic-query junk contract has ZERO executing tests
- **Promised:** `search-query-interpretation.service.ts:269` — "TODO(post-cleanup):
  enable the pinned generic-query cases … once the graph is clean."
- **Verified:** `search-generic-queries.spec.ts:25-30` is `describe.skip` + five
  `it.todo`. The cleanup happened (word-role facet, junk sweeps); the verification
  sequenced behind it was dropped. The owner-ruled contract ("best"/"dinner" never
  ground as entities) has no coverage.
- **Disposition:** un-skip, run, pin what passes; file failures against v17.

### 5. Live open design debt filed as archaeology — two plans quietly going backwards
- **async-integrity-ideal-shape.md** has NO status banner, and its central defect is
  verifiably still live: evidence identity keyed by delivery
  (`@@unique([extractionRunId, sourceDocumentId, placeId, entityId, evidenceType])`,
  schema.prisma:1028/1058) — exactly what the doc says must change. Reads as history;
  is the standing design debt.
- **generation-ideal-shape.md**: migration step 2 ("move every call site onto
  ExtractionScopeService") is DRIFTING OPEN — the doc's own counter re-run today:
  `active_extraction_run_id` call sites 37 (doc) → 54 (08-03 correction) → **58 (now)**.
  Nobody re-runs the counter; new code keeps landing on the deprecated pattern.
- **Disposition:** banner async-integrity as LIVE DEBT with an owner; make the
  generation counter a nightly invariant (it can show RED and is currently climbing).

### 6. Derived-index partial collapse unalerted (known; every derived table depends on it)
- `apps/api/src/shared/derived-index-job.ts:57-63`: zero-output screams, 1-row-from-17k
  is silent. Queued on the standing docket since 08-19; still unbuilt. After the 08-16
  wipe event this is the remaining silent-degradation door for everything search reads.
- **Disposition:** build (bank previous run's row count as the expectation — cheap).

---

## TIER 2 — armed traps: will misbehave at a known future moment

### 7. RevenueCat entitlement-map contradiction — the gating flip would wall paying users
- `payments-ideal-shape.md:218-225` records prod's `REVENUECAT_ENTITLEMENT_MAP =
  premium:entl60198dffff` — pointing at the entitlement the doc says was detached and
  archived, not `premium:premium`. Unreconciled. The moment `ENTITLEMENT_GATING`
  flips to `enforce` (the launch act), paying subscribers could be locked out.
- **Disposition:** reconcile before the flip; add it to the launch runbook as a hard gate.
  (Not verifiable live from here — RC/Stripe MCP need OAuth; use service-access skill.)

### 8. The Strava dual-button — owner-ruled, half-built, the ruled half is the missing half
- **Promised:** owner ruling (business-model.md, blueprint §11.8): app paywall primary
  button = external Stripe web checkout (~12-point margin swing), secondary = native IAP.
- **Verified:** the rail is fully built end-to-end (checkout-session endpoint, web
  /premium page selling both plans, webhooks, rail-aware manage-subscription) — but
  `PaywallScreen.tsx` renders ONLY RevenueCat packages; zero references to /premium or
  checkout-session anywhere in apps/mobile. The margin lever is reachable only by a user
  who finds craveapp.ai/premium alone.
- **Disposition:** add the button (small) — or record a re-ruling. pre-launch.md's
  checkbox is correctly unchecked; the risk was it reading as "rail done."

### 9. §2 paywall craft spec unbuilt — the conversion surface is a skeleton
- Blueprint/P1 verdict: annual default-selected, "$39.99 most prominent," "Try it free"
  label, Blinkist timeline, quiz-mirrored copy. `PaywallScreen.tsx` (281 lines) is the
  fact-sheet's "functional skeleton": RC-order package list, no default selection, no
  craft. Pricing structure + disclosures ARE correct. For a gate-everything business
  this IS the funnel. **Disposition:** schedule the build before TestFlight.

### 10. Retention mechanics: 1 of 3; the onboarding notification pref still feeds ~nothing
- Blueprint §8b promised ranking-change push + weekly Austin digest + poll lifecycle "by
  ~month 2." `enum NotificationType` = `{poll_release, follower_added}`. The onboarding
  step collects the preference; the two main consumers don't exist. Prerequisite
  (`movementState` heat-surge axis) also unbuilt — see #12.
- **Disposition:** re-sequence explicitly post-launch or build with the wave; stop the
  docs citing it as existing.

### 11. Onboarding tells users NYC is live; waitlist re-entry machinery missing
- `constants/onboarding.ts:90-93,282` — "Crave is live in Austin and NYC today,"
  contradicting blueprint §3 Austin-only (open since redteam verdict :555-558). And
  Addendum 3's named build item — route waitlisted users into the full flow at city
  launch — has no code. **Disposition:** copy fix now (cheap, user-facing lie);
  re-entry rides launch.

### 12. Autocomplete Phase C training data is evaporating in logs
- `autocomplete.service.ts:263,1725-1728`: hand-tuned weights ratified as interim, with
  "Phase C (post-launch calibrated tap re-ranking)" as the retirement path — but
  impressions are logs-only. The (impression, tap) pairs Phase C trains on are not
  durably stored; by launch+N months the training data won't exist.
- **Disposition:** decide if Phase C is real; if yes, persist the pairs now.

### 13. Ops alerting may be dark — several gaps use it as their ONLY signal
- `ops-alerts.service.ts:133-136`: email transport "off until a key exists … silently
  no-ops." The engineless-keyword-lane RED (`collector-pacer.service.ts:198-204`), spend
  anomalies, and #6 all terminate here. If `RESEND_API_KEY`/`OPS_ALERT_EMAIL` are unset
  in the running envs, the alert layer is silence-that-looks-green.
- **Disposition:** verify the env vars once (staging + prod).

---

## TIER 3 — designed / cross-doc-assumed, never built, no tracker

### 14. Phantom shared primitives in product/ — the enumerator pattern, four more times
Docs assert these with the definite article ("the shared X"); each area assumes another
area built it; none exist in code (all grep-verified zero hits):
- **FriendCluster** — committed in FIVE docs (profile.md:37, favorites.md:26,
  search-and-dishes, restaurant-profile, polls — with a designed label-template rule).
  Substrate exists (UserFollow, closeness.service.ts); the primitive doesn't.
- **movementState / "Rising"** — notifications.md honestly names it an unbuilt
  prerequisite, but favorites.md:73, map.md, restaurant-profile.md, and
  search-and-dishes.md all sell "Rising/momentum" sorts and badges off it as if real.
- **Bookmarks infographic + "Share Your Discovery" UTM/viral tracking** — promised in
  three docs; zero code. NOTE: profile.md's referral-unlock and offer-code incentives
  CONTRADICT the executed referral deletion ruling (payments-ideal-shape.md:412-421 —
  reward/referral machinery deliberately deleted). Profile.md needs a correction banner
  so nobody rebuilds a ruled-out mechanic.
- **MARKET toggle on the All list** (favorites.md:64) — "For You" lists were put on hold
  BECAUSE the market toggle would compensate; the All tile shipped, the toggle never
  did. A half-honored trade = net feature loss.
- **Disposition:** one product/ correction pass adding shipped/planned tags to these
  five names; register FriendCluster as a real build item or soften the five docs.

### 15. The v2 value-ranked collection scheduler — four constants waiting on an untracked subsystem
All in code comments, no ledger cites it: `collector-source-registry.service.ts:517-522`
(persist uncovered counts "when v2 lands"), `keyword-slice-selection.service.ts:84-89`
(interim bars "DISSOLVE into rank-under-budget"), registry :88/:95 (§22
estimator-refresher), `poll-weekly-ritual.service.ts:13` (cron "replaced wholesale when
the §21.2 pacer lands"). Collection prioritization and poll cadence run on hand-tuned
interims whose designed replacement lives only in comments.
**Disposition:** register as a roadmap item or formally re-bless the interims as final.

### 16. Language-detector placeholders await a "D3 gold corpus sweep" that exists nowhere
`entity-text-search/query-analyzer.ts:299-307` — four live thresholds "are PLACEHOLDERS
until the D3 gold corpus sweeps them"; no D3 sweep in any plan. Every non-English
query's routing rides guesses, and the Phase-4 language wave will bank on this router.
**Disposition:** fold the calibration into the wave estimate explicitly.

### 17. Spend-ceiling declared-not-enforced + placeholder thresholds (money spine's own TODOs)
`spend-campaign.service.ts:680-686` (unitCount recorded, not enforced — a script that
forgets its loop cap is unbounded), :976 (resume-after-breach lacks print-then-approve);
`spend-analytics.service.ts:59-68,114-125` (MIN_SAMPLE_UNITS=100 and the TomTom
hot-fraction proxy are placeholders pending unbuilt §14.2 measureDrift).
**Disposition:** same territory as the D4/D5 owner policy questions — merge them.

### 18. Small verified stragglers
- **Dead-hook-args gate**: proven instrument deliberately unwired pending deletion of 11
  known-dead args (`find-dead-hook-args.mjs:106-112`) — one cleanup commit from enforced.
- **Stale gate exemption**: `check-tracksheet-invariants.mjs:31-33` exempts SaveListPanel
  citing a "pending" owner ruling that LANDED 08-08 (`SaveListPanel.tsx:497-499`).
  Delete the exemption; if the gate then fails, it was hiding a defect.
- **Score-calibration never migrated onto the §10 coverage machinery it waited for**
  (`score-calibration.ts:45-60`) — waited-for-X, X shipped, nobody returned.
- **User-list kind collision policy** (`user-list-provisioning.service.ts:110-114`) —
  unresolved owner decision; colliding users permanently lack a default list; only a warn.
- **multi-location-enrichment.md**: ~80% shipped but unbannered, and its one unshipped
  requirement — stop relying on `is_primary` — is invisible (`isPrimary` still drives
  merge + expansion logic). Banner it, decide the is_primary question.
- **w3-messaging-design.md** says "DESIGN ONLY; no code" — messaging SHIPPED; the one
  thing genuinely still owed (a DM NotificationType) is hidden by the stale banner.
- **EmailAuthModal** migration deferred (search-and-dishes.md:166) — known live defect
  (appModal paints underneath); still outstanding, tracked only in a product doc.
- **Stale header**: `label-sweep.service.ts:29` still says "judge is stubbed"; the real
  generator is injected by the nightly. Reword.
- **search-and-dishes.md** re-uses the dead `user_search_demand_daily` name one paragraph
  below its own correction (live table: `signal_demand_daily`).
- **Vote-integrity deferred enforcement**: `excluded_at` filtering + `remintForPoll` land
  "with the first confirmed ring" — real unbuilt enforcement behind a documented trigger.
- **Cost-reconcile** after the reground (~$120-150) + v16 ($11.89): the CLAUDE.md law
  says run after every one-off spend; no record proves it ran. Verify/run once.

---

## TIER 4 — parked honestly (trigger + owner confirmed; no action beyond endorsement)

- **Knowledge-attributes program** (the trigger for this pass): confirmed design-only —
  no `knowledge_attributes` column exists. Correctly ratified into roadmap Phase 4/5.
- **Hard paywall**: fully built (interceptor, ledger, teaser, onboarding v6 all verified
  shipped and committed — the "uncommitted onboarding" memory is stale); NOT ARMED
  (`ENTITLEMENT_GATING` ≠ enforce) — that's the launch act, correctly gated.
- **Referral/reward deletion**: correctly executed and held (except profile.md, see #14).
- **Freemium pivot**: genuinely one commit away as promised.
- **Week-3 price-ceiling cohort**: RC-dashboard config by design; cohort size an open
  owner call. **Budget envelope + §8.5 demand model**: owner deliverables, not started.
- **Launch-gated checklist** (pre-launch.md / launch-runbook.md): Stripe live keys, owned
  domain, F1101 aps-environment, Cloudinary split — all correctly `[ ]` behind launch.
- **observability-overhaul / gemini-consumption-modes**: honestly self-declared unbuilt;
  already on the sweep's adopt-or-close list. **Poll-supply rederivation**: the largest
  KNOWN unexecuted body — already flagged, owner sequencing.
- **restaurant-profile-revamp**: DORMANT-INTENTIONAL, unchanged.
- **CJK tokenized surface store, B2B claimed profiles, per-poll rooms, images deferral
  list, android-parity**: all honestly framed with triggers.

---

## How we got here — the three crack shapes (all present in the enumerator case)

1. **Commitments recorded only where no sweep looks.** Code comments (v2 scheduler, D3
   sweep, Phase C data) and present-tense product prose (FriendCluster in five docs) are
   invisible to plan-file reconciliation. The two ledgers don't cite each other, and
   neither cites code TODOs or product/ assertions.
2. **"When X lands" triggers where X landed and nobody returned.** Score-calibration,
   the SaveListPanel gate exemption, the skipped generic-query tests, the drifting
   generation counter. The trigger fires silently; no mechanism walks the waiters.
3. **Watchers that only work when consulted.** CI red since 08-09 with prod frozen =
   nobody consults; ops alerts no-op without a key; the site 302s unknown paths instead
   of 404ing (so dead share links look "handled"). Push-on-red is the proven fix —
   extend it to CI and to any silent no-op path.

**Proposed standing fix:** a nightly code-promises census — grep-derived "when-X-lands /
TODO / PLACEHOLDER" inventory diffed against a classified baseline, new entries
guilty-until-classified (the table-census pattern already built and proven this month) —
plus shipped/planned tags in product/ so present-tense vision stops compounding into
assumed fact.
