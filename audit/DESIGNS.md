# DESIGNS — proposals, rubric reviews, verdicts

Every Phase-1 design proposal lands here with the orchestrator's rubric
answers and verdict (APPROVE / SEND BACK / ESCALATE). A rejected design
must not be re-proposed in a later round without new evidence.

Format per entry:

## D<N> — <title> (territory, date)

PROPOSAL: …
RUBRIC: unrepresentable? bedrock? blast-vs-invariant? deletes-more? prior-rejection? values-boundary? user-visible/money/data-lifetime? migration?
VERDICT: … REASONING: …

## D1 — RC entitlement translation: closed union, unknown fails loudly (api-identity-money, F101)

PROPOSAL: `reverseEntitlementMap.get(raw) ?? raw` lets an unmapped RevenueCat id BECOME our entitlement code; grants minted under vendor vocabulary are invisible to accessVerdict → a paying customer 403s. Shape: translation returns mapped|unknown; unknown ⇒ record event FAILED + rethrow (RC redelivers); entitlement codes become one closed union; delete the guessed default map.
RUBRIC: makes wrong-vocabulary grants unrepresentable (not merely unlikely); bedrock right (ledger denominated in OUR vocabulary — same bedrock access-verdict already established); blast = RC purchase path; deletes the guessed default (no-fake-estimates law violation); no prior rejection; VALUES/UX: changes failure behavior on the MONEY path and the correct map contents are a product config only the owner knows.
VERDICT: **ESCALATE** (recommend: adopt the shape; owner supplies the true RC↔code map before ship). Orchestrator spot-checked :279/:572 — defect real.

## D2 — @AuthenticationEffect three-value boot marker (api-identity-money, F102)

PROPOSAL: replace boolean bearsRequestUser with 'required'|'optional'|'none'; a route whose ONLY auth is optional must also declare @AllowUnentitled or boot fails naming the route. Agent proved by executed spec that today's audit reports optional-only routes as covered.
RUBRIC: makes the forget-case unrepresentable at BOOT (current correctness is discipline); bedrock = the throwing boot audit itself (already the ratified shape — this completes its honesty); blast = boot-time only, zero runtime behavior change; deletes the lying boolean; no prior rejection; no values/money/user-visible change; migration = mechanical decorator sweep, boot fails loudly if missed.
VERDICT: **APPROVE**.

## D3 — entitlement grant rows get an explicit kind (api-identity-money, F103)

PROPOSAL: CHECK is NAND while the comment claims XOR; both-null = lifetime, so a day-grant that loses grantedDays silently becomes immortal. Shape: explicit kind column ('lifetime'|'days'|'window'), CHECK per kind.
RUBRIC: unrepresentable — yes (the emptiest row can no longer be the most powerful); bedrock right; blast = MONEY-DATA MIGRATION on the ledger.
VERDICT: **ESCALATE** (data-lifetime + money semantics; recommend adopting with a verified backfill mapping).

## D4 — webhook idempotency key from vendor event id, never Date.now() (api-identity-money, F104)

PROPOSAL: synthetic `Date.now()` id makes every redelivery look new. Shape: idempotency key = vendor event id; if a path truly lacks one, content-hash of the canonical payload. RUBRIC: unrepresentable (dup application impossible, not unlikely); bedrock = the event store's identity, right level; blast = webhook ingest only; deletes the synthetic-id branch; no values change (idempotency is correctness, not policy); migration = none (new events only).
VERDICT: **APPROVE**.

## D5 — audience misconfig refuses loudly (api-identity-money, F106)

PROPOSAL: unconfigured-audience check silently skips validation while the SAME FILE states refusal-on-absence law for its dev token. Shape: unknown audience ⇒ throw at verification time (and boot-time check where statically known); simplify the 77-line parser.
RUBRIC: unrepresentable at the seam; bedrock right (config absence is an unknown, not a pass — the file's own law); blast = auth verification errors get louder, correct-config behavior unchanged; deletes parser sprawl + silent branch.
VERDICT: **APPROVE**.

## D6 — one home for gating mode + default entitlement code (api-identity-money, F107/F108)

PROPOSAL: mode and 'premium' default each declared in multiple places that can drift. Shape: single exported constant/config source; all sites import.
RUBRIC: drift unrepresentable; purely deduplicating (deletes copies); the VALUE stays exactly as-is (owner constant untouched — no values-boundary crossing).
VERDICT: **APPROVE** (values unchanged; only the duplication dies).

## D7 — teaser: mechanical dedup APPROVED; seeded priors ESCALATED (F109/F110)

Duplicated 9.9 clamp + cross-app option-id vocabulary get one shared home: **APPROVE**. Teaser seeded priors violate no-fake-estimates on their face, but the teaser is a user-visible product surface whose numbers the owner may have chosen deliberately: **ESCALATE** (recommend delete-or-ratify per the law).

## D8 — reward_photo grants for an undeclared source (F111)

Live ledger rows whose source the code no longer declares. Data archaeology + lifetime: **ESCALATE** (options: re-declare the source enum member as historical; or owner ruling on the rows).

## D9 — moderation verdict adopts the access-verdict sum type (F105)

Same defect access-verdict fixed (boolean forced fail-open). The PATTERN is ratified; the fail-posture flip on moderation's error path is user-visible: **ESCALATE** with strong recommendation to adopt fail-closed-with-named-indeterminate for write-path moderation, availability-wins for read surfaces — mirroring the ratified per-caller policy.

## D10 — delete dead addDays/findGrantByRef (F112) + legal date from one constant (F113)

F112: repo-wide reference hunt done by agent; **APPROVE** deletion. F113: displayed legal date derives from the single version constant already present — text untouched: **APPROVE** (content unchanged ⇒ no owner boundary).

## D11 — honest LLM metrics: delete the dead surface, count the real events (ext-int, F115+F116)

PROPOSAL: getMetrics/reset + invented priors (15 rpm/worker, 16 workers, stale 960 comment) have ZERO callers (hunt done); the live logPerformanceMetrics emits hard-coded 'Always ZERO!/100%!' greens while the same class catches real rate limits at :389.
RUBRIC: deleting a lying instrument + wiring counters the catch block already observes; ~110 lines deleted, nothing added but two increments; metrics are not money semantics; methodology law (every metric must be able to show RED) mandates it.
VERDICT: **APPROVE** (delete dead surface incl. priors; real counters into the surviving log line; re-verify zero-caller claim before deletion).

## D12 — vendor-cap poison gets a fixture spec + structural rot alert (ext-int, F118)

PROPOSAL: keep the string match (no structured vendor signal exists — verified); extract isVendorMonthlyCapError() with fixture-backed spec; alert when a 429 carries the monthly-quota metric shape while no poison is set.
RUBRIC: constraint — NO invented threshold constants (no "N consecutive"): the trigger must be structural (quota-metric-shaped 429 with poison unset ⇒ alert on first occurrence). Observability only; spend semantics untouched.
VERDICT: **APPROVE** with that constraint.

## D13 — pool denomination brand (ext-int, F119)

PROPOSAL: PoolWindow gains denomination; meter()/meterSpend() split by typed handle; wrong-currency metering becomes uncompilable.
RUBRIC: unrepresentable — yes, finishing the move spend-currency made one level up (its own header says the call-site-scan level already failed); values and behavior byte-identical; ~6 call sites, no data migration.
VERDICT: **APPROVE** (shape-only; any behavior delta = STOP and return).

## D14 — one spend gate, parameterised (ext-int, F120)

PROPOSAL: assertGeminiSpendOpen/assertPlacesSpendOpen are the same 40 lines twice; the file's own header records two-gates-for-one-budget as the defect class. One private assertSpendOpen(pool,{alertKind,noun}).
RUBRIC: deletes ~45 lines, zero behavior change (prove: existing gate specs pass unchanged); next dollar pool inherits the hardened gate by construction.
VERDICT: **APPROVE**.

## D15 — UNKNOWN_MODEL_RATES derived as table-max (ext-int, F121)

PROPOSAL: the fallback's stated invariant ('must over-meter') becomes structural: per-field max over GEMINI_RATES.
RUBRIC: derivation replacing a literal that happens to equal it today — exactly the numbers law's DERIVATION category; today's value identical (prove by spec asserting fallback ≥ every table row).
VERDICT: **APPROVE**.

## D16 — query timeout joins the caller profile (ext-int, F122)

PROPOSAL: 5 copy-pasted timeout ternaries → GeminiCallerProfile.timeoutMs, resolved centrally.
RUBRIC: closes a caller-must-remember seam into the table built for exactly this; values identical; ~30 lines deleted.
VERDICT: **APPROVE**.

## D17 — dead DI + zero-importer barrels deleted (ext-int, F123+F127)

RUBRIC: both hunts done (re-verify each with one repo-wide grep at implement time); the reddit barrel's one drift is on the error type whose whole point is distinguishability — a hand-listed barrel WILL drift again; deep imports are the live shape.
VERDICT: **APPROVE**.

## D18 — ESCALATIONS (ext-int): F114 zero-means-closed (recommend the 3-valued limit type: {ceiling, 0=closed, absent=inherit}, malformed refuses boot — but it changes what a configured 0 DOES, so spend behavior = owner); F117 dead Places retryOptions (wire it or delete it — either changes vendor-call behavior). F126 is an OPERATIONAL note, not code: the derived Gemini backstop is ~48h stale because CRONS_ENABLED=false killed the nightly spend-analytics refresh — the staleness alert will fire when crons return; resolves itself on the cron flip.

VERDICT: **ESCALATE F114, F117; note F126 to owner.**

## D19 — /ops page gets a cookie bootstrap (signals-ops, F200)

The owner console is unreachable by a browser (header-only guard, unreachable localStorage bootstrap — proven by executed Nest probe). Shape: HttpOnly+Secure+SameSite=Strict cookie set by a redirect that strips the secret from the URL; JSON routes and guard logic byte-unchanged; the query-string secret stays dead.
VERDICT: **APPROVE** (owner-only tooling; constraints in parentheses are binding).

## D20 — signals scope fragments + boot-declared act recording (F202+F203)

(a) The 14 hand-copied redirect-COALESCE sites become one fragment home with a mutation-capable lockdown spec (the events precedent, applied to the ledger's read side). (b) Act recording becomes boot-audited: user-act routes declare @RecordsSignal(kind) or @NoSignal(reason); undeclared ⇒ boot refuses (the paywall-coverage audit shape, agent's option b). Red-team note binding: declarations are a floor — reviewed like code.
VERDICT: **APPROVE** both.

## D21 — the ledger's clock and its silent crons (F204+F205)

utcInstantSql at the one skewed comparison + a single-column police spec; cron catches keep swallowing AND emit ops alerts (critical for partition maintenance); PLUS the un-foolable shape: a daily partition-existence assertion (covers a scheduler that died, not just a DDL that failed).
VERDICT: **APPROVE**.

## D22 — the dashboard says "—", demand reads refuse to under-count (F206+F207)

Sections return {ok,data}|{ok:false,reason}; renderer prints the honest dash (the in-file precedent, applied at runtime absence). Demand-read expansion fallbacks DELETED: a failed expansion throws; the collector call site chooses skip-this-cycle loudly (under-counted spend inputs were silently wrong).
VERDICT: **APPROVE**.

## D23 — throttler truth (F208+F209+F210+F211)

'default' tier gets an explicit entry equal to today's global values (ceilings readable at the route); dead metadata keys + SkipThrottle wrapper + unreachable premium tier deleted (hunts done, re-verify); stale numeric comments deleted, WHY prose kept; `|| 5` → `??` + boot validation (0 = closed), config stays the single declaration.
VERDICT: **APPROVE**.

## D24 — sybil sweep bounded on the act; one window constant (F212+F213)

All three fetchers honour the lookback, bounded on ENDORSEMENT recency (not registration — the agent's own red-team subtlety is binding: an old ring voting today must stay visible); per-poll N+1 collapses to one keyed fetch. UNIT_COST_WINDOW_DAYS exported and imported.
VERDICT: **APPROVE**. F214's four ideal verdicts accepted as recorded.

## D25 — the three enum types Phase C never dropped (F301)

A NEW forward migration (`drop_orphaned_demand_enums`) issuing the three drops with the
SNAKE_CASE identifiers that actually exist:
`DROP TYPE IF EXISTS "search_event_kind"; DROP TYPE IF EXISTS "demand_source_kind"; DROP TYPE IF EXISTS "demand_signal_kind";`
Safe by construction: an enum TYPE holds no rows, all three are referenced by zero columns
(pg_attribute count = 0 on a clean replay), by zero code, and by zero schema.prisma models —
and `prisma migrate diff` already lists them as drift to be removed. `demand_subject_kind`
is NOT included: it has 2 live columns. The dropping migration must NOT be a "fix" applied to
20260720030000_phase_c_purge — that file is applied history and is never edited.
THE DURABLE LESSON (worth more than the fix): `DROP TYPE IF EXISTS` with the wrong identifier
is a SILENT SUCCESS. Any hand-written drop of a Postgres object should be spelled with the
name Postgres knows, not the name Prisma's model layer knows — the two differ for every enum
in this repo (PascalCase model vs snake_case type).
VERDICT: **PROPOSED — owner ratification requested** (trivially safe, but it is a forward
migration against prod and this territory ships no schema changes unilaterally).

## D26 — photo_events.event_type: make schema.prisma tell the truth (F302)

The database has `PhotoEventType` (enum: impression | tap); schema.prisma says
`String @db.VarChar(16)`. The DB is RIGHT — the enum was a deliberate hardening in
20260710120000_photos_hardening ("typed photo events"). The fix is entirely in schema.prisma,
with NO migration and NO data change: declare the enum model and type the field to it, and add
the missing `photo` relation field so the real `photo_events_photo_id_fkey` (ON DELETE CASCADE,
from 20260710140000) becomes visible to Prisma. Two things this buys: the closed domain becomes
a TypeScript union instead of `string`, and `prisma migrate dev` stops proposing a DESTRUCTIVE
drop-and-recreate of the column on the events ledger.
This is the general remedy for drift class (3) in F304 — align the MODEL to the DB whenever
Prisma CAN express what the DB has. It is explicitly NOT the remedy for classes (1) and (2),
where Prisma cannot express the object and the migration corpus is the rightful owner.
VERDICT: **PROPOSED**.

## D25 — forward migration drops three orphaned enum types (api-migrations, F301)

The Phase C purge dropped PascalCase names that never existed; IF EXISTS made the misses silent. Proven: 0 column refs, 0 code refs, migrate diff flags them, non-data-bearing.
RUBRIC: no data lifetime, no money, deletion of provably-orphaned type objects; migration is additive-forward (applied history untouched).
VERDICT: **APPROVE** (orchestrator implements — two-line migration).

## D26 — schema.prisma matches the DB's photo_events enum (F302)

DB has enum PhotoEventType; schema says VarChar(16) — works by coercion but migrate dev would DESTRUCTIVELY recreate the column. Schema-only alignment, no data change, no generated migration.
RUBRIC: prevents a destructive future; byte-level DB truth is the source; photos module is a concurrent session's area — schema field mapping only, no behavior.
VERDICT: **APPROVE** (orchestrator implements; verify enum values from DB first).

## D18a — RESOLVED BY OWNER RULING + DERIVATION (2026-08-03)

Owner: derive ceilings from measured usage with the monthly upper bound = one city onboarding + typical steady collection. Implemented by the orchestrator: per-op ceilings derived from api_usage_ledger (45d incl. the 07-30/31 full-city burst) — per-minute = historical peak rounded to next 50 (autocomplete 500/452, placeDetails 400/392, textSearch 250/226); per-day = burst-day + steady-p95-day rounded to next thousand (12k/12k/8k). Service default for UNREGISTERED ops = 60/min (closed-vocabulary posture: works, but slow enough to surface and force an explicit entry). Zero = CLOSED registered scope, denied before Redis and before the emergency guard; malformed refuses boot. Mutation-capable spec (rate-limit-zero-closed.spec.ts) proves both.

## D27 — CI runs type-check before lint (places-enrichment, F351)

The repo's only DB-backed integration spec silently rotted (2 type errors invisible: yarn test excludes it, CI died at Lint first). Agent repaired the spec (12/12 green vs real PostGIS). Reorder = zero product impact.
VERDICT: **APPROVE** (orchestrator lands the ci.yml reorder).

## D28 — P2.2 premise correction recorded before build (F353)

The ruled design says class-(b) chains fail because expansion is location-biased; FALSE — the locationBias param is dead, expansion is global but CAP-TRUNCATED (60/run; 23 brands at/past cap, max 121) and brand-purity rejects branch-qualified displayNames. A metro test against knowingly-truncated location sets mints twins for real chains — the exact failure the design guards against. The P2.2 build must be completeness-aware (per-metro on-demand expansion, or cap-state tracked per brand).
VERDICT: **APPROVE** doc correction (orchestrator lands it in plans/data-audit-2026-08.md).

## D29 — money accounting truth, split (F350+F352)

APPROVED half: ONE definition of "consumed draw" across pool/ledger/campaign (meters agree with reality; docstrings stop asserting debits the code doesn't make); the secondary-expansion lane's ledger label becomes honest (it pays enterprise+atmosphere SKU — label must say so). Spend BEHAVIOR byte-unchanged.
ESCALATED half: whether secondary expansion becomes campaign-CAPTURED (that would gate/refuse expansion spend without a campaign — a policy change).
VERDICT: **APPROVE** accounting-truth half; **ESCALATE** capture half.

## D30 — mutation-capable specs for janitor + viewport cap (F370+F371)

Two suites proven green under inverted behavior. Rewrite so each can show RED (the mutation experiments become the fixtures).
VERDICT: **APPROVE**.

## D31 — starved-candidate exploration honors its own contract (F358)

Zero observations must mean maximal uncertainty (docstring: Infinity), not zero — executed proof showed a starved candidate ranked LAST. Fix to the documented contract.
VERDICT: **APPROVE** (behavior change is the documented intent).

## D1/D3/D7/D8/D9/D18b — LANDED (owner-ruled batch, 2026-08-03)

Verified by orchestrator: prod holds exactly 2 reward_photo rows (the migration's targets) and ZERO reward_referral rows — the referral line deletes nothing and merely retires vocabulary already dead in code since 2026-07-09; accepted. NEW ESCALATIONS: F129 (onboarding carousel renders fabricated economics — invented 35% regret rate, 4x claims, $N/mo waste; deleting removes designed onboarding steps: OWNER), F130 (teaser MIN_MENTIONS/MIN_RESULTS floors affect which rows users see, not displayed numbers — kept pending ruling), D1-residual (accessVerdict consults only the default code — multi-product question: OWNER).

## D19–D24 — LANDED (signals+ops, 2026-08-03), with one orchestrator revision

All six landed with proofs (cookie bootstrap holds no credential in the document; 53 act routes, 0 undeclared; partition assertion proven by live drop/rollback; expansion fallbacks deleted with the collector leaving the lane due). REVISION to D23 after checking prod: THROTTLER\_\* env values differ from config literals (3/20/120 vs 5/30/100), so a literal 'default' tier would divorce 4 routes from ops' env — 'default' now applies NO override and SAYS so (defers to the env-governed global; spec asserts it). The implementer's fetchHeavyDevices union bound (endorsement OR device recency) accepted — a pure endorsement bound would delete the K1 "votes or not" trigger. D19's unconditional Secure cookie accepted (localhost uses the header path; both deployed envs are https).

## D32 — places-enrichment batch verdicts (F354–F369)

APPROVED: F355 one truth for primary location; F356 queue unification IF it deletes more than it adds (stop-if-wrong applies); F357 adjudication cost bounded by EXISTING governed pools — no new constants (else stop and escalate); F360 trivia; F361 stale-named constant; F362 IP check via a real implementation; F363 one vocab home; F364 dead code deleted + the LIMIT 200 either derived/explained or removed; F365 janitor reads config, never raw env; F366 retry-lane size DERIVED from the measured backlog, capped by the already-ratified daily ceilings (no new spend authority); F368 impossible-case fallbacks deleted + the invented threshold derived or deleted; F369 the stored-never-read fact wired to the question it answers, or proven dead and deleted. ACCEPTED IDEAL: F359 places-catalog, F367 coordinator (reservation recorded).
ESCALATED (one combined owner question): F354+D29-capture — secondary expansion's spend posture: campaign-capture it and let failures throw into the queue's retry×3 (recommended: yes to both — silent truncation corrupts the substrate P2.2 reasons over), or keep it always-on/never-failing by design?

## D33 — api-core batch verdicts (F400–F423)

APPROVED, in this order: F407 the interceptor stops logging non-5xx at error (else the next fix meters 404s) THEN F400 ONE LoggerService — captureToSentry lives in the DI-bound class, the orphan is deleted, seam spec tests the real wiring (mutation-proven: a logged error MUST reach the mocked Sentry). F401 CRONS_ENABLED parses through env-flag.ts (canonical dialect; 'false' keeps meaning false — prod's current setting is unaffected and '0'/'no'/'off' stop lying). F402 the debug-routes gate reads the canonical app-env reader, case-folded (PROD/stage no longer defeat fail-closed). F405 dead config blocks deleted (~160 lines; re-verify zero readers each; JWT_SECRET config deleted — env-var removal is an ops note). F409/F418/F419 inert files deleted after re-verify (.eslintrc.json orphan, apps/api/.dockerignore never consulted, pnpm-lock.yaml stale pnpm truth in a yarn repo). F422 isOperational deleted — 22 always-true subclasses whose one effect was LEAKING internal messages to prod clients; redaction becomes unconditional. F411/F414 script containment becomes a lockdown (class header + spec, the rt-\* convention generalized). F417 wipe-city-derived gains the dryrun branch its gc sibling has. F403/F412/F413 trivia.
ESCALATION: none new — but the OPS NOTE for the owner: prod's CRONS_ENABLED=false spelling works today and keeps working; JWT_SECRET is a dead secret to remove from envs at leisure.
VERDICT: **APPROVE ALL** (orchestrator note: F400's fix makes Sentry receive real volume for the first time — watch quota after next deploy).

## D34 — content-processing verdicts (F450–F478)

APPROVED: D-A delete entityDetails N+1 (zero-blast, hunts done); D-B one honest-outcome law for workers (verdicts or THROW; delete buildNoopResult + archive catch-arm + dead retry block); D-C ONE supersedeAndActivate in the scope service, delete replay's dead pair + inline D7 copy, lockdown extended to the supersede LAW (RED-provable); D-D coverageGap clears DERIVED (overlapping fetch) + script fallback; D-E all eight env flags through the canonical reader + lockdown (the F401 precedent rules); D-F resolveTestLimit helper with prod refusal on all three levers; D-H delete the 333-line fabricated metrics factory; D-I the structurally-constant metrics pass (F458–F461 delete-or-correct); F453 exit-gated resolution; F457 'empty' is RED; F462 record at the chokepoint or delete; F464 typed exceptions; F465 delete; F471 drop-or-null never now(); F475 the English scope lists route to the ontology module or die; F476 fold-aware similarity; F477 dead surfaces deleted (re-verify each); F478 prose fixed. D-G archive identity derive-or-refuse APPROVED with the loud-counter constraint (drops counted at warn with reasons; the alternative — random ids duplicating spend — is strictly worse than refusing).
ESCALATED (owner K-classification pass, one batch): F467 explore weights; F468 keyword-gate thresholds (+ the config rename lands regardless — the name lies); F469 place-bias radii; F470 constant ledger (batchDelay, 0.72+LIMIT 200, STALE_HOURS 30, 2h reap, PUSHSHIFT_WINDOW_YEARS, 24h fallback). SCALE NOTES recorded for pass 2 (writeScores chunking, JS-side active filter, archive Map accumulation, heal round-trips) — real, not urgent, sized fixes.
VERDICT: approve all but the constants; Phase-3 dispatched.

## D35 — search+polls verdicts (F500–F595)

APPROVED: F510+F570+F571+F572+F541+F542 — the archived/redirect-leak class on the SIX peripheral read surfaces (coverage layer, favorites lane, viewed lane, resolver refetch, poll leaderboard, demand mass) all get the status predicate + one-hop redirect resolution the core paths already carry; F540 the voter-doc exclusion gets a coupling spec (writer stamps voterUserId ⟺ reader excludes it — one can't drift from the other); F512/F513/F514/F562/F574/F575/F576/F577 dead/vestigial deletions (re-verify each); F582 one tier table. F511 (the builder's dual-preview) APPROVED as the highest-value structural cleanup: the preview string must be DERIVED from the Sql (a preview that can drift from the query it describes is a second source of truth) OR a spec must assert equivalence; the two copy-pasted connection-condition arms collapse to one. ACCEPTED IDEAL: F515 (single-hop is correct given the one-hop-redirect writer invariant — but add the ASSERTION that the writer keeps chains flat, else this silently degrades), F545, F573, and the search magic-number set (each justified).
VERDICT: approve all; the six-surface leak fix is one coherent commit, the builder cleanup another. No new escalations — search constants are all classified.

## D36 — api-user-surfaces (Phase-2 review of F600–F698, 2026-08-03)

**APPROVED:**

- F600 DELETE `user_lists.item_count` (denorm measurably wrong on 26/64 lists, all overstated) — derive from `_count`. Rubric: makes drift unrepresentable (no second copy to desync); deletes more than it adds; bedrock = the rows ARE the count. Behavior change is the correction of a measured lie, not a product call. Migration: drop column; readers switch to `_count` in the same change.
- F690 the false `@NoSignal` on POST /home/lists/:id/save — the route must actually record `favorite_added` per copied item (route through UserListsService or record at the write). The decorator's claim becomes true, not re-worded. Plus: boot audit gains a truth check where feasible (see F645).
- F645 signal-audit exemption predicate — replace the `@AllowUnentitled` proxy with an explicit is-user-act predicate so the three escaped notification mutations come under the ledger requirement.
- F640/F641/F642 push queue — rederive delivery semantics honestly: either implement retry (attempts read, failed→retryable transition, `sending` reclaim) or delete the retry vocabulary and declare at-most-once; `parseExpoResponse` must reject the array shape (mutation-prove with Expo's documented batch-error payload). No always-green parsing.
- F692 curated-list read paths — same archived-leak law as D35: status filter + one-hop redirect at READ time on every serving path, mutation-proven.
- F602/F621/F661/F682 — ONE `resolveSaveableRestaurant` seam (redirect-resolve + type + status), all four surfaces call it; the share resolver's semantics are the reference.

**SEND BACK:** none. **ESCALATE:** none new.

## D37 — docs + repo-tooling (Phase-2 review of F700–F756, 2026-08-03)

**APPROVED:**

- F701 ratchet `no-bypass-search-runtime.allowlist` max_count 6→0 (live count IS 0; zero blast; the gate regains teeth — mutation-prove by planting one violation).
- F702 triage the delete-gate's 16 failures against live specs (the spec is truth where they conflict, e.g. `bookmarks`); then wire into CI or delete the gate — a gate run by nothing is the always-green disease inverted (always-red, equally unread).
- F703/F704/F705 fix-or-delete per the same rule: a gate is either wired and green-provable-red, or gone.
- F716 port the api-scripts containment lockdown (class headers + spec) to root `scripts/` — the proven shape, applied to the flat 57-file mix that hid F702.
- F709/F729/F752 [lodev] eradication — correct the 4 doc homes (dated correction notes, no deletions under plans/product/business), and classify/retire the 11 parsing scripts under the new containment headers (dead-scaffolding class, banking law already satisfied: the harness provably never existed in code).
- F742/F741/F744/F745 doc TRUTH corrections as dated appended notes (markets extermination, hard-paywall ruling, upvoteWeight 0.7, pooled-vs-sectioned) — corrections ONLY.
- F714 reextract-skill script path + F711 maestro UUID→regex (zero-blast, previously deferred by the agent — now approved).

**ESCALATED to owner:**

- F706/F707 visual-regression rail: baselines survive but the capture flow was deleted (commit 9f0d26a5a) — RESTORE the flow from 9f0d26a5a^ or RETIRE the rail (delete baselines + map-accept references). Recommendation: restore; the map is precious and the harness was the blessed regression gate. Cost: one revert-of-deletion, no runtime impact.
- F740 blueprint §11.8 vs business-model.md Stripe-web-rail contradiction, aggravated by blueprint's own "this file wins" precedence claim — owner must restate which sentence is current (memory says: web rail IS happening, 2026-08-01 ruling).

## D38 — mobile-app-core (Phase-2 review of F800–F899, 2026-08-03)

**APPROVED:**

- F800 delete the fabricated onboarding economics (regret rates, dollar redirects, "4x less time", tuned 0.37 calendar) — PRE-AUTHORIZED by the owner's teaser ruling ("the only numbers... typical restaurant-discard numbers; every other numeric claim should just be deleted"). The real-dish OnboardingTeaser is the correct shape and stays. Copy tightens to non-numeric claims wherever a number was invented.
- F803 eas.json EXPO_PUBLIC_API_URL gains /api/v1 (a fact-fix; every EAS build currently points at a 404 root).
- F804 ONE 401 seam in services/api.ts — expired session becomes an explicit signed-out state driving the auth surface; silent-anonymous becomes unrepresentable. Mutation-prove: a 401 in a spec must visibly transition state.
- F810 server-side onboarding completion failure must not swallow into local "completed" — persist the draft, surface honest failure, retry path; the username claim and answers survive. RED-prove with a failing server call.
- F807 delete the two dead metro aliases (banking law satisfied by the agent's dual-pass grep: no resolver.alias support wired at all).
- F830 fix the dying jest worker AND make the suite fail loudly on worker death (always-green disease in the instrument itself).
- F850/F851 samplers: missing native sampler must read as MISSING (never as 60fps); stop discarding worst stalls — the tail is the signal.
- F880 one singleton-surface store factory; collapse the six drifted copies; the twice-fixed close-races-open race gets fixed once, everywhere, with the race spec attached to the factory.
- F882 skeleton matches the shipped card (dead heart/share column removed; photo-strip geometry from the same constants as the gallery).
- F883 Mapbox style cache-buster becomes dev-only (`__DEV__`-gated).
- F823/F879/F899 instrument honesty: convert the named always-green probes to mutate-and-observe where a cheap mutation exists; otherwise record the RED recipe next to the probe.

**EXCLUDED from this Phase 3 (not rejected):** the dual-button Stripe paywall (waits on the API rail agent's endpoint shape); the tracksheet files carrying another session's uncommitted edits (src/tracksheet/_, services/teaser.ts, ios/TrackScrollKit/_) — not ours to touch this pass.

**ESCALATE:** none — F800's user-visible copy change rides the existing owner ruling.

## D39 — owner rulings batch (2026-08-03)

- **F467 explore weights → RULED: replace with measured-yield UCB** through the estimator registry — with an explicit pre-implementation gate: the implementer must first verify the registry IS the right abstraction for term selection (one estimator per term? per (term, territory)? outcome = new-evidence yield per search) and return to Phase 2 if a better shape emerges. The hand-weighted blend and its three proxy inputs are deleted on landing.
- **F582 evidence-tier order → RULED: exact name/alias ABOVE whole-phrase containment.** The extraction ladder changes to match search confidence; the pinned-exception spec tightens to full-order agreement with zero exceptions.
- **F706/F707 visual-regression rail → RULED: RETIRE COMPLETELY.** The map is locked in; the debugging era that justified the rail is over. Baseline PNGs, the capture-side script(s), and every reference are deleted; COVERAGE rows → DELETED.
- **F800 onboarding economics screen → RULED: OWNER EXCEPTION, KEEP AS-IS.** The only animated screen; kept deliberately for conversion. Exception is temporary and must be re-confirmed at any redesign. (D38 agent redirected mid-flight.)
- **Stripe web rail, phase 2 → RULED: wire the LANDING PAGE (hosted on Railway) end-to-end** — Clerk auth + checkout entry against POST /billing/checkout-session, so web payments work exactly like in-app. Ideal-shape mandate, not a patch.
- **Onboarding data foundation → RULED: answers are DURABLE personalization data.** Commissioned: a design pass for the initial-taste-profile substrate — onboarding answers stored as the seed profile; ongoing taste signals (searches, taps, saves) already flow through the signals ledger, which is the presumptive substrate for "what they're into"; the design must show how curated-for-you lists derive from both. Foundation now, UI later.

## D40 — personalization / taste-profile substrate (Phase-1 design, commissioned by D39, 2026-08-03)

**Scope: foundation only — how the data moves and is stored so "curated-for-you"
is later a config change, not an architecture. No UI/UX. No production code in
this pass.**

### 0. What is actually there today (verified, not assumed)

- **Onboarding answers already persist.** `users.onboarding_responses jsonb`,
  written by `UserService.updateOnboarding` (raw UPDATE) from
  `UpdateUserOnboardingDto.answers` (`@IsOptional @IsObject` — a free-form
  `Record<string, string|string[]|number>`, unvalidated beyond "is an object").
  Siblings: `onboarding_status`, `onboarding_completed_at`,
  `onboarding_version` (CLIENT-supplied int), `onboarding_selected_city`,
  `onboarding_preview_city`. Nulled on account deletion.
- **The answer KEYS are mobile step ids** (`STEP_IDS` in
  `apps/mobile/src/constants/onboarding.ts`: `cuisines`, `always-craving`,
  `contexts`, `dietary-needs`, `spice`, `budget`, `dining-frequency`,
  `dining-goals`, `decide-how`, `attribution`, `location`, `username`, …).
  `packages/shared/src/constants/onboarding-vocabulary.ts` shares the **option
  ids** across the wire — deliberately, after a rename silently broke the
  teaser — but it does **not** share the KEYS. The API re-spells one by hand:
  `extractCuisineOptionIds()` in `curated-list-builder.service.ts:849` reads
  `responses.cuisines`. That is the same drift class the vocabulary file was
  written to end, one level up.
- **Personalization already exists, in one recipe.**
  `CuratedListBuilderService.buildPersonalWeekly` (`your_weekly_tasting`)
  reads `onboarding_responses->'cuisines'` + `onboarding_selected_city`,
  bridges option ids to restaurant attributes via
  `ONBOARDING_CUISINE_ATTRIBUTE_NAMES`, and computes "untried" with bespoke
  ledger SQL (`engagedSubjectIds`, `kind IN ('favorite_added','entity_view')`)
  plus the user's list items. Output: `curated_lists` rows with
  `scope='personal'`, `ownerUserId`, weekly `rotationKey`; `HomeFeedService`
  already serves personal lists FIRST (`OR: [{scope:'global'},{ownerUserId}]`).
  **The serving surface is done. The substrate is what is missing.**
- **The behavioral record is the signals ledger** — `signals` (append-only,
  partitioned, immutable; kinds: `search`, `autocomplete_selection`,
  `entity_view`, `favorite_added`, `poll_vote`, `poll_comment`, `poll_created`,
  `viewport_dwell`, `on_demand_ask`), actor-keyed through `signal_actors`
  (userId or deviceKey), rolled up into `signal_demand_daily`
  (day × actor × place × subject × kind) by the watermarked rebuild, with
  `act-identity.ts` owning the ONE act-grain/echo-dedupe dialect and
  `@RecordsSignal` / `@NoSignal` refusing boot on an undeclared user-act route.
- **F810 is landed on the client side** (payload persisted + replayed, no
  completing-on-a-lie). This design says where the payload lands _durably_; it
  does not touch that lane.

### 1. Where onboarding answers live

**Ruling shape: the answers stay on the user, but stop being an untyped blob,
and gain a history.**

1. **A shared ANSWER-KEY vocabulary + decoder** (`packages/shared`), beside the
   existing option ids: `ONBOARDING_QUESTION_IDS` (the keys), a per-version
   `OnboardingAnswers` type, and `parseOnboardingAnswers(version, raw)`
   returning a typed, per-question result. Mobile derives `STEP_IDS` from it;
   the API reads answers **only** through the decoder. A renamed question is
   then a compile error on both sides instead of a silently empty list.
   Unknown keys are preserved verbatim on write (the user's testimony is never
   edited) and simply not typed; unknown option ids are dropped **at read**.
2. **Versioning is server-owned.** Today the client sends
   `onboardingVersion` and the server believes it. Store both:
   `answered_with_version` (what the client rendered) and
   `question_set_version` (the server's own `ONBOARDING_QUESTION_SET_VERSION`
   at write time). A mismatch becomes a visible fact instead of an assumption.
   Question-set changes are additive-with-a-new-version; old answers keep
   their version and the decoder keeps a branch per version. Deleting a
   question never rewrites stored answers.
3. **`user_onboarding_responses` — append-only history.**
   `(responseId, userId, answeredWithVersion, questionSetVersion, answers jsonb,
source 'completion'|'replay'|'edit', recordedAt)`, index `(userId,
recordedAt desc)`. `users.onboarding_responses` remains the **read-hot
   projection of the latest row**, written in the SAME transaction — one write
   path, the projection is never independently mutable. Why history: a later
   "edit your tastes" surface, a question-set migration, and any "why did this
   list appear" question all need the answers as they stood; a wholesale
   overwrite makes those unanswerable.
4. **City becomes a key, not a string.** Add `onboarding_city_place_id uuid`
   next to the display name. The builder's
   `cityByName.get(selectedCity.toLowerCase())` is a silent-zero join: a
   renamed/re-cased city produces no personal lists and no error.
5. **Rejected: putting answers in the signals ledger.** A declared preference is
   _state_, not an act; the ledger is act-grained, geo/subject-shaped,
   immutable and pseudonymous-actor-keyed. Forcing preferences in would either
   inflate demand mass (every act weighs 1) or require a kind excluded from
   every mass reader — a second dialect of the exact law `act-identity.ts`
   exists to state once. The completion route stays `@NoSignal('a declared
preference is state, not a place-shaped act')`.

### 2. The behavioral half: the ledger IS sufficient — no new pipeline

The owner's three inputs map exactly onto kinds that already flow, under
`@RecordsSignal` enforcement:

| owner's words                 | ledger fact                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| "what they searched recently" | `search` / `autocomplete_selection` + `occurred_at`              |
| "what they search most"       | `search` counts per subject (entity or normalized term)          |
| "what they tap on most"       | `entity_view` (written at `history.service.ts:68/135`)           |
| implicit intent               | `favorite_added`, `poll_vote`, `on_demand_ask`, `viewport_dwell` |

So: **no analytics pipeline, no clickstream table, no third-party SDK, no new
write path.** Two honest caveats, both stated as verification-owed rather than
asserted:

- **Curated-list item taps / list opens** must be confirmed to reach
  `entity_view` (they route through detail, which records history — verify
  before relying on it). If a surface is missing, the fix is the ledger's own
  law: the SAME kind with a `meta.surface='curated_list'` **qualifier judged at
  read**, never a new kind, never a parallel table.
- **There is no negative signal** (skip / dismiss / "not for me") and this
  design deliberately does not invent one. A preference model with no dislikes
  is honest; a fabricated implicit-negative is not.

### 3. Derivation: `user_taste_profile`, a derived read model

- **Source: `signal_demand_daily`, via the shared `dailyActsCteSql` builder** —
  never raw `signals`, and never a fourth SQL dialect. This is the entire
  lesson of `act-identity.ts`: echo exclusion, act grain and `kind`-in-the-grain
  are the law, and a builder cannot be half-adopted.
- **Grain:** `(actorId, subjectKind, subjectId|subjectText, kind, windowDays)
→ actCount, lastActAt`, plus a derived roll-up to the vocabularies the
  recipes speak (restaurant attribute / cuisine / food entity), so a recipe can
  join it without re-deriving anything.
- **Facts, not invented weights (no-fake-estimates law).** v1 stores COUNTS and
  RECENCY — measured facts. It does NOT store a blended "affinity score" built
  from hand-picked per-kind coefficients; that is exactly the shape D39 just
  deleted in F467. A consumer that needs an order declares its own rule in one
  place (e.g. recency-bucketed frequency), documents it, and any coefficient is
  either an explicit owner choice or measured yield.
- **Cadence:** rebuilt immediately after the demand-aggregate refresh, for
  actors touched since the watermark; full rebuild-from-empty must be cheap and
  supported (it is — the aggregate is the source). Never on the request path;
  the read is one indexed select. Rebuildable-from-scratch is the contract that
  makes it safe to change the derivation later.
- **Identity:** keyed by `actorId`, resolved to a user through
  `signal_actors.userId`. Anonymous device actors get a profile pre-auth and it
  follows the actor when the actor gains a userId — the ledger is never rekeyed.
- **Explicitly NOT** a second write path: nothing outside the builder writes it,
  and a wrong profile is fixed by rebuilding, never by patching.

### 4. Composition: curated-for-you

One composer, two declared inputs — no magic blend:

- **Seed (onboarding) is the cold-start prior**, used unconditionally until the
  behavioral profile crosses a declared evidence floor (N acts in the window).
- **Behavior ADDs, never silently overwrites.** It can introduce cuisines and
  dishes the answers never named (that is the "new and fresh" requirement) but
  it cannot delete a declared preference; a dietary need is a constraint, not a
  weight.
- **Each recipe declares its input** (`seed` | `behavior` | `both`) in
  `curated-lists.constants.ts`, so the list can be described honestly and a
  drift shows up as "this recipe built 0 lists for input X".
- **First consumer:** `your_weekly_tasting` — preferred cuisines become
  onboarding cuisines ∪ top behavioral cuisines, and `engagedSubjectIds`' bespoke
  SQL is replaced by a profile read (same facts, one dialect). After that, new
  recipes (`back_to_<cuisine>`, `more_like_<dish>`, `you_searched_this_a_lot`)
  are config over the profile — which is the whole point of this pass.
- **Serving is unchanged:** `curated_lists` personal rows + rotation key;
  `HomeFeedService` already puts them first.

### 5. What does NOT get built

No event/analytics pipeline; no clickstream or "user_activity" table; no
embeddings/ML ranker; no per-request personalization scoring; no implicit
negative capture; no preferences written into the signals ledger; no second
write path for the profile; no hand-tuned weights; no snapshotting of
names/scores into curated rows (the derived-read law already forbids it).

### 6. Migration path (each step independently shippable, nothing user-visible until 5)

1. Shared answer-key vocabulary + decoder + server-owned question-set version;
   DTO validates through the decoder. No data change (legacy rows decode as v1).
2. `user_onboarding_responses` history table; backfill one row per user from the
   current column (`source='backfill'`); completion writes both in one tx.
3. `onboarding_city_place_id`; one-time backfill by name match, **unmatched
   logged loudly and counted** (never silently skipped).
4. `user_taste_profile` + builder + specs, built DARK (nothing reads it).
5. `your_weekly_tasting` switches to the profile; `engagedSubjectIds` deleted.

### 7. Red team

- **Answer-key drift (live today).** `responses.cuisines` is a hand-respelled
  mobile step id. Rename → zero personal lists, no error, no test. Step 1 fixes
  it and the decoder must be the ONLY reader.
- **City name join (live today).** Same silent-zero class.
- **Client-declared version (live today).** The server stores whatever int
  arrives. Step 1 records the server's own version alongside.
- **Ambiguous write.** The current update REPLACES the whole document. A future
  edit screen sending a partial payload would erase unrelated answers. Law: the
  completion write is replace-whole-validated-document; any partial update gets
  its own explicitly-merging endpoint. Never a PATCH shaped like a PUT.
- **Anonymous completion loses the answers (live today).** `Onboarding.tsx`
  calls `completeOnboardingLocally` without queueing when `!isSignedIn`, and
  `decideOnboardingCompletionReplay` skips `not_signed_in` — so a waitlist /
  pre-auth completer's answers never land, even after they later sign in.
  Recommendation for the F810 lane (NOT implemented here): queue the payload
  regardless of auth state and let replay land it post-sign-in.
- **Always-green risk.** The personal builder "skips honestly" everywhere
  (no city match, no cuisines, too few candidates) and a drift simply yields
  `built=0` with nothing screaming. Requirement: the builder emits a COUNTED
  skip-reason breakdown, and the spec must be able to show RED (mutate the
  vocabulary → the count moves).
- **Recipe/vocabulary bridge.** `ONBOARDING_CUISINE_ATTRIBUTE_NAMES` maps option
  ids to mined attribute NAMES by string. A re-mined attribute vocabulary
  silently empties it — same class; the map needs a spec asserting every option
  id resolves to ≥1 live attribute in a live city, or fails loudly.
- **Privacy / data lifetime — OWNER ESCALATION (three items):**
  1. **The documented deletion story is not implemented.** The ledger is
     permanent by law and the severable part is the `signal_actors` mapping —
     but `AccountDeletionService` deletes notification/user devices, nulls
     `onboarding_responses`, and does **not** null or sever
     `signal_actors.user_id`. The pseudonymous link to every act survives
     account deletion. This is the substrate this design builds on, so it must
     be ruled on before step 4.
  2. **The derived profile is an inferred-preference record** (dietary needs,
     spice tolerance, budget band are arguably sensitive). It must be deleted or
     rebuilt-empty on account deletion, and `scripts/rig/scrub-staging-user-data.sql`
     must learn about BOTH new tables — deletion, scrub and this design have to
     agree on what "user data" means, as they were just made to agree once.
  3. **Horizon.** An unbounded behavioral window means a two-year-old search
     still shapes today's list. Owner ruling needed on the profile's window
     (a concrete number, owner-chosen — this design will not invent one) and on
     whether a user can view/reset their taste profile.
- **Cost:** none new. All reads are over existing Postgres tables; no LLM, no
  Places, no third-party calls. (Stated per the cost-truth law: both lines are
  zero here.)

## D41 — UCB explore selection, second pass (Phase-2 ruling on the gate stop, 2026-08-03)

The first Phase-3 attempt STOPPED correctly: the estimator registry has zero consumers, no durable side (in-memory state dies on every deploy against a weeks-scale half-life), and per-term grain never reaches n>=2 (one attempt per cycle, 2-of-25 explore floor, hundreds of candidates) — permanent Infinity ties, a ranker that ranks nothing. RULINGS:

1. **Durable seam: a first-class `estimator_state` table** — (estimatorName, subjectKey) PK, the registry's 4 floats + 2 timestamps as columns. The registry gains load-on-first-read / persist-on-observe. This IS the registry-wide pattern for every future estimator (the header's promised "durable side", finally real). NOT columns on attempt-history: that couples the pattern to one consumer's snapshot row.
2. **Grain: the class (engineName, entityType)** — accrues ~2 observations/cycle, measured dispersion in days, answers "does exploring this vocabulary class in this engine return documents". No per-term shrinkage now (EstimatorHierarchy is declared-unimplemented; building it for a first consumer is descending past usefulness — revisit when a second hierarchical consumer exists).
3. **Within-class candidate order: coverage rotation** — lastAttemptAt ASC, never-attempted first. This is a scan policy (explore = coverage of untried vocabulary), not a score claim; it reintroduces no weights.
4. **Outcome: resultCount** (documents returned per search) — the one honest per-term number at the chokepoint; per-term downstream yield is unattributable by construction (cross-term batch unioning) and shall not be fabricated.
5. **MIN_SELECTABLE_SCORE_BY_SLICE.explore (0.2, blend-denominated) dies with the blend** — replaced by the document-units bar already in the file's law: expected docs >= 1, the smallest honest count.
6. trend/localSpecialization/novelty die as ranking inputs; their raw inputs stay recorded diagnostics; EXPLORE_RECENT_ATTEMPT_DAYS deleted (two refs, both novelty).
   Migration note: the new table is additive — no shared-API P2022 risk, but the migrating session still rebuilds+restarts per the standing law. F467 stays open until this lands.

## D40 — Phase-2 verdict (2026-08-03)

**APPROVED for Phase 3 (non-escalated core):** the shared answer-KEY vocabulary + decoder (kills the hand-respelled `responses.cuisines` silent-zero); server-owned question-set version (client stops declaring its own); append-only `user_onboarding_responses` history with users-column-as-latest-projection in the same tx; `onboarding_city_place_id` (kills the name-match join); the `user_taste_profile` derived read model built from signal_demand_daily through dailyActsCteSql (counts + recency only — facts, no invented weights), rebuilt after the aggregate watermark pass; recipes declare their inputs; **and the anonymous-completer fix** (a pre-auth completer's answers must land after sign-in — the persisted outbox from F810 is the vehicle; `decideOnboardingCompletionReplay` stops skipping `not_signed_in`).

**ESCALATED to owner (3, from the design's red team):**

1. Account deletion never severs `signal_actors.user_id` — the documented severable-deletion story is unimplemented. User-data lifetime: owner call on implementing severance now.
2. The derived taste profile is an inferred-preference record (dietary/spice/budget) — must it join the deletion path + staging PII scrub? (Recommendation: yes, both.)
3. The behavioral horizon (how far back "what they're into" looks) is an owner-chosen number — the design refuses to invent it. Also: do users get to view/reset their taste profile?

## D40 — owner rulings on the three escalations (2026-08-03)

1. **Signals severance at account deletion: IMPLEMENT** (owner: "do whatever you think is best... disconnecting the deleted user from their data is anonymity"). Deletion severs signal_actors.user_id — the acts stay as anonymous demand evidence, the person is disconnected. This completes the documented severable-deletion story.
2. **Taste profile joins the deletion path AND the staging PII scrub** — the inferred-preference row dies with the account, and prod→staging copies never carry real users' inferred preferences.
3. **Taste profile is INTERNAL-ONLY** — no user-facing view/reset, managed automatically for every user. Build toward the ideal from the start; Spotify's algorithm system is the named target in abstraction and approach (derived read models over the one behavioral ledger, iterated recipes on top). The behavioral horizon question dissolves under the D40 shape (all history, recency recorded as facts); any future windowing is a recipe parameter, not a stored truth.

## D42 — mobile-nav-overlays (Phase-2 review of F900–F984, 2026-08-03)

**APPROVED:**

- F943+F944 delete routeSceneVisibilityPolicyRuntime (~300 lines constructed/threaded/disposed, zero method calls — re-verify grep before deleting) and with it the duplicated chromeSurfaceTarget formula.
- F968 delete BottomSheetWithFlashList.tsx (507-line dead second sheet with its own copy of the seven layer styles — the physics fork; re-verify every import resolves to the type module).
- F946 SEEDED_FORWARD_OPEN_SCENES becomes exhaustive-by-construction via the app-overlay-route-types.ts:354 pattern — omission is a compile error naming the key. Four documented incidents on one hand-list is the caller-must-remember disease in its purest form.
- F970 the null-subscribe authority: implement real subscription OR delete the selector shape so nothing wears the authority costume without the contract. Phase-3 decides from the three call sites' actual needs; stop-if-wrong applies.
- F901/F902 transition-engine arm window: implement the documented full-pending-set guard; amend must not resurrect landed inputs; seal from 'staged' must either arm correctly or bark loudly — a silent drop guaranteeing a 600ms watchdog degrade is the always-green disease in the reveal path.
- F977/F978 chrome-geometry bark: measure an INDEPENDENT quantity or delete the bark; resolve the fixedHeight nine-props-no-callers vestige.
- F980 generate the nine hand-written scene comparators from the satisfies pattern already proven in app-overlay-route-params-equality.ts — forgetting a field becomes unrepresentable.
- F945/F953/F962 finish the home retarget: 'home' joins the three top-level scene-set copies (ideally collapsed to ONE set), the three hardcoded 'polls' seats read DOCKED_SCENE_KEY, and ADDING_A_SCENE.md is corrected AFTER the code (doc-first would record the defect as intent).

**Defended as ideal (recorded, not touched):** scene-stack dispose, useArmedOutsideDismiss, overlay-chrome-metrics, sheetBodyScrollDefaults, bottomSheetSurfaceStyleUtils, page-body-contract, params-equality spec. The territory's near-total absence of swallowed errors is noted as the standard other territories get held to.

## D42-supplement — F943/F944 re-ruling after the Phase-3 stop (2026-08-03)

The Phase-3 agent correctly REFUSED the F943 deletion: the mapper's "zero method calls" grep was scoped to the switch controller; repo-wide the visibility-policy runtime has seven live callers in screens/Search runtime/shared. RE-RULING: (a) F943 narrows to deleting the switch-controller's own unused field/threading (:544, :1581-1590) — approved as a small cleanup; (b) F944's duplicated chromeSurfaceTarget formula is LIVE in both copies — the fix is ONE formula with two callers, not a deletion; approved for the next mobile pass, bundled with the mobile-search Phase 3 (same files' neighborhood).

## D43 — mobile-search (Phase-2 review of F1000–F1054, 2026-08-03)

**APPROVED:**

- F1040 freeze gate: the useMemo keyed on the session-lifetime bus samples once forever while a sibling publishes edges every commit — a live defect; subscribe properly (useSyncExternalStore or the bus's own subscription), spec RED against the stale sample.
- F1041 dismiss wedge: the 420ms watchdog logs-and-cannot-recover and its user-session path is gated off entirely — implement real recovery (an outer deadline that completes the dismissal) with the wedge reproduced in a spec.
- F1000/F1001 scheduler guards that cannot fail: make starvation override real or delete it (a constant-false override is a lie about fairness); the unreachable budget check dies.
- F1002 map-query-budget snapshot(): written-only — re-grep repo-wide including perf verbs (banking law), then delete the write path if truly unread.
- F1018 closing time: stop re-deriving from a display string against the device clock — the server computes it in the restaurant's timezone; serve and consume that truth. (Cross-timezone user = wrong "closes soon" today.)
- F1020 the one genuine subscription leak: disarm outside its own callback.
- F944 (re-ruled from D42): ONE chromeSurfaceTarget formula, two callers.
- F943-narrow: the switch-controller's unused field/threading dies.

**DEFERRED to pass 2 by design (the agent's own red-team, which I endorse):** the F1012 ceremonial-family collapse — load-bearing for the body-spec-effects law and hook order; goes cluster-by-cluster with the F1013 hook-order guard built FIRST, never as a sweep. Pass-2 reading debt: runtime/profile (73 files, zero read), 40/53 controllers, 186 UNREVIEWED rows.

## D44 — mobile-native (Phase-2 review of F1100–F1118, 2026-08-03)

**APPROVED:**

- F1100 restore a real iOS test lane: fix the scheme to reference an existing test target or create the minimal unit-test target; MapLodKit's swift test joins CI (it's 41 green tests in 17ms with no simulator — free signal, currently run by nothing).
- F1102 eas.json gains a staging profile (preview rehearses against STAGING per the deploy law, not prod); the baked prod host moves to a custom api domain before ship (api.craveapp.ai) — the Railway subdomain is unchangeable post-ship.
- F1108 fill PrivacyInfo.xcprivacy truthfully (location, photos, identifiers, crash data — enumerate from the actual SDK surface). Submission gate; zero runtime risk.
- F1107 add the photo-library usage string for the non-PHPicker path if one exists; verify first.
- F1105/F1106/F1109 config hygiene: scope ATS exceptions, drop Always-location if unused (verify against requests), drop armv7 (iOS 15.1 floor makes it dead).
- F1103 record ios/-is-authoritative in CRAVE.md + a guard: a comment/lockdown note in app.json that prebuild would DELETE the native surface (make the trap loud; the F803-class config drift gets a one-line agreement check where cheap).
- F1113 the reflection-reached bridge gets a comment at BOTH ends naming the NSClassFromString coupling (fragility made visible, not "fixed").

**ESCALATED to owner:**

- F1110 Android: delete-to-history (recommendation — an unbuildable 11k-line mirror of the owner-locked map controller is pure drift risk; restore from history when Android is actually funded) vs fund a build lane now.
- F1101 aps-environment: development while push runs — TestFlight/store push may be silently dead. Needs an instrumented check on a real TestFlight build (EAS credentials may mask it); owner should know before the next store submission.

**Defended ideal:** MapLodKit (F1115, four transferable properties named); the map controller untouched per lock.

## D45 — mobile-search pass-2 (Phase-2 review of F1055–F1073, 2026-08-03)

**APPROVED:**

- F1059 the `craveScore > 0` presence test is WRONG post-F758 (null is the unscored value; >0 also rejects a legitimate 0) — null-aware check, spec RED. Two disagreeing presence tests two lines apart become one.
- The identity-compare-against-fresh-allocator CLASS (F1052f, F1061, F1071c): fix all three with derived field-wise comparators — extend D42's shape-equality generator rather than hand-writing a fourth sibling.
- F1064 the fabricated no-op ports: make the port contract impossible to satisfy with a stub (required real handlers at construction) or delete the port indirection at those three sites — a dead button with no type error is the caller-must-remember disease.
- F1056/F1057 forceMiddleSnap: land the pair together (thread it through or delete it end-to-end; asymmetric sibling resolved the same way).
- F1058 unreachable L3-residue guards deleted; F1060 dead diagnostic barrels deleted (~120 lines, zero importers verified); F1063 FNV-1a of a compile-time constant becomes the constant.
- F1065 profile cache becomes the bounded LRU shape that exists one directory over (unbounded + never-invalidated is a slow leak wearing a cache's name).
- F1062 instrument honesty per the standard recipe (make RED possible or delete).
- The 21 still-dark rows — reconciler (supersede logic!) first — get READ as the first act of this Phase 3; findings before fixes there.

**DEFERRED (numbers corrected 2026-08-03 after the Phase-3 stop caught my transposition):** F1068/F1069 native scalar-surface stack (structurally-false readyForActivation, 1,244 lines) AND F1070/F1071c (map-instrumentation-adjacent notification tightening, needs a sim runtime check — the extra notifications may paper over a missing re-selection path) — all four go with the D44 native Phase-3 where the Swift side is read properly, never as a naked strip. F1072 triple-declared native wire shape — same lane.

**ESCALATED to owner:** F1055 — opening a profile hides the save sheet and captures its state for a restore that never happens (write-only ledger, zero readers). Product call: should the sheet come back when the profile closes, or is dismiss-forever the intent (then the capture machinery deletes)?

## D46 — mobile-assets (Phase-2+3, 2026-08-03)

Census verdict accepted (F1150–F1153): 1,222 generated files byte-identical to their generators (drift-clean), 9 live hand assets, 43 orphans. IMPLEMENTED directly (small, doubly-proven): the 41 dead-scheme pin sprites deleted (verified absent from BOTH the manifest and the static-import registry — the first delete attempt used a too-greedy glob that matched 101 live files and was caught+restored before commit, which is exactly why the census check exists); the two fake "fonts" (GitHub HTML pages, not TTFs) deleted. Both generators now rmSync their OUT dir first — the orphan class is unrepresentable; regeneration after the patch reproduces the live set exactly (the executed proof). splash.png size flag recorded as informational.

## D47 — api-scripts pass-2 (Phase-2 review of F1250–F1260, 2026-08-03)

**APPROVED for Phase 3:**

- F1250 the wipe's user-anchor set gains messages.shared_entity_id — AND the deeper fix: a schema-derived anchor SPEC (the anchor list generated/verified from the schema's entity-referencing columns, so a new user-surface column can't silently miss the law again). Proven RED with a GREEN control; this is the caller-must-remember disease inside a data-destruction tool.
- F1252 containment boundary = import closure: the lockdown spec extends to the 48 headerless files (pass-1 stopped exactly at the lockdown's reach — the boundary was the defect).
- F1254 validate-crave-score-fixtures routes through the advisory-locked coordinator (§12.6 sole authority); DB leg opt-in. COORDINATE: re-check against the concurrent public-crave-score edits before landing.
- F1255 the three rt-\* writers get requireNonProdDatabase() + try/finally residue cleanup; README corrected (a READ-ONLY banner over writers is a lie).
- F1256 seed-google-photos through the metered Places client (invisible billed calls are how the $118 lesson started).
- F1257 lazy system cache: script boot must not mint billed caches or start mutating background work — the named law joins stopCronsForScript as a family; implement the lazy-init the code's own comment already argues for.
- F1253 retire fix-integrity-defects.sql (spent one-off, 0/26 ids alive, argues for exterminated models) — banked as a finding, file deleted; README baseline corrected to the re-measured 5/1/2/29.
- F1259 delete gazetteer-names.ts (F414 ratified it long ago; nothing executed the ratification).
- F1260 hoist the linker decision to ONE imported predicate; the five stale replicas die.

**Landed in pass (accepted):** F1258 query-samples repoint.

## D48 — mobile review-debt ruling (Phase-2, 2026-08-03; prep tables above/below from the four triage batches)

**TRIVIAL-APPROVE, wholesale (28):** F814 F815 F836 F837 F841 F859 F860 · F900 F911 F929 F930 · F866 F867 F877 F878 F896 F893 · F935 F938 F950 F956 F963 F965 F969(b re-verify the 3 hits first) F972 F974 F982, plus F952 confirmed INCIDENTALLY-FIXED. Dead code with banked re-greps, prose corrections, unfailable-guard deletions.

**RE-BUCKETED from OWNER to APPROVED-as-defect-repair (the triagers conflated "user-visible" with "product choice"; these RESTORE documented intent):** F811 F831 F834 F838 · F914 F916 F917 F923 F924 F925 F926 F932 · F888 (all three: report-catch surfaces, tel: surfaces, reduce-motion fails TOWARD the accessible default) · F979 (silent Release failures route to captureHandledError) · F885 (discriminated prop so disabling blur cannot delete children) · F921 (k-fold duplicate polls query + socket rooms per page is WASTE, not a semantics change — fix it).

**APPROVED (needs-judgment set) under the established laws:** F805 F806 F812 F813 F817 F832 F833 F835 F839 F840 F842 F843 F853 F856 F857 F858 · F903 F904 F906 F907 F908 F909(delete the spread, keep the paragraph corrected) F910 F912 F913 F915(delete the disjunct — the law sentence is the ratified one) F931 F933 F934 F939 F942 F947 F948 F949+F964(merge) F951 F954 F955 F959 F960 F961(delete + fold into ADDING_A_SCENE.md) F971 F973(delete; the dim returns via git if ever wanted) F975 F976(document all; unify curves ONLY with a sim look) F981 · F861 F863(+F807 pairing) F864 F869 F871 F872 F873 F874 F875 F876 F884 F886 F887 F890 F892 F895 F898.

- F808 react-hooks plugin: approved STAGED — install with rules-of-hooks=error / exhaustive-deps=warn; a follow-up burns down warnings per directory.
- F894 token collapse + F891 ResultCardFrame: approved WITH a visual gate — land behind identical-pixel intent, verify in the sim before commit (highest-traffic surfaces).
- F958 (13 controllers → per-authority, ~1,400 lines): approved as a STAGED design under F1013's discipline — guard first, one controller cluster per pass, byte-identical composite outputs proven each step. NOT a sweep.
- Attribution-gated (ATTRIBUTE before fix, per the law): F922 (which reset mechanism is live), F1300 (which authority arm is intended), F927 (measure the 160ms/stageLimit before touching).

**GENUINELY OWNER (the short list that survives):** F801 (fabricated 25/12 defaults feed the SAME owner-excepted onboarding screen — recommend: extend the F800 exception explicitly); F881 (brand-accent scatter: recommend one token, same hex — zero visual change, but branding is yours); F905/F920 (unattributed transition timings: approved to INSTRUMENT now; value changes only after measurement); F928's standings truncation (`slice(0, rows.length || 4)` hides server standings — is that intended?); F983 REJECTED-as-proposed (inverting the MVCP transport default contradicts the expensively-learned CLAUDE.md law; per-list opt-outs remain the shape).

## D49 — runtime/shared wave-2 verdicts (Phase-2, 2026-08-03; findings F1308–F1349)

**APPROVED (queue behind the D48 lanes — same tree):** the trivial set (F1312 F1315 F1316 F1324 F1329 F1335 F1337 F1343 F1344); F1308+F1311 (the unobservable-state class: delete the value-discarded pairs AND their 35-file setter threading — mechanical, high-fanout win); F1313 (the F1070 recipe verbatim: real interval, flag-gated reporting that CAN fire); F1314 (banking re-grep then delete the 92-line zero-importer telemetry runtime); F1317+F1336 (ten dead params); F1319 F1320 F1333 F1334 F1341 (instrument honesty per the F1305 catalogue recipe); F1323 (render-time store reads gain subscriptions — the F1040 shape); F1326 (perf-verb ref teardown per the correct in-file pattern).
**ATTRIBUTION-GATED:** F1309 (the compile-false hydration conjunct — wiring it blind would flip pass/reject on live gates; instrument first, then rule); F1310 (sits on the recorded listPreparedRowsReady starvation path — fix WITH the F1040 subscription recipe and a spec that replays the starvation).
**OWNER/SIM:** F1338 (human-oracle visual surface — goes to the next sim session's list).
**LEDGERED:** F1349's structural census (~120 pure-re-export files, nine-level chains) attaches to the F1012 per-cluster continuation — it is the map for those clusters, not a new mandate.
**DEFENDED IDEAL:** F1332 [FITALL] joins F1307 as a reference case; F1345/F1346/F1347 recorded.

## D50-rulings record — owner batch (2026-08-03, verbatim intents)

- **F1055 save-sheet:** it is a FINISH-OR-CANCEL flow (Spotify save-to-playlist analogy) — "you should not be able to open a restaurant from that sheet." Implementation lane running: remove any profile-open path from the sheet; delete the write-only capture/restore machinery.
- **F928 standings:** show ALL rows; UI presentation for long lists comes later.
- **F1246 + F801 (onboarding NYC claim + feeder defaults):** DEFERRED WHOLESALE — "all of that onboarding stuff will be handled later." Rows → OWNER-DECISION (deferred to the onboarding redesign); the F800 keep-exception stands.
- **F881 brand accent:** fix — one token, same hex, everywhere.
- **F1110 Android:** DO NOT delete. Goal is full parity; owner's lean is a from-scratch rewrite ("probably tons of bloat from trying to figure out all the map stuff"); judgment delegated on rewrite-vs-repair; plan lane running (plans/android-parity.md, D52).
- **F1101 TestFlight push:** delegated — "you could figure that out"; investigation lane running.
- **F740 blueprint §11.8:** no longer parked; correct it; ideal-shape pass on the section later.
- **F113 legal docs:** FULL AUTHORITY granted to update privacy/terms per current practice (severance model, Stripe web rail); lane running.
- **F114 spend-config:** shape delegated — derive the ideal (fail-closed money law); lane running.
- **F303/F304/F305/F350/F372:** do the recorded recommendations; lane running.
- **F1120(a) XCTest app-host target:** SKIPPED per recommendation (MapLodKit lane suffices until native code needs a host).
- **F1203 RevenueCat:** EXECUTED inline — the map `premium:entl60198dffff` would have refused EVERY purchase (webhooks carry lookup keys); now `premium:premium` on all four env pairs + local .env, the empty 'crave Pro' entitlement archived (state: inactive), prod api+worker redeployed to pick up the env.

## D53 — navigation/runtime depth verdicts (Phase-2, 2026-08-03; findings F1350–F1399, independently verified)

**APPROVED (next mobile batch):** F1350 (the territory's one unbounded-lifetime hit: superseded scene-switches never fire the caller's continuation AND leak a Map entry per switch — keyed by a monotone counter instead of the closed OverlayKey vocabulary; fix = supersede fires the continuation with a superseded verdict + the map keys on the closed vocabulary, RED via a replayed supersede); F1371 (the frame-authority lane whose comparison is structurally null===null — no subscriber can ever wake: wire the real producer or delete the lane, banking re-grep decides); F1351 (22 ungated [pageswitch] console.logs across 8 files — one **DEV**-gated debug flag, default off); F1359 F1360 F1363 F1366 F1372 F1385 F1390 per their recorded prescriptions (all spot-verified).
**Process note adopted as law:** a "killed" agent's on-disk work is checked BEFORE relaunching fresh — the relaunch brief now always says verify-first (this pass nearly double-burned an ID range).

## D50-exec — F928 / F1055 / F881 executed (Phase-3, 2026-08-03)

The implementation lane for three of the D50 rulings above. Baseline at start:
`npx tsc --noEmit` clean for every file in scope, `yarn test` green. Nothing staged,
nothing committed.

- **F928 standings — SHOW ALL ROWS, landed.** `PollCandidateBars.tsx` settled an
  endorsement toggle against `result.leaderboard.slice(0, rows.length || 4)` — the
  fresh server standings clipped to whatever row count happened to be on screen, so a
  poll whose options grew, or whose first render was the 4-row default, silently lost
  its tail. The settle step is now a pure module, `overlays/panels/poll-standings-model.ts`
  (`settlePollStandings` = `leaderboard.map(toPollStanding)`, plus `toPollStanding` and
  `applyOptimisticEndorsement` lifted out of the same callback), because the .tsx can
  never enter the hermetic jest lane (`testMatch: **/*.spec.ts`, never .tsx) — the
  extraction is what makes the rule provable, and it matches the sibling
  `pollThreadModel` / `save-list-model` pattern already in that directory.
  MUTATION-PROVEN: `poll-standings-model.spec.ts` feeds a 10-entry leaderboard and
  asserts 10 render-data entries in order; restoring `slice(0, 4)` turns it RED (run,
  observed, reverted). 7 tests.
  **Nothing assumed 4.** The one remaining row limit is the feed card's
  `previewRows={3}` half-peek (PollsPanel.tsx:200) — a deliberate presentation choice
  made at the render site, tap-through to the full list; the detail page omits the prop
  and now renders every standing. No virtualization assumption exists: the bars are a
  plain `View` + `.map`, not a FlashList.

- **F1055 save-sheet — CASE B (triggered from OUTSIDE the sheet); dismissal is correct;
  deletion handed off.** Investigated: `SaveListPanel.tsx` has NO profile-open path.
  Its entire interactive surface is select-a-list-row, new-list, cancel, create,
  confirm-save — zero `openRestaurantProfile`, zero navigate. The profile opens that
  hide the sheet come from other surfaces (result cards, ListDetailPanel, map pins)
  while the sheet is up. Per the ruling's own branch, that makes dismiss-forever the
  RIGHT behavior — the finish-or-cancel flow ends when you leave it — so the
  unconditional hide at `profile-app-foreground-runtime.ts:39` STAYS, and there is no
  UI navigation to remove.
  The dead capture ledger is re-confirmed reader-free (`getPreviousForegroundUiRestoreState`
  still resolves to only its own definition, type member, and memo dep). Its deletion
  is NOT landed and NOT attempted: every file in the chain sits under
  `screens/Search/runtime/profile/`, which this lane is under a hard no-touch boundary
  for. Exact hand-off list recorded on the F1055 row. This is a boundary deferral, not
  a judgment change: the ledger should die.

- **F881 brand accent — ONE TOKEN, landed, zero visual change.** Census first
  (case-insensitive, including the rgba re-encodings and one form the original finding
  missed): **13 sites**, not four — FilterChip:18, SegmentedToggle:81,
  CardActionPillRow:28 (`rgba(255, 51, 104, 0.10)`), NotificationsPanel:234,
  PollCreationPanel:524 (0.08), PollDetailPanel ×5 (1447/1459/1635/1684 @0.12,
  1675 @0.06), **PollCandidateBars:39 `PRIMARY_RGB = { r: 255, g: 51, b: 104 }`** (a
  third encoding of the same color, feeding the whole graduated-tint ramp — the finding
  had not caught it), and a quality-color.ts comment asserting the hex.
  The token lives beside the existing tokens in `constants/theme.ts`: `colors.primary`
  (already there) plus `primaryRgb` and `primaryAlpha(α)`, both DERIVED from
  `colors.primary` by parsing the palette hex — so the alpha form is no longer a
  re-encoding that a palette change cannot reach. Every site imports it.
  THE PROOF: repo-wide `grep -riE 'ff3368|255, *51, *104'` over apps/mobile/src went
  13 hits → **2**, both of which are the source of truth itself (`color-palette.json`)
  and the token's own doc comment. Same hex, same alpha values, no other diff.

Evidence at close: `npx tsc --noEmit` reports zero errors in any file this lane touched
(three unrelated errors exist in concurrently-edited files — AuthProvider.tsx,
search-map.tsx, use-search-runtime-camera-intent-runtime.ts — none in scope, none
introduced here). `yarn test`: 71 suites / 600 tests green (the +7 are this lane's).
Nothing staged, nothing committed, no stash used.

## D52 — Android is a supported platform, reached by REWRITE (owner ruling 2026-08-03; F1110)

**Owner ruling (verbatim intent):** do NOT delete Android. The goal is **full parity
with iOS**. Owner's lean: start over completely — "probably tons of bloat from trying to
figure out all the map stuff" — with the rewrite-vs-repair judgment delegated.

**Judgment returned: the lean is correct, and the measurement is worse than the hunch.**
Against `e2654b211` (2026-06-17, Android's last commit): 148 iOS commits since;
`SearchMapRenderController.swift` grew 13,224 → 13,463 lines while **7,281 lines changed
(~55% rewritten in place)** — so the Java mirror is not "3.8k lines behind", it mirrors a
body that no longer exists. Of the 11 iOS map-controller `RCT_EXTERN` methods, the Java
module implements 6; **5 (45%) were never ported** (`setCandidateCatalog`,
`commitEnterStart`, `beginInteractionFadeOut`, `reset/flushNativeApplyAttribution`), and
2 Java-only methods (`configureLabelObservation`, `configureNativeLayerGroups`) name a
superseded iOS design. Two subsystems have **zero** Android counterpart and post-date the
freeze: MapLodKit (398 kernel lines + **41 tests**) and TrackScrollKit (1,480 lines,
7 JS call sites). Nothing in the 9,380-line module has ever been compiled by anything.

**Shape adopted (plans/android-parity.md):** stage 1 build lane + `MAPBOX_DOWNLOADS_TOKEN`

- Expo-54 prebuild + a CI `assembleDebug` — the first compile in the project's history;
  stage 2 delete the mirror **at that moment** (not before — it is the only existing
  reference while nothing compiles; not never — F1110's harm is two answers per grep), citing
  `e2654b211` in the commit; stage 3 RN-parity smoke with the map stubbed, which _measures_
  how much of the 194,525 shared TS lines is genuinely free instead of assuming it; stage 4
  map bring-up **kernel-first** (Kotlin `:maplodkit` + 41 translated JUnit tests as the parity
  oracle, then the already-written-but-never-compiled Kotlin arm of
  `patches/@rnmapbox+maps+10.3.1.patch`, then a gated SDK spike, then render); stage 5
  TrackScroll, preceded by extracting a tested pure kernel on iOS first.

**The map-saga methodology is a day-one precondition, not a retrofit:** instrument the
composite never intent; every metric must be provably RED-able; the human eye stays the
oracle for feel; the `apps/mobile/src/perf/` command bus gains ack + `read_state()` before
it is trusted on an unfinished platform; the 2026-08-01 build-trust laws port to Gradle/R8
(referenced marker, absolute paths, never chain verification with the build); and
`scripts/perf-scenario-parity-contracts.js` finally gets teeth in CI — unenforced parity is
exactly how the mirror rotted.

**NON-goals for v1** (recorded so they are not relitigated): Play Store submission, tablet/
foldable/landscape, pixel-identical visual parity (Android should feel native-correct, not
iOS-transplanted), Android push (couples to F1101), TrackScroll, and emulating iOS's
screen-edge gesture deferral (no Android analog — predictive back is the nearest correct
behavior).

**Biggest risk, with a spike defined:** Mapbox Maps Android SDK feature gaps vs the patched
iOS 10.3.1 surface are genuinely unknown, and a wrong guess is what a 4–6 month saga looks
like. Timeboxed spike gates the render architecture; deliverable is a per-behavior gap table
(`direct-equivalent / achievable-differently / expensive / not-possible`), every row backed
by a running emulator demo rather than documentation reading.

## D51 — Owner-ruled batch: legal truth, the web-rail correction, zero-means-closed, the migration gotchas, and the draw meter (2026-08-03)

Five owner rulings landed together. Recorded as one design because they share
one shape: **a statement that had stopped matching the thing it describes.**

**(1) F113 — the legal documents.** Both documents asserted two things that had
become FALSE: §7's "payments are processed through Apple App Store or Google
Play Store" (the Stripe web checkout rail shipped 2026-08-03), and a retention
clause reading "delete or anonymize your personal information within 30 days"
against an implementation that erases immediately and purges after a 30-day
grace. Read first, then written: account-deletion.service.ts (immediate logical
erasure — Clerk identity destroyed, grants revoked, usernames burned into
reserved_usernames, PERSON_DATA_RULES-driven eraser, `purgeDueAt` set),
deletion-purge.service.ts (the 4am hard purge that makes the grace period real
rather than a document), and the D40 severance model (acts survive as anonymous
demand evidence; data ABOUT the person dies). Both rails are now stated, no-card-
data-touches-us is stated, and deletion is described as severance-plus-grace.
Date bumped to August 3, 2026. **Scope correction:** the documents exist TWICE —
apps/site/src/pages/{privacy,terms}.html AND legal.controller.ts (the in-app
copy). Amending one would have produced two legal documents disagreeing about
how the user gets charged, so both were amended identically, and the controller's
header now says so.

**(2) F740 — blueprint §11.8.** Dated correction appended (never rewritten in
place): the parking rationale is superseded, the rail shipped, and the file's own
"this file wins" precedence clause does not outrank a LATER owner call. Section
flagged for the owner's future ideal-shape pass.

**(3) F114 — zero means closed.** Derivation below. `ceilingEnv` in
configuration.ts is the single three-valued declaration; the coordinator reads it
with `??` semantics and ANNOUNCES every closed scope at boot.

**(4) F303/F304/F305 — the migration gotchas.** These are historical applied
artifacts; no migration file is editable, so the deliverable was documentation
with a real reader. `apps/api/prisma/migrations/AUTHORING.md` holds the
parallel-worker guard, the full triaged drift inventory (the class-1 list a
`migrate dev` will try to DROP out of an unrelated migration), the signals
partition/CRONS_ENABLED coupling, and the same-timestamp tiebreak. CLAUDE.md's
migration line now points at it — one pointer in the always-loaded file, the
detail where it is needed.

**(5) F350 — the draw meter.** The remaining escalated half, implemented in the
recommendation's own shape. See below.

RUBRIC: unrepresentable? — YES for (3) and (5): a ceiling of 0 can no longer be
read as "unset", and a caller can no longer forget to meter the error path,
because announcing a draw is no longer the caller's job. bedrock? — a vendor draw
is ONE event and who is charged is a property of the draw; a limit is one of
{positive ceiling, 0 = closed, absent = inherit}; a legal document is a promise
about what the code does. blast-vs-invariant? — (5) touches money accounting at 3
adapter call sites + 1 campaign meter; behaviour changes ONLY on the transport-
error path, in the conservative direction. deletes-more? — yes: two `|| N`
literals, three post-hoc `recordDraw` calls, and two manual `draws.scarce`
increments are gone. user-visible/money/data-lifetime? — all three: legal text is
user-visible, (3)+(5) are money, (1) describes data lifetime. migration? — none.

VERDICT: APPROVE (owner-ruled).

### The F114 derivation, stated plainly

The question was whether `0` in a spend/limit setting means CLOSED or UNLIMITED.
The repo's own laws answer it without a new judgment call:

1. **Fail-closed is the only safe default for spend.** Every money guard here
   already chose it — `assertSpendOpen` refuses on an unconfirmable window rather
   than admitting against an unknown balance. If `0` meant UNLIMITED, the single
   most likely typo in a money setting would be the one that removes the ceiling.
   Under CLOSED, the same typo halts a vendor loudly. One direction's worst case
   is an unbounded bill; the other's is an outage you notice in minutes.
2. **A malformed money setting REFUSES rather than widens** (F365, and the same
   conclusion F106/F107/F108/F210 reached). So a negative or non-numeric ceiling
   must throw at boot, not fall back — a fallback is a silent widening wearing a
   default's clothes.
3. **"Unlimited" already has a spelling, and it is not `0`.** Omitting a
   per-operation entry inherits the service-wide ceiling; there is deliberately
   no way to spell "no ceiling at all" on a paid vendor call.

Therefore: a ceiling is three-valued — **positive = the ceiling, 0 = CLOSED,
absent = inherit** — and that is now DECLARED (`ceilingEnv`), not remembered. The
remaining risk after that ruling is the opposite one: a `0` that nobody meant is
indistinguishable from a `0` that someone did mean, and it fails silently in the
"why is Places dead?" direction. So the third piece is loudness — every closed
scope emits a warn at boot naming itself and saying what it does. 0 is legal,
never silent.

## D54 — overlays depth verdicts (Phase-2, 2026-08-03; findings F1450–F1499)

**APPROVED (next mobile batch, when the concurrent tracksheet refactor settles):** F1474 then F1473 in that order (write the missing edit-mode-session spec FIRST — it must go RED on the space-containing-id reorder loss — then fix the rejected join(' ') expression the core module already fixed); F1463 (the verbs model takes `kind` so favorites-undeletable is enforced at ONE home, not per-panel); F1453 (isActive leaves ignoreField — it IS render-read three ways and feeds scroll-restore; comparator includes it, spec pins the P3 gate; note the deeper lesson: ignoreField is an unaudited opt-out — a follow-up makes each ignoreField carry a WHY that a spec can check); F1465 (ONE chin-geometry home for the five sites/four numbers); F1475 (the F1371 shape: `if (sheetYValue)` on a non-optional SharedValue makes ~90 lines unreachable — banking re-grep then delete the dead JS spring lane or fix the gate if the lane is wanted; static-provable, no rig needed for the gate itself).
**Landed in-pass (accepted):** F1450 orphan contracts deleted; F1451 [COMMITDBG] behind the flag with the Profiler tree mounted only when on.
**Carried unnumbered to next pass:** the polls route-narrowing predicate triplication; the save-list-model spec filename hiding lists-display-order coverage (F1472 recorded).

## D55 — mandate additions (owner, 2026-08-03)

1. **NEW RED-TEAM TERRITORY: search-flow map movement.** The camera's return-to-origin is wrong across entry points (user lists, profile lists, homepage lists, poll-discussion comment spans): the law is "the map returns to the EXACT position where the search flow was triggered" — today the wrong position gets saved, returns land wrong, or the flow gets stuck. The whole search flow (all entry points) gets red-teamed against that law.
2. **Plan-archaeology is now a REQUIRED Phase-1 step:** every mapper studies the relevant plans/ evolution first — were the goals finished, were the abstractions ideal, what more-ideal primitives were never considered.
3. **PERFORMANCE joins the ideal-shape rubric as first-class** — an abstraction is not ideal if it is slow; judged everywhere, not as a separate pass.
4. Priority unchanged: whole-repo coverage + cohesion first; new territories join the queue, not jump it.
5. Access: exhaust the service-access skill/CLIs (ASC, RC, Stripe...) before declaring anything owner-only.
6. Reaffirmed: map/LOD core logic (pins/labels/dots, LOD) is hard-won and OFF the red-team table — cleanup of stragglers/contradictions only.

## D56 — return-to-origin camera rederivation (Phase-2 APPROVE, 2026-08-03; findings F1500–F1516)

**The defect in one sentence:** the origin foundation (OriginSnapshot) captures sheet state at the push-commit chokepoint but never carried a camera — so the camera return lives in FOUR uncoordinated lanes (search session slot keyed off committedBounds which is null-by-design for list entries; a profile savedCamera with first-write-wins microtask racing; a stale lastCameraStateRef the cd59e8a2 fix left live on the profile lane; a dismiss-time capture correct only by accident), unwinding opposite to the sheet.

**APPROVED (F1513): camera joins OriginSnapshot.** `camera: {center, zoom, padding|null} | null`, captured in the EXISTING captureRouteEntryOrigin seam (total, at push commit, before motion), sourced from ViewportBoundsService.getCamera() — with the arbiter's committed target winning when a programmatic intent is in flight (the user-perceived position at trigger IS the target being flown to). Restored beside the detent/scroll lanes through CameraIntentArbiter. The stack gives nesting; per-pop restore falls out; the profile ledger collapses in (padding kept); use-search-session-origin-camera-runtime DELETES; lastCameraStateRef dies. Owner-law answer to red-team (c): pans after trigger do NOT move the return target — "the exact position where the search flow was triggered" is the law verbatim.
**Constraints:** the camera field must never reach the degenerate home emission (assertDegenerateHomeEmission stays golden — spec required); the [CAMORIGIN-*] instrumentation (F1516's recipe) lands WITH the change so the next sim session verifies capture-timing on the real rig before a store build ships; performance clause: the origin runtime's per-publish re-read becomes edge-triggered (F1511).
**Also:** F1514 pins the two rnmapbox tsc errors as known-foreign; P4's comment-anchor half (return to the exact comment span) is recorded as the NEXT rung once the camera rung proves out — same seam, sheet axis.

## D57 — app-core pass-2 verdicts (Phase-2, 2026-08-03; findings F1550–F1562)

**APPROVED (next mobile batch):** F1550 (the 269-line searchStore: delete every zero-consumer verb/field AND the AsyncStorage persistence of the dead lane — first VERIFY what of the persisted shape is live, e.g. a tab preference, and keep exactly that; the duplicate history concept dies in favor of the server-backed one); F1551 (delete the two dead hook files the deleted guide recommended); F1553 (unreachable auth branch dies); F1557/F1558/F1560 (dead exports/aliases/residue with banking re-greps); F1552 RE-BUCKETED from owner to design — the ideal is not gating console: route info/warn/error through the crash-reporting breadcrumb seam (observability preserved) and gate CONSOLE emission to **DEV**; the toggle-path triple-info moves to the debug-flag pattern; F1554's unmount guard + stable-identity useAccess halves land now (the polling redesign half is rig-first).
**RIG-FIRST (recorded with recipes, not guessed):** F1554(c) F1555 F1556 F1561 — runtime-lifetime/perf claims for the next sim session.
**Executed inline by the orchestrator:** the configuration-readers census learned `requireCeiling(...)` is a reader — the D51 refactor had turned it RED on googlePlaces.\* (the census caught exactly what it exists to catch, one accessor generation late).

**D56 IMPLEMENTED (Phase-3, 2026-08-04).** Landed exactly as approved. `camera?: CameraSnapshot | null` on OriginSnapshot; captured in the `registerRouteEntryOriginCapturer` callback ONLY (push commit, before motion), sourced through a new module port (`route-entry-origin-camera-delegate.ts` ← `use-route-entry-origin-camera-port-runtime.ts`) whose pure resolver prefers `CameraIntentArbiter.getInFlightCameraTarget()` over `ViewportBoundsService.getCamera()` while a programmatic move is in flight; restored in the origin restorer beside the detent/scroll lanes, committed through the arbiter. DELETED: `use-search-session-origin-camera-runtime.ts` (whole), `ProfileTransitionState.savedCamera` + `ProfileTransitionSnapshotCapture.savedCamera` + the first-write-wins arm + `resolveProfileCameraSnapshot` + `prepareRestaurantProfileForTerminalSearchDismiss` (so `lastCameraStateRef` no longer feeds ANY origin; it survives only on forward focus-planning), and the dismiss-time lane's camera (`buildCurrentOriginSnapshot` pins `camera: null`). The per-publish bus subscription is not edge-triggered but GONE (F1511 exceeded). `[CAMORIGIN-capture|restore|pop]` shipped behind `CAMORIGIN_DEBUG_ENABLED`, default ON in `__DEV__`. PROOF: `apps/mobile/src/navigation/runtime/route-entry-origin-camera.spec.ts` — 14 specs against the real controller/delegates/algebra/arbiter, with four mutation proofs (revert the capture arm → 7 RED; attach a `cameraIntent` to the home emission → 2 RED + the golden assertion throws; let the dismiss lane read the port → 1 RED; make `camera` a richness axis → 1 RED). Baseline held: tsc 2 known-foreign rnmapbox errors (F1514), full suite green. STILL OPEN: F1509 (uncollapsed live-identity resolver — the sheet's axis) and P4's comment-anchor half, both unchanged by this rung.

## D45/F958 staging map — `runtime/controller`, per controller (phase-1 pass-3 evidence, 2026-08-04)

D48 approved F958 (13 controllers → per-authority, ~1,400 lines) as a **STAGED** design under
F1013's discipline: guard first, one cluster per pass, byte-identical composite outputs proven
each step. This is the implementation map that staging was waiting on — every PARTIAL row in
the directory read line-by-line at HEAD 24ec50977, with the target authority and the hazards
that must be carried or killed. Findings F1601–F1621. **Nothing was landed** (the tree was
under heavy concurrent churn); this table is the input to the work, not a record of it.

### The two collapse clusters

**Cluster A — the overlay relay** (15 files). A strictly linear fan-in ending at
`SheetHostSnapshot`. The measured cost of one field change through it: **6 allocations,
5 comparator runs, 5 fan-outs, 1 object read by React** (F1608).

| controller                   | collapses into                     | hazards to carry / kill                                                                                                                                                            |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| route-geometry-frame         | **RouteFrame authority**           | F1604 dedupe cannot fire (null-wrapper); alloc per event                                                                                                                           |
| route-motion-frame           | **RouteFrame authority**           | F1604 same                                                                                                                                                                         |
| route-sheet                  | **RouteFrame authority**           | F1604 same                                                                                                                                                                         |
| route-frame (**DEAD**)       | — **DELETE**                       | F1601 zero constructors; keep ONLY the snapshot type. Its derived comparator (the F1052f fix) is in unreachable code — do NOT preserve it, re-derive it at the surviving authority |
| route-visual                 | **RouteFrame authority**           | F1601 re-inlines the dead controller's derivation TWICE (:76-82, :152-158) — must become ONE resolver; F1608 allocates a throwaway intermediate per recompute                      |
| sheet-route-host-visual      | **SheetVisual authority**          | F1605 deep-compare arm unreachable; pure wrap that sheet-visual immediately unwraps                                                                                                |
| sheet-render-visibility      | **SheetPresence authority**        | none — honest object→bool projection, guard CAN show RED. Positive control: keep this comparator's shape                                                                           |
| sheet-presence               | **SheetPresence authority**        | F1603 (its output IS render-visual's), F1609 unnamed inline comparator                                                                                                             |
| sheet-render-visual          | — **DELETE**                       | F1603 identity projection of presence; guard provably cannot fire                                                                                                                  |
| sheet-visual                 | **SheetVisual authority**          | F1602 its authority is what actually feeds the VisualHost slot; F1605/F1608                                                                                                        |
| sheet-visual-host (**DEAD**) | — **DELETE**                       | F1602 zero constructors; the exported Authority type names a producer that does not exist. Fix the consumer's import (sheet-host-controller.ts:6) in the same step                 |
| sheet-panel-selection        | **ControlSelection authority**     | none — honest subset projection                                                                                                                                                    |
| sheet-policy-selection       | **ControlSelection authority**     | none — honest subset projection                                                                                                                                                    |
| sheet-interaction-selection  | **ControlSelection authority**     | none — honest subset projection                                                                                                                                                    |
| sheet-control-selection      | **ControlSelection authority**     | F1607 the interaction subscription drives a recompute that provably cannot publish — keep the freshness write, drop the publish machinery on that path                             |
| sheet-session-host           | **SheetHost authority**            | F1604 unfirable dedupe, F1609 unnamed comparator                                                                                                                                   |
| sheet-host                   | **SheetHost authority** (terminal) | F1606 fourth hand-written comparator (D45 said DERIVE it); its one deep arm re-runs a compare its producer already ran                                                             |

Target: **four authorities** (RouteFrame, SheetVisual/Presence, ControlSelection, SheetHost)
in place of fifteen hops, three files deleted outright before any collapse begins — F1601,
F1602 and F1603 are pure subtractions with no behavioural surface, so they are the correct
**stage 0** and their own proof.

**Cluster B — the root repackers** (18 export sites across 15 files). Not a relay: a family of
`(x: T): T => ({…every field…})` functions, each wrapped by its call site in a `useMemo` whose
dep array is a fourth hand-written copy of the same field list (F1610).

| controllers                                                                                                                                                                                                                                                                                                                                | collapses into                                                        | hazards                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| search-root-{primitives, state-foundation, foreground-input, control-authority, results-control, profile-control, profile-owner, data-plane ×3}, search-{freeze-gate, autocomplete, foreground-submit, foreground-transient}, search-suggestion-layout-visual, results-presentation-{owner :14-50, presentation-actions, close-transition} | **the call site's `useMemo` object literal** — delete the indirection | F1610. **Do not sweep blind**: the field list currently lives in 4 places, and the 4th (the dep array) is already WRONG once — F1611 |
| search-root-results-sheet-motion + -interaction                                                                                                                                                                                                                                                                                            | one `Pick<ResultsSheetInteractionModel, …>`                           | F1619 hand-copied subset type, six handlers repacked twice in a row                                                                  |
| search-suggestion-layout-state                                                                                                                                                                                                                                                                                                             | type the param as its contract                                        | F1620 one-directional coupling: removals go stale silently                                                                           |
| results-presentation-interaction, results-presentation-owner :52-119                                                                                                                                                                                                                                                                       | **KEEP**                                                              | genuine `Pick<>` narrowing — not members of this class                                                                               |

### Ordering, and the one thing that must not wait

1. **Stage 0 (pure subtraction, no behaviour):** delete route-frame, sheet-visual-host,
   sheet-render-visual (F1601–F1603). Byte-identical by construction — two have no callers at all.
2. **F1611 does NOT belong in this staging.** It is the pass's one real user-visible defect —
   a bearing/pitch-only camera intent never reaches the map — and it sits in the path D56 just
   rewired. ATTRIBUTE first (confirm in the sim that a bearing/pitch-only intent exists on a
   live path), then fix it on its own.
3. Cluster A stage 1–4, one authority per pass, F1608's allocation count as the before/after.
4. Cluster B last: it is the widest and the least risky, and doing it BEFORE F1611 would
   renumber the very dep arrays the attribution needs to read.
5. Independent of both: F1613+F1614 (derive the phase union from its order array) land as one
   edit; F1615/F1616 (profiler-hot-path allocation, the widened coordinator port) need a sim
   measurement first, per D55.6.

## D58 — repo-tooling residue verdicts (Phase-2, 2026-08-04; findings F1650–F1665)

**EXECUTED inline:** F1664 CI-red gate fixed (spec exclusion, RED-proven in-target); F1658 header truths.
**APPROVED:** F1650 in two steps — (1) the six deleted close-anchor labels return as accessibilityLabels on the LIVE controls (ToggleStrip has none at all — an a11y defect independent of testing; labels are the fix, not flow surgery), then (2) the 59-flow census re-runs and flows still dead get a retirement list per family (market-demand cluster judged AFTER labels exist). F1651 map-accept.sh RETIRED (both flows + all four probe families dead by named commits) + CLAUDE.md's recommendation of it corrected. F1653 the containment fence extends to maestro/\*_/_.sh. F1654 perf-baselines retired WITH the two referencing sites repointed in the same change (ci.yml:149, no-bypass allowlist) — never a dangling reference. F1656 the ten PRD-§4.1 fossils deleted; the 27 internal-only helpers stop leaking via export \* (explicit exports); F1657 the echo-test lie replaced by a REAL suite over the geo/antimeridian math both apps depend on (that math has zero tests today — always-green in its purest form). F1660 PR template deleted (first law: no PRs). F1665 COVERAGE dedup: 21 duplicate rows merged by script, disagreeing cells reconciled by git provenance, path becomes the key (the finale depends on it).

## D59 — native residue verdicts (Phase-2, 2026-08-04; findings F1700–F1710)

**F1700 RULED: DELETE the scalar-surface stack (~2,257 lines: 1,244 JS + 529 Swift + 452 Java + externs).** The evidence that settles it: its hit-target vocabulary is byte-identical to the SHIPPED, LIVE native hit-target stack in SearchOverlayChromeHost; the registry's own missingHooks names what the twin already does; 'activation' = a second implementation of shipped functionality, and active:false is a TYPE so activation is a public rewrite anyway. Zero user-visible change; two live per-render bridge crossings currently pay into a sink. Falls under the owner's standing remove-what-warrants-it grant. Queued to the next mobile batch WITH: the two orphan riders (F1708 pruning — moot if deleted with the stack's map; verify), and the parity-gate string-pins (the gate pins UIFrameSamplerBridge and the Java map source — any F1112 split or Android stage-2 must update the gate IN THE SAME SURFACE, F1702/F1703, now recorded in plans/android-parity.md's stage list).
**Also ruled:** F1704's corrected counts amend the parity plan (57 files / 11,684 lines; regenerate the 22 binaries before the stage-2 delete); F1707 held for a real ProMotion device per the attribution law (the sim cannot show the defect); F1709 small-safe queued; F1112 remains open, now with its third reflection site named and the architecture-proof pattern next door identified as the target shape.
**Defended:** TrackScrollKit at HEAD is clean (zero dead exports, everything mounted) — F1706; MapLodKit 41/41 again.

## D60 — controllers cluster B + D59 execution closed (2026-08-04)

**Controllers territory TERMINAL.** Cluster A (15 relay hops → 4 authorities, 24 files, commit 3965f285e) and Cluster B (all 18 repacker sites, 14 more controllers deleted, commits 76c7355a0 + b6d78d36f) both landed byte-identical under proven instruments. Durable guards: the 16-step composite transcript spec and repacker-dep-array-coverage.spec (comment-stripped parsing, self-checked factory population — watch that self-check if the factory count ever hits zero). F1666 (the upstream memo that GATED the F1611 hand-fix — the fix was coincidental until B0), F1668 (spread-with-filter: a destructure acting as a runtime filter that inlining would silently drop, tsc green throughout — explicit field literals are the law at those three sites), F1669 corrections recorded.
**D59 EXECUTED** (commit da628275f): scalar-surface stack gone (~2,160 real lines — F1700's count had included the live twin, kept), three RED-proven delete-gate checks, F1709 done, F1708 stands open (the rider lives in the KEPT hit-target registry).

## D61 — camera command lane rederivation: park-and-replay at the arbiter (APPROVED 2026-08-04; findings F1715, F1716)

**ORCHESTRATOR VERDICT: APPROVED as written.** Sequencing ruled: batch 1 = JS lane (arbiter park/replay/watchdog, fallback deletion, F1715 single-staging, specs 1-5); batch 2 = the patch repair + registry removal + nm symbol gate (same commit as pod install + build-trust recipe); rig recipe (spec 6) runs after batch 2 on a freshly built binary and must FIRST promote the defect-3 attribution from matches to proven via the nm check. The watchdog-noise red-team point is accepted as loud-by-design during the gap between batches.

**Bedrock obligation of the lane:** an intent, once committed by the arbiter, must eventually
execute on the composite or be superseded by a NEWER committed intent (or by the user's own
gesture). It must never silently vanish, and the lane must never report success it cannot
prove. Today the lane violates all three: reject → cancel-and-drop; native "resolve" means
"parked, maybe never applied"; the executor returns `true` synchronously before the promise
settles, so the arbiter runs its success-side writers even on the reject path.

### New evidence found during this design pass (changes the attribution picture)

Binary autopsy of the installed dev client
(`~/Library/Developer/Xcode/DerivedData/cravesearch-ebulueazabvxrcfekwsqmhnjeydn/Build/Products/Debug-iphonesimulator/cravesearch.app/cravesearch.debug.dylib`,
mtime Aug 4 00:13 — same day as the F1716 rig session):

1. **The native half of the rnmapbox camera patch is NOT in the binary.** `nm` shows ZERO
   symbols for `ProfilePresentationCameraHostRegistry`, `RNMBXCamera.hostKey`, or
   `onCameraAnimationComplete` (the only matching strings are the reflection literals
   compiled from the app's own ProfilePresentationTransactionExecutor.swift). The
   `rnmapbox_maps` pod IS compiled in (247 symbols) — from UNPATCHED native sources.
   Consequence (i): the native fallback's reflection lookup misses 100% of the time on this
   build — `camera_command_unavailable` is DETERMINISTIC here, not racy. That is exactly the
   reject the predecessor session captured live.
2. **The 10.3.1 re-port DROPPED the iOS `applyProfilePresentationCameraCommand` method.**
   `patches/@rnmapbox+maps+10.3.1.patch` adds
   `ios/RNMBX/ProfilePresentationCameraHostRegistry.swift`, which calls
   `host.applyProfilePresentationCameraCommand(stop)` — but the patch's RNMBXCamera.swift hunk
   never defines that method (the parked 10.2.9 patch did, at its line ~13005, with the
   completion-id dedupe). Grep of all of `node_modules/@rnmapbox/maps/ios` at HEAD confirms:
   one call site, zero definitions. So the current patched iOS pod CANNOT compile if the new
   registry file is actually added to the Pods project — which is presumably why it isn't in
   the binary (the new-file half of the patch never entered the pod build; a `pod install`
   that picked it up would turn the silent no-op into a build error). Android's Kotlin half
   kept its `applyProfilePresentationCameraCommand`; only iOS lost it in the re-port
   (consistent with the "wrong-baseline" trap recorded in the rnmapbox re-port memory).
3. **Corollary — every ANIMATED commit on this build strands by construction.** The ONLY
   caller of `handleProgrammaticCameraAnimationCompletion` outside specs is the
   `onCameraAnimationComplete` native event (search-root-map-presentation-controller-runtime.ts:50);
   the emitter for that event is part of the missing native patch half. No caller of
   `resolvePendingProgrammaticCameraAnimation` exists outside specs. So an `easeTo` commit
   with `deferControlledCameraStateUntilCompletion: true` (fitAll, resolve-fit-all-camera.ts:202;
   profile flyTo, profile-native-command-runtime.ts:49; scene motion targets,
   use-app-route-scene-camera-motion-target-runtime.ts:115) leaves the arbiter pending
   FOREVER — the deferred JS state sync never flushes — until a user gesture cancels it.
   The F1716 run-1 stranding (map settled at the profile fly-to region, four byte-correct
   [CAMCOMMIT]s, none landed as JS state) matches this shape precisely: the fly-to's
   completion never arrived, the restores' deferred/controlled state never reconciled.
   **Caveat, honestly stated:** which binary the rig sim actually had installed during run 1
   is unverified (the mtime and the live reject both corroborate, but the next rig session
   must confirm with `nm ... | grep -c onCameraAnimationComplete` against the installed app
   before this attribution is promoted from "matches" to "proven").

So the lane has THREE defects stacked: the arbiter's drop-on-reject (F1716's core), the
lying native-fallback contract (parked ≠ applied; sync-true-before-settle), and a broken
patch re-port that turned the fallback into a permanent corpse while also severing the
completion channel every deferred sync depends on.

### What is the single-shot design compensating for?

The transient hostlessness of the `MapboxGL.Camera` ref during scene switches: React
unmounts/remounts the camera component across profile push/pop and world switches, and a
commit issued in that window has no writer. The compensation was built TWICE, both BELOW the
arbiter: (1) the JS native-executor fallback (search-map-native-camera-executor.ts), and
(2) the native registry itself — which, read closely, ALREADY implements the ideal shape:
`dispatchCommand` parks `pendingCommandsByKey[hostKey]` and returns; `register` replays the
latest parked command; newest-wins by overwrite. The right mechanism exists, at the wrong
layer, behind a promise contract that cannot express it ("resolve" = parked-or-applied,
indistinguishable), invisible to the arbiter that owns supersession, and — after the re-port
— not even compiled in. The rederivation moves the park to the one place that already owns
intent lifecycle: **the arbiter**.

### Candidate evaluation

- **(b) retry with bounded backoff — REJECTED.** Retrying against a reflection miss that is
  permanent (patch unapplied) spins forever or gives up arbitrarily; retrying against a
  transient unmount is just a worse-timed version of (a) with sleep-guessing. Retry treats
  the symptom's schedule, not the obligation.
- **(c) guarantee a host always exists — REJECTED as primary.** Why doesn't one exist? Because
  the camera ref's lifecycle is owned by React scene switching — the map component genuinely
  unmounts across worlds. Guaranteeing mount ordering would couple the command lane into the
  scene-switch controller and the map host config (adjacent to the OFF-LIMITS map core), and
  it cannot fix the severed completion channel at all. The ref lifecycle is a fact; the lane
  must be correct UNDER it, not legislate it away.
- **(a) host-aware deferral at the arbiter — CHOSEN**, generalized: the arbiter owns a parked
  intent until it executes or is superseded (by a newer commit or a user gesture). This is
  the native registry's own proven shape, promoted to the layer that already owns
  supersession, gestures, completion, and the D56 in-flight target.

### Mechanism

**1. Arbiter park-and-replay (camera-intent-arbiter.ts).**
`commit()` calls `commandCameraViewport`; if it returns false (no writer executed), the
intent is PARKED (`parkedIntent: CameraIntent | null`, newest wins — a later commit replaces
it; the fallthrough writer block that today runs anyway is deleted, so controlled state is
no longer written for an unexecuted intent). New public
`notifyCameraWriterAvailable()` — called from a mount effect in the real map component that
owns `cameraRef` (a real component, so effects fire; NOT the scene body-spec hooks, per the
effects-don't-fire law) — re-commits the parked intent through the normal `commit()` path.
`setGestureActive(true)` CLEARS the park (the user's gesture is supersession).
`getInFlightCameraTarget()` returns the parked target while parked — a D56 origin captured
mid-park must capture where the map is GOING, same ruling as in-flight (F1513).

**2. The native fallback DIES.** `commandCameraViewport` keeps only the ref path and returns
an honest executed-or-not boolean. DELETED: `search-map-native-camera-executor.ts` (whole
file); the fallback branch + `latestNativeCameraExecutorRef` in
use-search-runtime-camera-intent-runtime.ts; `executeCameraCommand`,
`dispatchProfilePresentationCameraCommand`, the `camera_command_unavailable` reject and the
`cameraCommandExecutionAvailable` constant in ProfilePresentationTransactionExecutor.swift
(the sheet-command half of that file stays); `onCommandRejected` from the arbiter writer
contract. At the NEXT patch re-port: the host-registry halves of the rnmapbox patch
(iOS ProfilePresentationCameraHostRegistry.swift, the Android registry + apply method, the
`hostKey`/`nativeHostKey` prop plumbing) are removed — they are the second, now-redundant
parker. The completion-event half (`onCameraAnimationComplete`, `animationCompletionId`
through CameraUpdateItem) is KEPT and must be REPAIRED, because item 3 below depends on it
and it is not in the binary today.

**3. Completion honesty — a bounded watchdog in the arbiter.** A lane whose only settle
signal can silently not exist must not trust it blindly. On an animated commit, arm a timer
(injectable clock) for `animationDurationMs + slackMs`. On expiry with the completion still
pending: read the EXISTING observed viewport (ViewportBoundsService — read-only, no map-core
touch); if within epsilon of the target, resolve 'finished' (the composite is the oracle,
the event was merely lost); else re-commit the same intent ONCE; else fail LOUD — a
breadcrumb through the crash-reporting seam + `[CAMCOMMIT-path] surrendered` in __DEV__,
and resolve 'cancelled' so the deferred state sync is discarded rather than stranded and the
arbiter is free for the next intent. Never silent, never stuck, never fake-green: the
'finished' arm requires a composite match, not a timer alone.

**4. F1715 subsumed — one pop, one staging.** The reducer chokepoint
(applyTransitionPlanToRouteState 'closeActive'/'popToEntry' + the bare-pop paths in
app-route-scene-switch-controller.ts:848-861) becomes the ONLY stager; the three verb-time
stagings (app-overlay-route-command-runtime.ts:97,299,334) are DELETED. The verb-time layer
existed partly to stage while a live host might still be around — a timing compensation the
arbiter park makes unnecessary (a reducer-time commit that lands hostless simply parks).
Detent-ledger reads, scroll staging and camera commit all run exactly once per pop.

**Performance:** steady state adds one nullable field and one mount-effect notification;
per-commit adds one timer arm/disarm on animated commits only. It REMOVES a bridge
promise round-trip, the double staging per pop (F1715's duplicated ledger reads/writes),
and a dead reflection dispatch. Map core untouched.

### Files touched / deleted

- `apps/mobile/src/screens/Search/runtime/map/camera-intent-arbiter.ts` — park, replay,
  gesture-clears-park, watchdog, honest fallthrough (the biggest edit).
- `apps/mobile/src/screens/Search/hooks/use-search-runtime-camera-intent-runtime.ts` —
  fallback branch deleted; `[CAMCOMMIT-path]` gains `parked` / `replayed` / `surrendered` legs.
- `apps/mobile/src/screens/Search/components/search-map.tsx` (or the component that owns
  `cameraRef` mount) — the `notifyCameraWriterAvailable()` mount effect.
- `apps/mobile/src/screens/Search/runtime/map/search-map-native-camera-executor.ts` — DELETE.
- `apps/mobile/ios/cravesearch/ProfilePresentationTransactionExecutor.swift` — camera half
  DELETE (D44's documented reflection hatch #1 dies with it; the comment block updates).
- `apps/mobile/src/navigation/runtime/app-overlay-route-command-runtime.ts` — verb stagings
  DELETE (F1715).
- `patches/@rnmapbox+maps+10.3.1.patch` — separate, sequenced SECOND: repair the completion
  half (restore the emitter path the re-port lost), remove the registry/hostKey halves;
  `pod install` + the build-trust recipe + an `nm`-based symbol gate
  (`nm cravesearch.debug.dylib | grep -c onCameraAnimationComplete` must be > 0) so a
  future silent patch failure cannot recreate defect 3 invisibly.

### Mutation-proof plan (the racy stranding becomes deterministic)

The race is "commit lands while the ref is unmounted" — in a spec that is just a writer that
returns false. No timing needed.

1. **Stranding spec (goes RED under the reverted defect):** arbiter with
   `commandCameraViewport` returning false; commit an intent with
   `deferControlledCameraStateUntilCompletion`. Assert: no controlled-state writer ran,
   intent is parked, `getInFlightCameraTarget()` returns the parked target. Then flip the
   writer to a recorder and call `notifyCameraWriterAvailable()`. Assert: exactly the parked
   intent executes and state syncs. Reverting to cancel-and-drop makes both halves RED
   (intent vanished; state never syncs) — this is the F1716 stranding, deterministic.
2. **Supersession spec:** park A, commit B while still hostless, host arrives → only B
   executes, A never does. Gesture variant: park A, `setGestureActive(true)`, host arrives →
   nothing executes.
3. **Watchdog spec (fake clock):** animated commit, no completion event. (a) observed
   viewport at target → resolves 'finished', deferred state flushes; (b) observed viewport
   elsewhere → exactly one re-commit, then loud surrender, deferred sync discarded, arbiter
   accepts a fresh commit. Reverting the watchdog → RED (pending forever — defect 3).
4. **F1715 spec:** one `closeActive` pop through the real controller stages the origin
   restore exactly ONCE (count staging invocations). Restoring the unconditional reducer
   fallback alongside the verbs → RED with 2.
5. **Delete gate:** `camera_command_unavailable` and `executeCameraCommand` join the
   exterminated-pattern proof greps (spec-excluded per the F1664 fix).
6. **Rig verification recipe (next sim session):** symbol-gate the installed binary first;
   then the F1716 repro loop (profile push under in-flight fitAll → dismiss ×10) watching
   `[CAMCOMMIT-path]` — the `parked`→`replayed` pair must appear on at least one iteration
   (proving the hostless window is really hit and really healed), and the settled screenshot
   must match the committed target every iteration.

### Red-team of this proposal

- **Late replay = camera jerk?** A host returning seconds later could yank the map to a stale
  target. Mitigations already in the mechanism: user gesture clears the park; any newer
  commit replaces it. Residual: an old park replaying with no intervening gesture/commit —
  but that is exactly the obligation (the intent was never superseded, so it must land).
  If the rig shows a felt jerk, the remedy is an easing-mode floor on replays, not an expiry.
- **Two parkers = double execution.** If the native registry stays alive while the arbiter
  parks, a resurrected patch could replay a byte-stale command underneath the arbiter. That
  is why the registry halves must die in the SAME re-port that repairs the completion half —
  the two mechanisms are mutually exclusive, and the native one also has an unfixed stale-replay
  bug (its `pendingCommandsByKey` is never cleared after application, so EVERY re-register
  replays the last command forever — one more reason it loses).
- **Watchdog false-'finished':** epsilon comparison against observed viewport could pass on a
  coincidentally-close camera. Epsilon must be tight (center delta + zoom delta both small)
  and the spec's RED arm proves a wrong region does not pass. It reads the composite — this
  is the instrument-the-composite law, not a timer lie.
- **Watchdog noise while the patch is broken:** until the patch repair lands, EVERY animated
  commit will watchdog. That is loud-by-design (it names defect 3 on every occurrence) but
  argues for landing the patch repair in the same batch, and the symbol gate keeps it from
  silently regressing later.
- **`notifyCameraWriterAvailable` placement risk:** if the effect lands in a scene body-spec
  hook it is dead code (proven law). The spec cannot catch a wrong placement — the rig
  recipe's `replayed` leg is the instrument that can show RED there. Named explicitly so the
  implementer doesn't discover it the hard way.
- **Android:** the patch registry deletion must remove BOTH sides (Kotlin registry + apply +
  hostKey manager prop) or Android stops compiling; the parity plan's stage list gets the
  same string-pin note as F1702/F1703.
- **What this draft does NOT fix:** the D44 reflection hatch #2 (BottomSheetHostRegistryBridge)
  stays as ruled; F1717 (pins source delta) untouched; the F1715 detent/scroll lanes are
  de-duplicated but not redesigned.

### D61 EXECUTED (2026-08-04)

**Batch 1** (commit 42df7a3cd): arbiter park/replay/gesture-supersession/watchdog landed exactly
as designed; native fallback deleted end-to-end (JS executor file + plumbing, Swift camera half,
writer-contract `onCommandRejected`); F1715 one-pop-one-staging landed with ONE approved
inversion — the VERB is the single stager, not the reducer (the delegate records
staging-after-plan-resolution as a rig-proven RED wrong-detent pop; every pop path reaches the
controller through a verb). Six mutation reverts RED-proven; delete gate +3 checks RED-proven;
specs 1–5 of the mutation-proof plan done (F1721).
**Batch 2**: the rnmapbox 10.3.1 patch repaired by SUBTRACTION — registry/hostKey halves removed
on both platforms, completion half kept; the iOS compile break (the re-port's lost
`applyProfilePresentationCameraCommand`) healed because its only caller died. Wrong-baseline trap
root-caused to a stray untracked package-lock.json pinning 10.2.9 (removed); patch verified to
apply byte-exactly to pristine 10.3.1. BUILD SUCCEEDED (first green build since 2026-08-02),
fresh dylib carries the completion channel (99 symbols) and zero fallback/registry symbols;
`scripts/ios-camera-symbol-gate.sh` (local/opt-in, RED-proven against the pre-repair binary)
keeps that a checked fact. **Defect 3 PROVEN**: the binary installed on the rig sim during the
F1716 session fails the completion-symbol check — the stranding mechanism is a fact of that
binary, not an inference (F1722, F1723). Remaining: the rig loop (spec 6 — parked→replayed legs
on the fresh binary, now installed on the rig sim).

---

## D62 — P2 verdicts on the `mobile-nav-overlays` P1 pass (F2400–F2408, 2026-08-06)

Territory reviewed by a P1 agent: 123 UNREVIEWED rows, 35 read in full (24 IDEAL-VERIFIED,
11 PARTIAL), 88 not reached — the large surfaces (ListDetailPanel 2014L,
app-route-sheet-host-authority-controller 1999L, BottomSheetSceneStackHost 1874L) remain.
Territory map accepted: four genuinely layered tiers (exhaustive declarations →
token-keyed module registries → pure predicates extracted for the hermetic jest lane →
React shells). The agent's own check that CHANGED a verdict — expecting the edit-lock
refcount to be untested and finding `overlaySheetEditLockRuntime.spec.ts` covering the
double-acquire/first-release case — is the behaviour I want; no finding was filed and
none should have been.

**F2400 MVCP-as-declaration — APPROVED as proposed.** The ladder is right and the
red-team answer is the one that matters: 8 hand-copied `{ disabled: true }` literals with
zero specs, where `ADDING_A_SCENE.md` §7.4 states the rule *to the reader*, is the
definition of forgettable. Moving it to a required field on the scene declaration makes
omission a COMPILE error rather than a silent scroll bug, and it reuses the exact shape
`bodySurface` already proves works here. It deletes more than it adds (8 literals, 2
comments, a doc paragraph). Implement with the stated mutation: deleting the literal at
`BottomSheetSceneStackListBodySurface.tsx:255` must become a tsc error naming the scene.
Blocked on the concurrent mobile-search lane — sequence after it lands.

**F2403 prewarm coverage — SEND BACK. The finding is correct; the remedy is not good
enough.** I verified the vacuity independently: `isResidencyManagedScene` IS
`RESIDENCY_MANAGED_SCENES.includes` (shell-residency-registry.ts:55-56), the prewarm loop
iterates that same array, and `ensureShellResident` has no decline path — so `missing` is
empty by construction and the instrument cannot show RED today. But the docblock's defence
is partly fair: a future guard or async mount added to the mount path WOULD make it fire,
so this is a tripwire, not pure decoration, and deleting it loses that.
The better abstraction is the one CLAUDE.md already names: **instrument the composite, not
the intent.** `state.residentScenes` is intent — the loop just wrote it. The composite is
whether the scene's chrome actually rendered, and that signal already exists as
`recordSceneChromeAck` (scene-chrome-ack-runtime.ts). Re-point the assertion at the ack
set: a shell that is "resident" but never acked (threw, suspended, never committed) is
exactly the warm-before-navigate failure the law cares about, and it is REPRESENTABLE —
which is the whole test. Returns to P2 with that design, not with a deletion.

**F2401 announce-once latch — APPROVED, and it outranks F2400 for sequencing.** A retry
subscription that unsubscribes and never resubscribes is a live user-facing dead end, and
the spec named for the law is a filesystem source scanner (`grep -c 'renderHook'` → 0)
that pins the ban on retry buttons and nothing about the policy the ban rests on. That is
the catalogued shape — a spec whose subject is not the thing it is named for. Requires a
real `renderHook` spec that goes RED on the re-run-while-isError path.

**F2402 one seam, two failure policies — APPROVED.** Capture barks; restore is a silent
`if (origin != null)` no-op, under a comment declaring capture TOTAL. Either the guarantee
is total (then the restore branch is unreachable and should say so loudly) or it is not
(then the comment is false). Make the two halves agree; the swallowed failure is the one
the file calls rig-proven.

**F2404 `?? 'search'` fallback — APPROVED AS INSTRUMENTATION ONLY, explicitly NOT a fix.**
The agent did not prove reachability and said so; per CLAUDE.md (ATTRIBUTE before you
ideate) the correct next step is a bark plus a log on the fallback arm, then a decision
once real data says whether it is ever taken. Do not "fix" it by deleting the fallback —
that is guessing with a straight face.

**F2405/F2407/F2408 — APPROVED, low blast radius.** Contradictory `?.` beliefs about one
table in one 84-line file; a required `dataCount` nothing reads whose sole caller passes
literal `0` (work done for nobody); and `PREMOUNT_COMMIT_GRACE_MS = 48` whose attributing
sample is `__DEV__`-only while the violation path is Release-capable — that last one is a
no-fake-estimates violation and must be measured, never re-guessed.

**F2406 `no-unused-vars` at warning severity — APPROVED IN PRINCIPLE, ESCALATED ON SCOPE.**
Turning it to error (or adding `--max-warnings 0`) is right in the abstract — this audit
has now had TWO real defects whose only tell was an unused import. But apps/mobile
currently reports 223 warnings, and flipping severity turns that into a red build for
every concurrent lane at once. That is a sequencing decision with a cost, so it is the
owner's: options are (a) `--max-warnings 223` ratchet, lowered as lanes land; (b) error on
unused IMPORTS only, warning on other bindings; (c) fix all 223 first. Recommend (b) — it
targets the family that actually produced defects and is a same-day change.

**Not reached, and not to be mistaken for clean:** 88 rows in this territory, including
every large surface. They stay UNREVIEWED.

---

## D63 — P2 verdicts on the `docs`/`repo-root`/`repo-tooling` and `mobile-search` P1 passes (2026-08-06)

### docs / repo-root / repo-tooling (F2500–F2506)

160 rows, 33 read fully and argued, 127 machine-verified for every checkable reference but
not re-derived line by line and correctly left PARTIAL. That boundary is stated honestly
and I accept it.

**F2502 ownership gate — APPROVED AND ALREADY IMPLEMENTED (F2510).** Highest severity in
the pass: `enforcedSliceIds` declared five slices, CI ran one, and an unknown id returned
`pass: true` exit 0. I verified both halves by execution before acting, and ONE CLAUSE OF
THE REPORT WAS WRONG — the no-argument invocation exits 1, not 0. The unknown-id half was
real and is the dangerous one. Fixed at the source of truth: the rules data decides what
runs; an unenforced id is a misinvocation. Mutation-proven.

**F2500 README false claims — APPROVED.** Five falsehoods in the one file a new machine
follows verbatim, and the Node one is not cosmetic: `.lefthook/with-node-22.sh:38` exits 1
on any major other than 22, so following the README's `nvm install 18` breaks every
pre-commit hook. Fix the file.

**F2501/F2060 knip root blindness — APPROVED with the agent's own red-team.** Derive
workspaces from `git ls-files '*package.json'` and treat zero resolved as FAILURE — the
discovery shape `check-railway-manifests.mjs` already uses. `pngjs` required by two root
scripts and declared in no package.json (working only by hoisting) is a real latent break.
The `@commitlint/*` finding — installed, no config, no `commit-msg` hook — is dead weight
pretending to be a guard; delete or wire it, owner's preference.

**F2503 deploy.sh service allowlist — APPROVED.** `--env` got a `case` allowlist after an
incident and the argument beside it did not; the smoke then curls the API `/health`
regardless of which service shipped. Derive the allowlist from `git ls-files 'railway*.json'`
and smoke the service that actually shipped. Proof: `deploy.sh --env staging sitte` must
exit 1 BEFORE contacting Railway.

**F2504 doc-claim gate — APPROVED WITH THE AGENT'S OWN SCOPE LIMIT, which is the part that
makes it survivable.** 41 of 127 docs carry a reference that no longer resolves. Scoping
the gate to non-`plans/` is correct: a completed worklog naming files it deleted is
accurate HISTORY, not a false claim, and a gate that goes permanently red gets disabled —
the same reasoning that kept the migration guard narrow (F2163). The extractor is already
built and already bites, so this is known-buildable, not speculative.
ALSO: `plans/**` into `.prettierignore` — `page-switch-_.md` is a glob whose `*` prettier
turned into `_`, the F2160 corruption still live in that tree.

**F2505 lefthook dead block — APPROVED.** "no root ESLint config" is false and the config
is load-bearing (`apps/mobile/.eslintrc.js:2` extends it).

**F2506 shared export surface — APPROVED.** All 78 exports reach a consumer TODAY, enforced
by nothing. Fits the existing `node --test` lane with no new CI step. Must refuse to run
against `export *`, or it silently measures nothing.

### mobile-search (F2300–F2311)

200 rows / 32,658 lines; 19 files read fully, 181 left UNREVIEWED and said so. Correct
call — a padded pass here would be worse than a partial one.

**F2310 the `runtime/shared` verdict — APPROVED AS ANALYSIS, IMPLEMENTATION BLOCKED ON ITS
OWN NEXT ACTION, and this is the right instinct.** The bedrock statement is the best thing
in the pass: *the unit that buys render isolation is a subscription boundary, not a file* —
463 files where three shapes coexist (genuine boundary / pass-through rename / a "hook"
that is one type alias). The agent NAMED its unverified assumption: "dozens" is extrapolated
from a 40-file census. So the next action is to run the classification over all 463, not to
start deleting. F958/D45 already proved the mechanical collapse works here. Do not skip the
census; a 463-file refactor justified by a 40-file sample is exactly the fake estimate the
memory law forbids.

**F2300 debug panel wired to nothing — APPROVED.** 22 of 27 flags have zero readers and the
file instructs you to flip them; three of the five consumers its own comment credits do not
exist. This is actively misleading during a perf hunt — you flip a flag, see no change, and
conclude the wrong thing.

**F2302 two answers to "what did the user type" — APPROVED.** Diacritic-folding index-safe
highlighting in the suggestion list, plain `toLowerCase` first-occurrence in the result
card: type "cafe" and *Café con Leche* highlights in one place and not the other. One
question, one answer; the spec'd implementation is the survivor.

**F2305 comment-asserted numbers disproved by executing the arithmetic — APPROVED.** Three
wrong constants recorded as facts. No-fake-estimates: replace with the computed values or
delete the claim.

**F2304 five invariants in a hook nothing calls — APPROVED.** Zero call sites; the
behaviours now live as scattered imperative calls in 4 files. An invariant that became a
convention every new submit lane must remember.

**F2301 disableMarkers/disableBlur — ESCALATED, not approved.** Hardcoded `false` at the
only producer, threaded through 5 files, folded into two memo comparators with unsatisfiable
branches, and `disableBlur` is compared but never read to disable anything. But the map core
is owner-locked and precious (CLAUDE.md: do not touch unless changing the map). Owner's
call; recommendation is delete the dead threading and leave the map internals alone.

**F2306 SCREEN_HEIGHT frozen at module load in 6 places, zero `useWindowDimensions` in the
whole app — APPROVED as a FINDING, escalated as a FIX.** It is correct that a
module-load-frozen dimension is wrong on rotation/split-view. Whether this app supports
either is a product fact I will not assume. Owner: does the app support rotation or iPad
multitasking? If no, the right change is a comment saying so, not a refactor.

**F2303/F2307/F2308/F2309/F2311 — APPROVED, low blast radius.** Dead `else if` reassigning
its own initial values; two price scales sharing `[number, number]` so swapping them
compiles (make them distinct types); a bare `12` returned on degenerate input sharing digits
with a different-unit constant; a `[FAVDBG]` console.log printing during the test suite; and
four dead symbols plus a `CARD_GAP → SHARED_SECTION_GAP → SECTION_GAP` alias chain where
"SHARED" asserts a sharing that does not exist.

**What both passes got right and I want repeated:** each reported what is FINE and why —
`use-search-root-control-lane-collapse.spec.ts` hardened against this repo's own `[].every([])`
vacuity with the reason written down; `marker-lod.ts` routing pin and rank-pill through one
bucket function so they cannot drift; `.gitignore`'s negation carrying a MEASURED (0 → 1,227
errors) justification rather than a reasoned one. Saying what is right, with the argument, is
what makes IDEAL-VERIFIED mean anything.

---

## D64 — P2 verdicts on `api-external-integrations` (F2700–F2704, 2026-08-06)

**F2700 spend-meter loss on shutdown — VERIFIED BY ME, ESCALATED TO THE OWNER (money).**
Independently confirmed: `usage-ledger.service.ts:216` adds the ledger write to the
`pending` set that `onModuleDestroy` awaits, while the three spend meters at :266/:293/:351
are bare `void this.governance.pools.meterSpend(...)`, and neither `GovernanceService` nor
`PoolRegistry` has any shutdown hook. The asymmetry runs the dangerous way: after a script
exit or container stop the ACCOUNTING row is complete and the ADMISSION counter is short —
and the spend gates read the pool, not the ledger. Under-counted admission means the next
run is permitted to spend more than it should. `pool-registry.spec.ts` (731 lines) has no
shutdown case, so the suite is green in the lossy state.
The proposed remedy is the right shape and I would approve it on the abstraction test
alone: a `PoolRegistry`-owned drain over `durableWriteChains` means no call site can
forget, whereas adding three promises to `pending` is a convention a fourth call site
breaks. But the defect is money semantics, so the DECISION is the owner's, not mine.

**F2701 an owner choice with no expiry — ESCALATED, correctly framed.** Only Gemini's
catastrophe cap is re-derived from measurement and only Gemini alerts when the derivation
dies; Places and TomTom are env-seeded dials with no derivation, no staleness alert, no
headroom signal — while the repo's own text calls Places the non-converging vendor and
records it at 55% of a $565.80 month. The agent did not treat "unmeasured" as "wrong",
which is right: both are legitimate owner choices under no-fake-estimates. The gap it
names is real and sharper than a missing number — **an owner choice with no expiry**.
Recommendation stands: staleness + headroom alert now, derivation later.

**F2702 orphan-profile guard matched by a comment — APPROVED.** `includes()` against raw
source, so a comment mention keeps a dead profile alive: the same false-green the file's
own header says killed the previous scanner generation. Correctly reported as NOT currently
firing (all 16 keys have real call sites) — a latent guard defect, not a live one. Fix is
the same comment-stripping treatment already applied to the author-identity and
subject-text scanners (`scripts/scanner-source.ts`), so this is a third caller for an
abstraction that already exists rather than a new mechanism.

**F2703 prose drift — APPROVED, trivial.** A 15-line comment credits the embeddings spend
gate to `embedVendorOp`, whose body is one delegating call; the gate is real and better
placed in `GatedGeminiClient.embedContent`. Fix the comment, not the code.

**F2704 clean bill — ACCEPTED, and this is the model.** All four paid Places methods
enumerated (not counted) and gated; the spend-gate spec pre-empts its own vacuity by
asserting pool names; a denomination phantom type makes wrong-currency metering
non-compiling; magic numbers are each a fact, an owner choice, or a derivation. It also
names two things it checked and deliberately did NOT file, with reasons, including an
under-metering path that is unreachable today and the unverified vendor-pricing assumption
behind that judgement. Saying what is fine, with the argument and with the assumptions
named, is exactly what IDEAL-VERIFIED is supposed to mean.

**A correction I owe this lane.** It reported that its assigned counts did not match the
file (57 vs 13 for api-external-integrations) and recorded the discrepancy rather than
picking the flattering number. It was right to distrust the number and I was wrong to
embed one. Measured now: **45**, total **559** — and `COVERAGE.md` is dirty in the working
tree with 578 UNREVIEWED at HEAD against 567 in the tree, four of my own commits to it in
thirty minutes, and five lanes writing it concurrently. Every count I have put in a brief
was a snapshot that decayed before the agent read it. **Fix to the practice: briefs state
the territory, never the count; the agent measures at start and reports what it measured.**

---

## D65 — P2 verdicts on `mobile-app-core` / `mobile-native` (F2800–F2806) + a second IDEAL-VERIFIED spot-check (2026-08-06)

**Spot-check #2 — `apps/api/src/modules/identity/auth/native-apple-auth.service.ts` (135 lines,
read in full): the IDEAL-VERIFIED verdict HOLDS.** Stated with the argument, because a clean
bill without one is worth nothing. Every failure path narrows to `UnauthorizedException`
except a genuinely internal one (`Missing Clerk secret key` → 500, correct: that is our
misconfiguration, not the user's credential). `handleError` returns an already-thrown
`Error` unchanged, so the deliberate `status !== 'complete'` rejection is not re-wrapped
into a different meaning. `buildRequestBody` adds `code`, `identifier` and `user_data` only
when present, so Clerk is never sent empty strings that would read as a claim. The logs
carry `status`, `id` and Clerk's message — no token, no `identityToken`, no
`authorizationCode`. The one thing I would watch is that Clerk's error `message` is echoed
to the client verbatim; today that is a vendor string, and if it ever carries user input it
becomes a reflection surface. Not a defect, so not filed — recorded here so the next reader
does not have to re-derive it.

**F2800 three failure booleans nothing reads — APPROVED, and the proposal is better than a
fix.** `api.ts:424/434` set `isSessionLapse` and `isAccountDeleted`; nothing reads either,
while the comments setting them claim callers "stay quiet — not a generic failure modal on
top of it." The single enforcer at `App.tsx:78` filters `isEntitlementLapse` alone, so a 401
or `ACCOUNT_DELETED` mutation stacks a generic failure modal AND a Sentry event on top of
the sign-in takeover. This is the catalogued shape — a comment crediting a guarantee to an
enforcer that never runs — and the remedy is right: attach the already-computed
`ApiFailureAction` and export one `failureHasItsOwnStory` predicate, rather than a fourth
boolean a fifth call site can forget.

**F2804 CI's typecheck never sees specs — APPROVED, high value.** `tsconfig.json` excludes
`**/*.spec.ts(x)`, and the config that would cover them is reachable only via `yarn
tsc:specs`, whose only mention outside package.json is A COMMENT. Currently 8 errors hiding
behind that. Same family as F2143 (turbo resolving mobile's type-check to `<NONEXISTENT>`
and counting it a success) — the third instance this session of a check that reports on work
it never did. Wire `tsc:specs` into CI.

**F2803 the .gitignore negation names a file that is untracked AND inert — APPROVED.** Two of
three named `.d.ts` files are tracked; `test-globals.d.ts` is untracked, and an A/B `tsc`
run proves it is inert regardless — it augments the global `JSX` namespace while `jsx:
react-jsx` + React 19 resolve through `React.JSX`. Correct the comment to name what is
actually load-bearing; the F2142 measurement (0 → 1,227 errors) stands for the OTHER two.

**F2802 release-only guards that are silent in release — APPROVED.** `AuthProvider` states
F813's law ("a `console.warn` in the auth path is invisible in production") and then applies
it to 2 of 4 catches; both RELEASE-ONLY misconfiguration guards ("release build has no Clerk
key — fully UNAUTHENTICATED") are bare `console.error`, invisible in the only build where
they can fire, with `captureHandledError` imported thirty lines above. A guard that can only
fire where it cannot be heard.

**F2805 a recovery probe that cannot start against a live issue — APPROVED.**
`startBannerRecoveryProbe` establishes its timer only inside `useSystemStatusStore.subscribe`,
and zustand 5.0.8 (version verified, not assumed) does not fire at subscribe time — so it
cannot arm against an already-live issue, which is precisely the "banner stuck indefinitely"
state its own comment says it prevents. Arm-without-a-disarm's mirror image.

**F2801 / F2806 — APPROVED, low blast radius.** A `partialize`/`migrate` pair documented as
"derived from one list so they can never drift apart" where only `migrate` uses the list and
`partialize` hand-enumerates (and the same sentence miscounts three fields as four); and a
spec helper commented "the interceptor's dispatch, byte-for-byte in shape" that omits the
`account_deleted` branch whose store transition is then asserted nowhere.

**Accepted as the model, and I want it repeated:** `jest.config.js`'s F2140 — a guarantee
credited to `testMatch` while actually held by `moduleFileExtensions`, proven by probe, then
MOVED into the setting that means it. That is this whole audit's thesis executed in one file.

**Cross-territory fact, reported not claimed:** `tsc --noEmit -p apps/mobile/tsconfig.json`
is RED today (4 errors, all in another session's uncommitted `screens/Search` edits), so
`.gitignore`'s "0 errors" claim does not hold on this tree. Not this lane's to fix.

---

## D66 — P3 outcome, `mobile-search` (2026-08-06). A design I approved was WRONG.

**F2307 — MY APPROVED DESIGN WAS WRONG, and the P3 discipline caught it.** I approved
"make the two price scales distinct types so swapping them is a compile error." The agent
implemented it as designed, ran the mutation, and got **no tsc error** — every price level
1..4 is also a valid slider value 1..5, so a value-union brand does not separate the two
scales at all. It reported the first attempt as a CONFOUNDED PROOF rather than a pass, and
only then reached for a `unique symbol` brand per tuple, which does make the swap `TS2345`.
This is exactly the failure mode I have been demanding agents watch for, in my own verdict:
a design that sounds like it produces unrepresentability and does not. The lesson is not
"brand the types" — it is that **an approval is a hypothesis until a mutation proves the
guarantee**, and the P2 verdict should have named the mutation as the acceptance test rather
than assuming the shape implied it.

**F2304 — CORRECTLY STOPPED AND ESCALATED, per the design's own rule.** Restoring the
five-invariant hook as the single owner is not a P3: none of its 11 args are reachable at
the only plausible host (the control-stage runtime supplies 2 today), so it needs new
plumbing through the control-stage assembly — a layer-wide change. The imperative sites are
also WIDER than the finding recorded (8 `resetMapMoveFlag()` across 5 files, 5
`dismissTransientOverlays()` across 4), and one lives in another agent's territory. Stopping
here was right; improvising a partial owner would have produced a second half-owner, which
is the disease.

**Verified by me, not taken on trust.** The lane committed with `--no-verify` (the hook's
prettier flagged `audit/*.md` mid-run) so I re-ran the checks myself: `tsc --noEmit` clean,
`jest src/screens/Search` 40 suites / 272 tests green, no file outside its territory in any
of the three commits, and the ledgers carry no emphasis corruption (`prettier --write` on
FINDINGS.md and COVERAGE.md leaves both byte-identical, so `.prettierignore` is working —
the report was a timing artifact against my DESIGNS.md ignore commit).

**Accepted deletions, with the banking-law evidence given:** 21 debug fields + 10 `DEV_FLAGS`
entries + 3 dead thresholds (file has exactly two importers, every reference a static
dot-access, no dynamic reads); a duplicate highlight matcher and its orphaned types; three
identity-valued pin constants; three symbols whose declaration was their only repo
occurrence. `searchPerfDebug.disableSearchShortcuts` is now `TS2339` — before, it compiled
and did nothing, which is what made the panel actively misleading.

---

## D67 — P3 outcome, `docs`/`repo-tooling` (2026-08-06). The dependency gate audited NOTHING.

**F2501/F2060 — the finding UNDERSTATED the defect, and I verified the correction myself.**
The approved design said knip was blind to the ROOT workspace. It was blind to
*everything*: `npx knip --workspace 'apps/*' --workspace 'packages/*'` exits 0 with ZERO
output, because knip does not glob `--workspace`. Run on the identical tree,
`--workspace apps/mobile` prints pages of real findings. So the repo's only dependency gate
had been green-because-empty on every `package.json`/`yarn.lock` commit for months. This is
the session's theme at its widest: not a guard that is too weak, a guard that examined
nothing while reporting success. Proof accepted as given and re-run by me: a dead `left-pad`
root devDep makes the new command exit 1 naming it, and the OLD command exit 0 on the same
tree.
Deletions accepted with their reasoning: `pixelmatch` (referenced nowhere), and
`@commitlint/*` DELETED rather than wired — there is no config and no `commit-msg` hook, so
wiring it would newly block commits on a convention nothing has ever enforced. `pngjs` was
surviving only on pixelmatch's transitive edge, so the latent break was one `yarn remove`
away. Turning the gate on immediately exposed four unseen mobile defects, which is what a
gate that works looks like.

**F2504 scope widening — APPROVED, having re-measured it myself rather than accepting the
number.** The agent widened the exclusion list from `plans/` to 8 corpora and FLAGGED it
instead of burying it. I re-ran the D63-approved narrow scope: it reports **36** failures on
today's tree, not the 47 reported — a real discrepancy, most likely because the lane fixed
three genuine dead references in between. The conclusion is unchanged and the widening is
right: a large share of those failures live in `.claude/projects/.../memory/`, which is AGENT
MEMORY, not a repo recipe, and `business/`/`product/`/`PRD`/`BRD` are intent documents rather
than instructions to execute. The gate still covers 48 files, 104 yarn commands and 97 paths,
and it PRINTS its skip count on success so the exclusion cannot go silent. That last property
is what makes the widening safe rather than a quiet retreat — without it I would have sent
this back.

**F2503 deploy.sh — APPROVED, and the proof is the model.** Allowlist derived from
`git ls-files 'railway*.json'`; per-service smoke, with worker/site declared unsmokeable IN
CODE with the reason rather than silently curling the API's `/health`. The mutation proof
used a stub `railway` binary first on PATH that RECORDS ANY CONTACT: `--env staging sitte`
exits 1 with the stub never invoked, and against a copy with the allowlist excised
(grep-confirmed absent) it walks past validation and reaches Railway. That proves the guard
fires BEFORE the dangerous action, which a simple exit-code check would not. Nothing was
deployed.

**F2505 — accepted, including what it did NOT do.** The dead `root-lint` block is deleted and
its false premise recorded. The tsconfig `references` question and apps/site's missing `lint`
script were outside D63's approved scope and were deliberately left alone with a note. That
is the correct P3 behaviour; unrequested scope is how a rederivation turns into a rewrite.

**Bookkeeping, verified not trusted.** I applied the 12 blob shas the lane could not (COVERAGE
was dirty under a concurrent session) and CHECKED each against `git ls-files -s` rather than
pasting them: one was mis-transcribed — `ebd2b9925351` for deploy.sh where git says
`ebd2b992535b`. Corrected. 10 rows to REDERIVED; the 18 rows that went stale from concurrent
lane edits reverted to UNREVIEWED. `--check` exits 0; ledger gate passes at 966 rows.

---

## D68 — P3 outcome, `mobile-nav-overlays` (2026-08-06). BOTH blocked designs were MINE.

Six items landed (F2401, F2402, F2404, F2405, F2407, F2408), jest 125 suites / 1308 tests,
tsc clean. The two that did not land are the two I am responsible for, and both were refuted
by execution after I approved them from a grep.

**F2403 — MY SEND-BACK WAS WRONG, and I could have known in thirty seconds.** In D62 I
rejected the agent's remedy and substituted "point the assertion at `recordSceneChromeAck`,
the composite." I verified the vacuity claim carefully and then proposed the replacement
having only grepped for the SYMBOL. Reading the file: `let chromeAckSceneKey: OverlayKey |
null = null` — a SINGLE SLOT with two writers, and a TRANSITION-time offer, not a residency
set. There is no ack set to assert over. An ack-keyed coverage assertion at idle would bark
for every prewarmed-but-never-visited scene: a permanent FALSE RED, which is worse than the
tautological green it replaced. The agent measured that and BLOCKED rather than building it.
The rule I broke is the one I keep enforcing on others: *a better abstraction I have not
verified is just a different guess.* A send-back must carry the same evidence standard as a
finding. F2403 returns to P2 needing a per-shell commit signal that does not exist yet.

**F2400 — I APPROVED A DESIGN CITING A PRECEDENT THAT HAD BEEN DELETED.** My D62 verdict
said the fix "reuses the exact shape `bodySurface: 'white'` already proves works here."
`rg bodySurface apps/mobile/src` returns nothing but an unrelated `bodySurfaceKind` local —
F1389 deleted that field from the very file where the new one would go, and left a comment
eight lines above the insertion point saying so. **I credited a guarantee to an enforcer that
no longer exists, in a verdict on findings about exactly that defect.** Two further measured
blockers I never checked: `maintainVisibleContentPosition` is an OPTIONAL FlashList prop, so
no declaration change can make deleting it inside a component body a tsc error — the mutation
I demanded as the acceptance test is unachievable; and 4 of the 8 literals are not
hand-copies at all, since F983 already hoisted them as the house default at the two transport
merge sites. The agent's re-derivation — build on `bottomSheetWithFlashListContract.ts`, which
is bedrock for every sheet-hosted list INCLUDING search (`SheetSceneKey` excludes `'search'`,
so a foundation-row field could never have reached the search surface) — is better than mine
and is the design that should come back to P2.
It also caught a stale line in CLAUDE.md: "append/chat lists (poll detail thread) should KEEP
MVCP" is false — that thread disables it deliberately today. I repeated that claim in the
brief without checking it.

**F2402 — the agent corrected the finding's BEDROCK, which is the best kind of pushback.**
Capture is total for PUSHED entries only; the root entry's null origin is legitimate. So the
nullable arm was SPLIT rather than deleted, and the three call sites tsc named now each state
why they decline to stage. Deleting the arm — which "make the two halves agree" could easily
have been read to mean — would have broken the root entry.

**F2408 — the no-fake-estimates outcome I wanted.** Both populations now ride ONE
Release-capable sink and both timestamps moved from `Date.now()` to monotonic
`performance.now()`; `PREMOUNT_COMMIT_GRACE_MS` STAYS 48 and undated, with the close procedure
written down. Making the number measurable without inventing a new one is the correct answer.

**Concurrency note, mine to own.** My D67 commit `9c4fbbf3c` used an explicit pathspec on
`audit/COVERAGE.md`, which takes the WORKING-TREE version — so it swept this lane's staged
edits to that file into my commit. Nothing was lost (all 8 markers verified present on main),
but pathspec-on-commit protects against staging the wrong files, NOT against absorbing
another lane's working-tree changes to a file I am legitimately committing. That is a
different hazard and I had not distinguished them.

---

## D69 — F2400 final disposal (2026-08-06): the design was already implemented, by a pass nobody in the D62/D68 debate had read

**Ruling: F2400 is MOOT as proposed — F983's Phase-3 fix (2026-08-05) already implemented
the structural inversion it asked for.** Verified in the live tree, not from the ledger:
`{ maintainVisibleContentPosition: { disabled: true } }` is the BASE literal at all four
transport merge sites (BottomSheetSceneStackListBodySurface.tsx:259,281 and
SearchMountedSceneBody.tsx:845,876), spread BEFORE scene props, so the transport owns the
default and a scene must explicitly opt IN. The failure mode F2400 targeted — a re-sortable
feed forgetting to opt out — is already unrepresentable at the transport layer. Neither my
D62 approval nor the D68 refutation debate cited F983's implementation; we argued about a
design whose core had shipped the day before. The ledger records everything and protects
nobody who does not re-read it.

**A false phantom of my own, caught before it became a finding.** Ruling on this, I ran
`git ls-files | grep bottomSheetWithFlashListContract` and got nothing — from a cwd that had
drifted to `apps/api`, where `git ls-files` only lists that subtree. For several minutes the
P3 agent's proposed bedrock looked like a cited-but-deleted file, i.e. the exact defect I
confessed to in D68. It exists (`apps/mobile/src/overlays/bottomSheetWithFlashListContract.ts`,
185 lines, read in full: the live shared prop vocabulary, kept when F968 deleted the dead
component that once carried it). The CLAUDE.md cwd-drift law has now personally cost me a
near-false-finding; every git query in a verdict gets an absolute path or an explicit
`cd` in the same command.

**Residual work, sequenced not dropped:**
1. **The default has no proof.** F983's fix landed with tsc green and nothing that goes RED
   if someone deletes the base literal or moves it AFTER the scene spread. The merge lives in
   component-body `useMemo`s, so the right shape is the territory's own layer-3 pattern:
   extract `resolveSceneFlashListProps(base, sceneProps)` as a pure function, spec it
   hermetically (mutation: remove the base MVCP literal → RED; reorder the spread → RED),
   call it from all four sites. QUEUED as P3 until the nav-overlays P1 lane lands — two of
   the four sites are files it may be reading, and editing under an active reviewing lane
   invalidates its shas mid-pass.
2. **Redundant opt-outs:** PollsPanel.tsx:114 and
   use-search-root-search-scene-panel-list-transport-runtime.tsx:43 restate the default with
   no added information — delete with the same P3. PollDetailPanel.tsx:1318 stays: same
   value, but its P4 comment carries the scene-specific reason (programmatic scrollToIndex
   fights MVCP) and is load-bearing documentation. TrackSheetPage.tsx:1365 is NOT redundant
   (a direct FlashList JSX prop on a surface that never passes through the sheet transport)
   and is in a dirty tree — untouched.
3. The contract's `flashListProps` Omit list deliberately does NOT omit
   `maintainVisibleContentPosition`: the opt-in door for a future append/chat list is the
   design, not an oversight. Recorded so nobody "hardens" it shut.

---

## D70 — spot-check #3 + P2 verdict on the F2310/F2900 census (2026-08-06)

**Spot-check #3 — `apps/api/src/modules/identity/closeness.service.ts` (138 lines, read in
full): IDEAL-VERIFIED HOLDS, with the argument.** The weights (1000/500/100/10·cap20) are
not tuning constants but a DERIVATION of the documented ordering contract: max non-mutual
score = 500 + 100 + 200 = 800 < 1000, so tiers cannot cross by arithmetic — the contract
the spec tests (6 passing) is enforced by the numbers, not beside them. Four parallel
queries, no N+1; interaction gaming is bounded (cap 20 → max 200 < 500, so spam-liking
cannot beat a follow); stable sort makes the caller's pre-order the final tiebreak, which
is the right seam — closeness reorders only where it has signal. ONE WART, recorded not
filed: the `length <= 1` early return skips the self-filter, so `rankByCloseness(v, [v])`
returns `[v]` while `rankByCloseness(v, [v, x])` returns `[x]`. Unreachable today — the
sole caller (messaging shareTargets) filters the viewer before calling — but it is a
contract inconsistency a second caller could trip. Worth one line in a future touch, not
a finding.

**F2900 census — ACCEPTED as evidence; collapse APPROVED IN TWO STAGES, not one.**
The census is what D63 demanded: all 462 files, a classifier VALIDATED by hand-reading 13
files across buckets, and — the part that earns trust — two classifier defects found and
fixed before the final run (zustand `useShallow` subscriptions invisible to the subscribe
detector; bare `&&`/`||` inflating GENUINE from 262 to 156). A classifier whose validation
found nothing would have been suspect. Final: GENUINE 156, MEMO-ONLY 101, PASS-THROUGH 23,
ASSEMBLY 28, NAME-LIE 14, TYPE-ONLY 45, PLAIN 74, SPEC 20, DOC 1.

Stage 1 (approve now): the REGROWTH GUARD plus the 14 renames. The lint rule — a `use-*.ts`
in runtime/shared must call a React hook — is the abstraction; the renames are its initial
red set turning green. Without the guard first, the inline pass fights new growth.
Stage 2 (approve, sequenced after stage 1 lands): the 51-file PASS-THROUGH+ASSEMBLY inline,
F958/D45 mechanical style, in batches with tsc + the territory suite green per batch.
CONDITION: the P3 must RE-DERIVE the candidate list at execution time by re-running the
classifier — the census.tsv is a scratchpad snapshot of a tree that four lanes are editing,
and consuming it stale would inline a file someone just made genuine.

**F2901 — APPROVED.** Eleven literal constants emitted as if observed, in a file whose
same scope computes the true values: the instrument-that-cannot-fail shape, again. Fix is
to log the computed values or delete the log; no third option.

---

## D71 — P2 verdicts on F3000–F3003 (api-external-integrations/places, 2026-08-06)

**F3001 — VERIFIED BY EXECUTION, APPROVED, highest priority of the four.** I ran the
parser's arithmetic myself: tl.lon=170 / br.lon=-170 normalizes to `{minLng:-170,
maxLng:170}` — the 340° COMPLEMENT arc. The shared lib's `bboxContainsPoint` honors the
crossing representation (`minLng > maxLng` via `bboxLngArcs`) — the 2026-07-26 antimeridian
fix — and both TomTom parsers destroy that representation one function upstream with
`Math.min/max` on longitude. lng=179, inside the true arc, tests false; nearly everything
else on the planet tests true. Fix: preserve the provider's edge order for longitude
(TomTom's topLeft/btmRight and northEast/southWest already encode the arc direction);
min/max stays correct for LATITUDE only. The proposed mutation (parse the crossing box,
assert containment of lng=179) is the acceptance test.

**F3000 — APPROVED.** A throttled reservation that never books the minute it releases into,
plus a caller that sleeps-then-fires without re-reserving, admits limit+k held requests on
a minute boundary — up to 2× the vendor ceiling in one synchronized burst. The fix must be
the RESERVATION owning its landing slot (re-reserve after the sleep, or book the next
minute at throttle time), not a wider limit. Acceptance mutation as proposed: drive limit+k
held calls, assert next-minute releases ≤ limit — fails today.

**F3002 — APPROVED, refuse-don't-widen exactly as the file's own F114 doctrine states.**
The fail-closed env parse silently discards unknown tokens, so `google_places` (underscore
— the LEDGER'S OWN spelling of the service) quietly loses its Redis-outage guard. An
unrecognized token in a fail-CLOSED list must refuse boot loudly, not narrow the guard
silently. This is an adjacent instance honoring the F2701 escalation, not a dial change:
which services are listed stays the owner's; whether a typo silently unlists one does not.

**F3003 — APPROVED.** The outage-guard spec's wiring scanner is the F2702 shape again:
`/(sleep|setTimeout|delay)/i` matched anywhere in an 880-line file, and a catch-block scan
anchored to the file's FIRST catch. Severing the outage-path sleep stays green. Replace with
the proposed behavioral stub-and-spy; the scanner dies with it.

All four to one P3 lane; the territory's other clean bills (spend-currency's branded
currency law, decision-ledger's pending-set drain, the tomtom observation-type doctrine)
are accepted as argued.

---

## D72 — P2 verdicts on the nav-overlays large-surface pass (F2950–F2954, 2026-08-06)

**F2953 — APPROVED, highest priority.** The boot launch-prefetch effect has no once-latch
and depends on `startupLocationSnapshot?.coordinate`, a fresh object per GPS watch tick
(20s/50m cadence): the "boot" prefetch re-issues its API call every tick for the app's
foreground life. The fix is a once-latch keyed on the episode (what "boot" means), plus
deleting the `startupCamera?.source` dep the body never reads. Mutation: drive two
coordinate ticks through the effect; exactly one prefetch.

**F2950 — APPROVED.** One cache key minted in 5 places with 3 spellings, and an
invalidation that can never match two of them (stale `shareEnabled` after enableShare on a
slug-opened list). Rederive: one exported key-builder function; every mint and every
invalidation goes through it; the mutation is the agent's own (rename the `slug:` prefix →
every consumer breaks at once instead of none).

**F2951/F2952 — APPROVED, deletions with banking law.** Dead attribution params every
caller fills and nothing reads; a computed-and-documented flag with zero consumers; a
`contentMode` riding the display context with zero readers under docs describing a
function signature that no longer exists. Verify each zero-consumer claim by grep at
execution time, then delete, and fix the narrating comments in the same commit.

**F2954 — accepted; it REFINES D69's queued P3.** Post-F983, ALL remaining per-scene MVCP
literals are redundant restatements (including static-scene-descriptor:127, which D69
missed), zero opt-in callers exist, and PollsPanel:112's comment is now false. Ruling:
D69's extraction stands but the default VALUE gets one home — an exported constant on the
types module becomes a values-adjacent module concern; put the constant beside the merge
extraction, not in the .ts types file. The pure `mergeSceneFlashListProps` spec proves both
presence AND order (mutation: remove default → RED; move base after scene spread → RED).
Delete the now-redundant restatements EXCEPT PollDetailPanel's documented one; correct
PollsPanel:112's false comment.

**F2403 — CANDIDATE ACCEPTED, CONDITIONAL ON RUNTIME ATTRIBUTION.** `hasPaintedSceneKeysRef`
(painted-evidence Set written by real onLayout, invalidated on body detach) is exactly the
per-shell commit signal D68 said did not exist. But whether PREWARMED (hidden) shells fire
onLayout at idle is an empirical fact, not a code-reading fact — if they do not, an
"every managed scene painted after prewarm" assertion is the same false-RED trap as the
chrome-ack design I wrongly proposed. Condition (CLAUDE.md attribution law): instrument
first — log the Set's contents at post-prewarm idle in the sim, observe whether prewarmed
scenes acquire painted evidence — and only then wire the assertion. No assertion lands
without that observation.

---

## D73 — P2 verdicts on the api-search/user-surfaces pass (F3100–F3104, 2026-08-06)

**F3100 — APPROVED.** ~700 lines of dead legacy single-query path inside the 2,456-line
executor, including an entire second, DIVERGENT copy of the hours parser whose live twin is
`utils/restaurant-status.ts`. This is the F968 shape (a dead fork is where a fix silently
fails to propagate) at the heart of the hottest read path. Delete under banking law:
re-grep every symbol for external call sites AT EXECUTION TIME (the lane's grep is
evidence, not a substitute — the tree moves), then delete; tsc + the 26 suites green is
the acceptance.

**F3101 — APPROVED.** `openNowSupported/Unsupported/FilteredOut` hardcoded to zero, typed
as facts, forwarded by the assembler: a metric that can only show green is lying
(CLAUDE.md's core law). Compute them where the dual path actually knows them, or delete
the fields end-to-end including the assembler forwarding — no third option, and keeping
zeros is not one.

**F3102 — APPROVED.** The lean snippet query forgot the determinism law the ranked builder
carries (`connection_id ASC`, F1902). One line plus a spec with two equal-score rows.

**F3103 — APPROVED.** Photo orderings key on `ticketed_at DESC` with no unique tiebreak
and `restaurantGallery` PAGINATES over it — tied timestamps duplicate/drop photos across
pages. Same law as F1902/F3102, worse consequence (user-visible dup/drop). Unique tiebreak
in both the ORDER BY and the cursor. NOTE: photos.service.ts is DIRTY (another session);
photo-read.service.ts was clean at review — re-check at execution and STOP on that item if
it has gone dirty.

**F3104 — APPROVED AS INSTRUMENTATION, not behavior change.** The bare
`catch { scanEngineId = null }` silently widens territory scoping on failure. Whether a
scoping failure should fail the search is a behavior question adjacent to the F2601
escalation; what is NOT in question is the silence. Fix now: log with a named policy
(the `getDietaryIds` shape) so occurrences become countable; the behavior decision waits
for the owner alongside F2601.

---

## D74 — Stage-1 census P3 ratified (2026-08-06)

Landed as designed, with two deviations RATIFIED:
(1) **13 renames, not 14.** D70's re-derive-at-execution condition caught the census
overcounting: `use-search-root-overlay-foreground-visual-presentation-source-runtime.ts`
genuinely calls `React.useMemo` behind a multi-line generic containing semicolons that the
census classifier could not cross. It is MEMO-ONLY and keeps its honest name. The condition
existed for exactly this; filed as F3200.
(2) **A third prefix.** One file writes an action into a ref — both sanctioned prefixes
(`derive-*`/`select-*`) would lie, so it became `publish-*` under the design's "per what
they do" clause. Flagged rather than improvised silently; ratified — the clause was the
design, the prefix list was illustration.
The guard itself dodged two blind spots while being built (typeof-position references
would have green-lit the 401-line type file; the generic-crossing call shape), both fixed
before landing, both now in its header. Mutation proof ran in both orders plus a planted
probe. 176 importers rewritten via git mv, tsc clean, 40/40 suites, both audit gates pass.
Stage 2 (51-file inline) remains queued on F2900.

---

## D75 — search/photos P3 ratified (2026-08-06)

Landed as designed, independently verified: executor 2,456 → 1,359 lines with the
banking re-grep run at execution (the only same-named survivors are genuinely different
symbols in other modules); exactly ONE hours parser remains in the tree
(`utils/restaurant-status.ts`); tsc clean; 133 tests green in the affected suites here,
261 in the lane's fuller run. F3101 resolved by DELETION after the D73 who-consumes test
came back empty — mobile's adapter was fabricating its own zeros to satisfy a field
nothing rendered, which is the purest form of work done for nobody. Both determinism
fixes carry REAL-POSTGRES specs with both-direction mutation proofs, and F3104's spec
isolates the instrumentation (behavior assertions stayed green under the reverted catch,
so the spec proves the log, not an accident).

One process note, third instance of the D68 hazard: this lane's uncommitted
curated-list-adapter edit was swept into the stage-1 lane's commit via the working-tree
pathspec. Content verified correct on main; the hazard is now recorded in CRAVE.md's
rules and every brief. Stage 2 of F2900 (51-file inline) stays queued until the MVCP
lane exits runtime/shared.

---

## D76 — P2 verdicts on F3500–F3505 (api-polls/signals/core/content, 2026-08-06)

**F3501 — VERIFIED BY EXECUTION, APPROVED, first in line (money).** I ran the SQL shape
against Postgres myself: `x IN (...)::uuid[]` errors on EVERY input ("cannot cast type
boolean to uuid[]" — the cast binds after the IN evaluates), and the `= ANY(...::uuid[])`
form the same module already uses two files over works. The catch converts the crash into
vendor fallthrough, so the "ask ourselves first" free path has been dead since it landed
and every poll restaurant creation has paid Google. One-line fix to the form
`polls.service.ts:286` already uses, plus the seeded-nearby integration spec that fails
today. This is also a HUNT LEAD for a later sweep: grep every `Prisma.join` adjacent to a
cast — the same mis-binding may exist elsewhere.

**F3500 — APPROVED.** A third hand-rolled daily-acts dialect twenty lines below the builder
whose header documents that exact disease: route it through the builder; the two-kinds-sum
mutation (8 vs today's 5) is the acceptance.

**F3502 — APPROVED.** The F1902 determinism family again — persisted `rank` and the weekly
subject cut sorting nondeterministic input with no tiebreak, so tied bars visibly reshuffle
per rebuild. Tiebreak both, and give the comment read an orderBy.

**F3503 — APPROVED.** The weekly-ritual cron logs failures while its sibling ops-alerts
(F205 doctrine): a missed Sunday is silently a lost week. Wire the same alert; parity with
the sibling is the whole design.

**F3504 — APPROVED, low.** Move the taste-profile rebuild inside the watermark's
transactional scope or correct the comment to state the real staleness window; the current
text promises a recovery cadence the code does not have.

**F3505 clean bill — ACCEPTED.** The signals ingest helper layer is argued at
abstraction grade: wrong spellings inexpressible or build-failing. This is the standard.

Also accepted from the report: the ts-jest concurrent-compile flake (TS2304 on a
same-file symbol, isolated rerun green) is recorded as an infrastructure fact, not chased
as a code defect.

---

## D77 — MVCP merge-proof P3 ratified; the F2400 arc closes (2026-08-06)

Landed as designed and independently re-verified (the module's 6 specs green, hook-names
gate green, ledger gates pass). One function serves all four merge sites because the sites
differ in WHICH SLOTS THEY FILL, not in merge order — the agent's argument for one function
over two is accepted and recorded. Both D72 mutations proven directionally: default deleted
→ RED; default moved after the scene spread → RED with the opt-in case asserting the
scene's override still wins. Three value-identical restatements deleted with the false
PollsPanel comment corrected; PollDetailPanel's documented one and TrackSheetPage's
non-transport one kept, as ruled.

The F2400 arc, end to end, for the record: proposed (D62, approved by me citing a deleted
precedent) → refuted in P3 (D68) → discovered already-implemented by F983 (D69, which
neither side of the debate had re-read) → refined to a provable shape (D72/F2954) →
landed with both-direction proofs (this). The ledger now carries the whole path, including
both of my errors. That is what the artifact is for.

---

## D78 — P2 verdicts on mobile-search components/hooks (F3900–F3907, 2026-08-06)

**F3900 — APPROVED.** A 61-line read-model that is an identity function (9 args in, same 9
out plus a `projectionKey` nothing reads), behind a prop-type comment whose claim about
first-render values is FALSE (the bus selector seeds from `bus.getState()`), occupying 7 of
16 entries in the chrome-header memo's dep array — so every chip flip churns the header to
deliver values the destination discards. Delete the builder, read from the bus, fix the
comment. Sequenced after the stage-2 inline lane reports (different directory, but same
subsystem review flow).

**F3901/F3902 — ANALYSIS ACCEPTED; IMPLEMENTATION IS AN OWNER-DECISION, per CLAUDE.md's own
law.** The finding is real and beautifully mechanized: an 11-field subscribe gate in front
of a 40-field snapshot render, load-bearing only by accident (gated fields co-change), and
provably buying nothing because the downstream memo already keys on the same 5 fields —
with the correct plain `subscribe` literally coded as the fallback one line below. AND the
two filed defects cancel each other, which is why nothing is user-visible today. That last
fact is the ruling: the map surface is finished, precious, and owner-locked, and CLAUDE.md
says a cleanup edit there risks regressing hard-won behavior FOR ZERO BENEFIT. A change
that fixes two canceling defects delivers zero behavior change by construction — the
definition of that trade. Recorded as evidence with the mechanism written down; the owner
decides if it ever lands, ideally bundled with the next REAL map change.

**F3903/F3904 — APPROVED, small.** A dead `shouldLogPerf` param a live instrumentation flag
is threaded into (read it or drop the threading — decide by whether the callee SHOULD log);
a byte-identical `MemoOverlayModalSheet` in two files; module constants threaded as props
into components that already import those modules. Non-map, mechanical.

**F3905 — accepted as a SCOPE CORRECTION to the F2306 escalation.** The frozen-dimension
sweep must follow IMPORTERS, not grep `Dimensions.get` — derived constants one import away
are invisible to the literal sweep. The escalation text gets this note.

**F3906 — APPROVED AS A STARTER, not a blanket.** Zero specs across 12,937 lines, proven
blind by mutation (invert an admission branch; 40/40 stay green). A blanket "spec the
territory" order would produce padding. The starter: hermetic specs for the pure decision
logic the mutation exposed (`resolveMapMovedEnterAdmission` and its siblings), each with
its own RED mutation. Coverage grows behind findings, not quotas.

**F3907 — clean bill ACCEPTED with the argument recorded:** the STA baseline as a
PROJECTION of committedBounds makes the drift unrepresentable rather than discouraged —
that is the ladder's target state, found in the wild.

**Negative result recorded with approval:** the CLAUDE.md dead-effect law finds NOTHING in
this territory — no body-spec hooks exist there, so every useEffect fires. A law correctly
returning zero is evidence the law's scope is understood, and writing that down prevents
the next lane from re-hunting it.

---

## D79 — P2 verdicts on api-search/user-surfaces remainder (F3800–F3807, 2026-08-06)

**F3800 — APPROVED, the user-facing headliner.** "What can a search be about" is stated
THREE times in hand-copied four-arm lists, all missing the `ingredients` arm the
interpreter emits — so TYPING "burrata" returns the adjust-your-search empty state while
TAPPING it in autocomplete works, and the entire ingredient SQL lane (six passing specs)
is unreachable from the query that produces it. The fix is the repo's own strongest
pattern (the array IS the type): ONE exhaustive group vocabulary the interpreter and all
three orchestrator sites derive from, so a missing arm is a compile error, not an empty
state. The service has NO spec — the P3 adds the natural-query-for-each-group spec, RED
today for ingredients.

**F3801 — APPROVED, proven against the real DB before I ruled.** `DISTINCT ON (entity_id)
... ORDER BY entity_id ... LIMIT n` slices a UUID-ordered set: exact_available 1,
exact_returned 0, 20 prefix-extensions returned instead. Dedup order and relevance order
are different questions — dedup in a subquery (or ranked DISTINCT ON), relevance ORDER BY
outside, LIMIT last. Live on 14,615 active `es` aliases. Acceptance is the lane's own
repro: exact match at 1.0 must come back first.

**F3802 — APPROVED as a batch.** Five more non-unique ORDER BYs under LIMIT, the F1902
family; apply the module's established tiebreak idiom to each, one spec per site with tied
inputs. The "looks unique but rows are per-location" catch is exactly why these get read,
not grepped.

**F3803 — STARTER APPROVED, MIGRATION STAGED.** The mirror census (four pairs, one
drifted, mobile erasing QueryEntityDto to unknown[]) supersedes F842/F843, and the
diagnosis of WHY it stalled — a Nest DTO fuses wire shape + validation decorators +
internal post-interpretation shape — is the design insight. Approved now: single-source
`RestaurantStatusPreview` (byte-identical both sides, already imports from shared).
The three-way split for the rest is a layer-spanning design: write it as a full proposal
against the drifted `NaturalSearchRequestDto` FIRST, back to P2 before any mass migration.

**F3805 — APPROVED.** The second arg-blind mock cluster, on owner-scoping `where`s. Same
treatment as F2210: an input-keyed double (or explicit toHaveBeenCalledWith on the scope),
and the delete-list owner guard — which IS correct — becomes provable. Credit where due:
the lane's delegated reader claimed "a stranger can delete any list," and the lane RE-READ
the code itself and corrected the claim before filing. That is the reading law working.

**F3806/F3807 — APPROVED.** Curated lists: truncated sorts over unordered feeder queries
(nondeterministic curation), five silent skips, a dead LEFT JOIN; coverage: an unbounded
query, a whole-lane swallow, and a vacuous spec hiding an unpinned cross-user read scope.
The cross-user read scope spec is the priority item of the batch.

**F3804 — accepted terminal.** F2040 verified intact by exhaustive enumeration: five
producers, one chokepoint, no new peer path.

---

## D80 — polls/signals P3 ratified; two loose ends filed (2026-08-06)

All five landed, mutation-proven both directions, and the standard held under pressure:
the lane's own first mutation run went RED for the WRONG reason (a deliberately-durable
vendor_lookup_misses row outlived the process and short-circuited the control case) and it
fixed the spec's cleanup instead of accepting the red — a false RED interrogated as hard
as a false green. The Prisma.join sweep audited all 47 sites: the F3501 instance was the
only one; the other 46 are safe in three enumerated shapes. The free path now provably
answers without the vendor (zero-vendor-call assertion), with fail-open retained but
upgraded to an error-level named policy.

F3504's outcome is the P2 lesson of the batch: the design I approved offered a
transactional scope that DOES NOT EXIST. The lane took the approved fallback (honest
comment) and named the real fix — a profile_rebuild_floor latch mirroring the existing
floor pattern — which is now F4001, staged for its own design rather than improvised.
The lane also reported a FOURTH hand-rolled daily aggregation outside its scope rather
than silently fixing or silently skipping it; filed as F4000 with the triage question that
decides severity.

Index-sweep hazard, third occurrence, new mechanism: `git add <own paths>` does not
protect against a PRE-EXISTING dirty index — another lane's staged deletions ride into
the commit unless caught at commit time. The lane caught it via --name-only review,
soft-reset, recommitted clean. The rule is now: review `git diff --cached --name-only`
against your pathspec list BEFORE every commit in a multi-lane tree.

---

## D81 — P2 verdicts on the Fable second-opinion (F3910–F3915, 2026-08-06)

The owner asked for an independent Fable audit of the Opus-era work. Its overall verdict —
production changes CLEAN end to end (messaging wire shape traced into the mobile mirror;
the batch collapse's ordering preserved; the tsbuildinfo reasoning checked against real
import shapes; sampled spec hardenings are liveness witnesses, not implementation
coupling) — and its five proof-holes are ALL IN THE GUARD MACHINERY, most of it written by
me. That distribution is itself the lesson: the guards got one round of adversarial
attention at birth and none since, while production changes got P2 + mutation proofs +
this second pass.

**F3910/F3911 — APPROVED, scanner-source hardening.** A regex literal containing escaped
slashes false-strips the rest of its line, blinding a REAL call on that line — the exact
failure the header promises cannot happen; a quote inside a regex char class re-admits
prose false-passes; the header claims `#` handling that does not exist. AND there is a
SECOND stripper (`apps/api/src/shared/testing/code-only.ts`) with the OPPOSITE documented
bias, neither citing the other — the hand-rolled-duplicate pattern this exercise polices,
in the exercise's own tooling. Design: ONE stripper, regex-literal-aware (track the
after-operator position heuristic or bail conservatively per line), the bias trade-off
documented once, both consumers on it; the false-strip case becomes a spec.

**F3912 — APPROVED.** Trailing `--` comments false-pass the backtick gate. Extend to
in-line detection WITHOUT flagging `--` in code (decrement) — the line-start heuristic
stays primary; a trailing detector only fires inside a line that is inside a template
literal per the (single, hardened) stripper. If that coupling proves heavy, the honest
alternative is documenting the line-start-only scope in the gate's output. My own
verification attempt was CONFOUNDED — the gate crashed on a concurrently-deleted file —
which surfaced **the sixth hole: raw ENOENT crash on index/worktree mismatch.** All gates
get the same treatment: a tracked-but-absent file is SKIPPED WITH A COUNT (CI checkouts
are clean; locally the tree moves), never a stack trace.

**F3913 — APPROVED.** Root-anchored pathspec: `git ls-files 'railway*.json'` misses a
nested manifest. `'**/railway*.json'` plus a spec-fixture proof.

**F3914 — APPROVED.** The migration guard's grandfather list checks existence, not
content — an EDIT to a grandfathered migration is invisible; guard position (the SETs
must precede the heavy statement) is unchecked; the unbounded-UPDATE regex requires a
terminating `;`. Harden all three: grandfather entries pin the file's blob sha; position
check; statement-boundary tolerance.

**F3915 — APPROVED.** 41 reviewed COVERAGE rows whose path left the tree stay green
forever in `--check`. A missing path is a judgement someone must make (DELETED or a
rename to chase) — surface them as a failing count with a `--acknowledge-missing` path,
mirroring the unverifiable-rows fix (F2600) this same file already got.

One P3 lane, scripts/ + code-only.ts only. NOTE for that lane: the stage-2 inline is
actively deleting files — expect transient ENOENT/staleness noise until it lands; fixing
that noise IS item six.

---

## D82 — P2 verdicts on mobile-app-core/native (F3700–F3721 highlights, 2026-08-06)

**F3700 — APPROVED, highest priority.** The display-name door lock is shaped like the six
copies it was built from, not like the rule: the selector requires `||` AND `.trim()`,
while the helper's own header records that the originals split between `||` and `??`.
Execution-proven: the shipped config reports 0 on a live copy; one added `??`-dialect
selector goes RED at both sites. Fix: add the `??` selectors to the SAME one-block rule
(the F2050 one-block law), then route the five surviving copies through
`resolveUserDisplayName` — including the one two lines below a comment declaring the
eighth chain eliminated. Mutation: each converted site under the widened selector.

**F3701 — APPROVED.** A comment credits a refusal that does not exist; a collaborator's
Share button reaches the dead preview F834 exists to prevent. Implement the refusal where
the comment claims it lives, or make `showSendSection` consult the link verdict —
whichever the file's real flow supports after a full read; spec the collaborator path.

**F3705 — APPROVED as compute-or-delete.** Honesty fields with no reader (emitter +
FINDINGS.md are the only greps) and a noise-floor `quietDroppedFields` that fires on every
line. Same law as F3101: a metric nothing reads and a signal indistinguishable from noise
are deleted or made real — keeping them is not an option. The perf lane is KEEP
(CLAUDE.md), so prefer MAKING THEM REAL if a reader is cheap (the samplers exist); else
delete the fields and the always-firing tag.

**F3720 — APPROVED.** A suite asserting the subject's constants against themselves, and a
192/192 degenerate fixture that leaves a rowHeight/columnStride swap green. Independent
expected values; non-square fixture; the two named mutations as acceptance.

**F3706 — APPROVED (perf lane, non-map):** stop the Hermes profiler on the default exit
paths, not two hand-picked verbs.

**F3707 — EVIDENCE ONLY, owner-decision.** The dead bridge export's Swift half is deleted,
but the file is the MAP bridge: cleanup-for-zero-benefit on the owner-locked surface, same
ruling as F3901. Recorded; lands with the next real map change.

**F3709 — DEFERRED to the tracksheet session.** `trackShellWarning` declared and
subscribed but emitted by nothing sits in the tracksheet's dirty tree; filing it at that
session's door rather than editing under it.

**F3702/F3703 — ESCALATED (owner), both halves held.** The unreachable username step
(~250 lines) and the four regret-rate numbers are product provenance questions. The lane
offered to fix the drift alone; I am holding BOTH: deleting 250 lines of a step the owner
may intend to re-enable, or blessing numbers of unknown provenance, are the same decision
in two costumes. Owner: is the username step retired, and are the regret rates chosen or
invented?

**F3713 — ESCALATED (owner):** parked or abandoned native executor chain — the comment
defends a reflection hop below an entry point nothing calls.

**Clean bills accepted with their arguments**, notably the TrackScrollKit handshake:
deliberate duplication whose PURPOSE is detecting divergence, pinned on both sides — the
one place a second copy is the abstraction.

---

## D83 — stage-2 ratified; the sweep gets a mechanism (2026-08-06)

**Stage-2 inline ratified.** The re-derive condition earned its keep a second time: 35
candidates, not the census's 51 — the gap is the executing classifier being STRICTER
(splitting out LAMBDA files whose body defines a controller factory, which is logic, and
BRANCHY files), reported rather than reconciled, which is the safe direction. 19 files
inlined (−371 lines), 13 skipped on the design's own >1-importer gate with the structural
reason named (ReturnType<typeof useX> TYPE imports in contract files keep wrappers alive —
a future design question, recorded), 1 banked by a spec's require(), 3 deferred by
size judgment with the deferral written down. No spec died; the three touching inlined
territory are behavior proofs that survived and validated the work. F2900 stays honest
PARTIAL.

**F4102 -> MECHANISM (landed).** The pathspec sweep fired a fourth and fifth time
mid-lane, and the fifth committed deletions without the caller edits that make them
compile — main did not typecheck standalone until the lane's own commit healed it. The
rule existed in three places; by this exercise's own law that made it a convention. Now:
`scripts/check-lane-pathspec.sh` in lefthook pre-commit — a lane exports LANE_PATHS and
the hook REFUSES a commit whose staged set is not a subset, naming the foreign files and
the safe unstage command. Unset = silent pass (humans unaffected). Mutation-proven three
ways and committed THROUGH itself. Every future brief sets LANE_PATHS. Stated limit: the
fence cannot know what a file belongs to, only what the lane declared — it turns "forgot
to look" into "had to lie".

**F4100/F4101 — APPROVED, queued for the next mobile P3:** a use-* runtime file with zero
importers (invisible to the hook-name guard, which checks honesty not reachability — and
to knip, per the workspace bug's history), and a parameter typed, passed every render,
never destructured — the third instance of "TypeScript checks supplied, never used" in
this family. The hook-name guard MAY grow a zero-importer check; design it as part of the
fix, not as a bolt-on.

---

## D84 — search/user-lists P3 ratified (F3800–F3807, 2026-08-06)

All seven landed; three outcomes worth the record:

**F3800 exceeded the design.** I asked for one vocabulary the sites derive from so a
missing arm is a compile error. The lane added the REVERSE bind too —
`AssertNoUnenumeratedGroup<Exclude<keyof QueryEntityGroupDto, QueryEntityGroupKey>>` — so
a stray arm AND a dropped arm both fail tsc, proven in both directions (TS2344 on drop;
2/12 RED on the restored hand-copied sum). The interpreter's own emission switch stayed
un-pointed because that file was DIRTY under another session the whole pass — deferred and
recorded, not worked around: the gates that were the defect are derived, the emitter is a
follow-up.

**F3807's cap is a derivation, not a guess.** `COVERAGE_MAX_ROWS = 15_000` justified by
MEASUREMENT (11,141 = every eligible location with no viewport filter at all — the true
worst case), with a +1 sentinel and rank-ordered truncation. That is the no-fake-estimates
law executed correctly: measure the worst case, derive the bound, log the policy.

**F3802's honest accounting stands.** One representative spec where a spec could go RED;
four sites fix-only and RECORDED as such — a padded spec that cannot fail is worse than a
row that says "fix-only".

Also: the lane hit CLAUDE.md's backtick-in-Prisma.sql trap VERBATIM while writing a SQL
comment (tsc pointing a function away) — live confirmation, mid-exercise, of why the
F2161 gate names what tsc cannot, and of F3912's honestly-scoped-subset ruling.

F3803's starter is proven bidirectionally (deleting a field from the shared type now reds
BOTH tsc runs; before, it failed nothing); the migration stays owed to P2. F3805 pinned
the owner scope twice with the production mutation honestly blocked by the dirty file.

**Sixth sweep instance** (commit 50383e655 took this lane's staged index) — occurred in a
lane launched BEFORE the fence existed. Every brief from D83 forward sets LANE_PATHS; the
pre-fence lanes age out as they land.

---

## D85 — guard-hardening + mobile-app-core P3 ratified; the commit protocol upgrades to --only (2026-08-06)

All eleven landed; independently re-verified (six gates green, ledger green, 12/12 in the
touched mobile suites; full lane numbers 128 suites / 1325 tests). Ratified with three
notes and two recorded violations.

**The stripper is ONE, and the count of replicas was three, not two.** The lane found a
THIRD copy of the naive strip inside `check-search-runtime-hook-names.mjs` — an .mjs that
cannot import the TS module, carrying the same F3910 bug. It is repaired and DECLARED a
replica citing the original, which is the honest shape when the module boundary is real
(the same constraint that decided F3912's document-don't-widen). One implementation, one
stated bias, one accepted over-strip bounded at `${`, and a guard the design did not name
(`/*` and `//` are never regex candidates) added because the lane read the code paths
rather than transcribing the spec.

**F3705 chose MAKE REAL, and the choice is right by the KEEP law:** the samplers exist,
the report script was the natural reader, and a working honesty signal now exits 1 on
`attached:false` — deleting it would have been the worse trade. F3720's guard case is the
kind of detail that justifies the reading directive: only `0/0` is NaN; a nonzero
numerator over zero clamps to the same answer, so the spec pins `translationX: 0`
specifically.

**Two violations, disclosed by the lane itself, both survivable and both instructive:**
(1) `git stash` twice — forbidden; nothing lost, and the lane verified the stash's index
tree was empty before concluding that. (2) A CHAINED add-review-commit let the review do
nothing, sweeping 22 files — the SEVENTH sweep — caught immediately, soft-reset, and
recommitted with `git commit --only <pathspec>`, which preserves the foreign index
exactly. That discovery upgrades the protocol: **every future brief mandates
`git commit --only -- <paths>`** — unlike a plain pathspec commit it is explicit about
ignoring the index, and combined with the D83 LANE_PATHS fence the sweep now has two
independent mechanisms where it had zero this morning. F4400 (the ENOENT family fix via
`scripts/lib/tracked-source.mjs`) accepted.

Package B closed the display-name arc at NINE copies converted total (six this pass — the
widened selector caught a sixth the finding had not named), and F3701's share refusal is
now a compile-time property (the old call site stopped compiling), which is stronger than
the runtime refusal the comment had falsely credited.

---

## D86 — api P3 (F3000–F3003) ratified; wave complete (2026-08-06)

Landed exactly per D71 under the new protocol (LANE_PATHS + `git commit --only`), and
independently re-verified: places suite 167/167, invariants 20/39 all rejecting, both
ledger gates green. The antimeridian parsers now preserve provider edge order with the
consumer sweep done (places-catalog splits envelopes at the seam; the reconciler has
crossesSeam — no min<=max assumption anywhere downstream); the throttled arm books the
minute it lands in, with cascading holds; the fail-closed parse refuses boot naming the
token and vocabulary; and the outage-guard scanner is dead, replaced by behavior proofs
that hold the sleep accountable. Every mutation ran both directions, grep-confirmed.

The interim places/ commits were ANOTHER session's work in unrelated regions; the lane
verified its parser fix sat cleanly atop them and re-ran the suite after — the right
paranoia. One owed item recorded on F3001's row: a DB audit for stored near-world-wide
sub-country bboxes (data written while the parser was wrong) — an owner data check, since
re-deriving stored rows touches data.

Three entity-resolver COVERAGE rows went stale under that other session's commits and are
reverted to UNREVIEWED — their re-review rides the next api wave.

---

## D87 — P2 verdicts on the gesture/panels pass (F4500–F4512, 2026-08-06)

**F4501 — SPLIT RULING: the symmetry fix is APPROVED, the residual policy is ESCALATED.**
`isReady` awaits four async facts and the destination memo reads a FIFTH
(`access.enforced`) it never waits for, with `?? false` shared between a fail-closed
sibling (`active`) and this fail-OPEN one. Approved as engineering: `enforced` joins the
four awaited facts — that is symmetry, not policy; the current behavior routes
access-UNKNOWN to main not by decision but by a shared default. ESCALATED as policy: what
happens when access is genuinely unknown AFTER waiting (timeout, error) — open or closed —
is the owner's paywall call, and the P3 must leave that arm explicitly marked with the
escalation reference, not pick silently.

**F4502 — APPROVED.** The gestures contract is silently short by one — the runtime returns
a fourth pan carrying the boundary-physics law, read against the inferred type before the
narrowing. The fix IS the stated mutation: annotate the runtime's return as the contract
type, so deleting a field fails at the return statement. Update the "two pans" comment to
the truth in the same commit.

**F4500 — APPROVED, F3701's shape.** A 15-line docblock names consumers that do not exist
for a hazard that is fully live. Read the sign-out and access-redirect flows END TO END
first (the reading directive is the method here), then either implement the isResolving
check where the doc claims it lives or rewrite the doc to say the hazard is UNHANDLED —
a doc that says handled-when-not is worse than no doc.

**F4508 — APPROVED.** Delete the two guards that cannot fail (non-nullable type, verified),
KEEP the two real ones (genuinely optional fields), and add one comment distinguishing
them — the author's failure was not distinguishing, so the fix must make the distinction
legible, not just shorter.

**F4507 — APPROVED, banking law.** A ~340-line spec proving a dead handler's identity
survives a swap, ten contracts deep, when the UI moved to useFavoriteHeart. Re-grep the
whole chain at execution; delete handler, threading, and spec together.

**F4510 — APPROVED, and the design note is the ruling:** deleting the `?? 0` IS the
abstraction — `number | null` is not assignable to setTimeout, so tsc enforces what a
reviewer currently must remember. Exhaustion stops being a zero-delay hot loop by type.

**F4503/F4504/F4505/F4506/F4509/F4511/F4512 — APPROVED as smalls** per their rows.

**The F1475 hunt returning EMPTY is accepted as evidence**, with the reason recorded: the
family's `runtimeConfigValues` is now REQUIRED, so the dead-fallback shape is
inexpressible there — the earlier rederivation closed the class, not just the instance.
The cousin it found instead (values alive past their last reader) is this pass's harvest.

**Clean bills accepted**, notably the immutable-pans design (empty-deps memo, stable
captures, effects leaving via the command bus — the polls detached-pan disease
unrepresentable) and ProfileSectionsBody's DOUBLE compile-time enforcement of the section
union — the one panel-family guard that goes RED under mutation.

---

## D88 — mobile P3+P1 hybrid ratified (F3900/F3906/F4100/F4101, 2026-08-06)

**F3900 cascaded past the design, and corrected the design's own false claim.** The
deletion surfaced a THIRD copy of the chip-state bug — chrome-freeze-runtime spreading the
frozen header then punching the exact 8 toggle states back through it live, the FIRST
attempt at the bug the bus read later fixed properly, surviving as a fossil. Net −184
lines. And the design's claim "after the rederivation the mutation cannot be written" was
FALSE as first implemented — a JSX spread is not excess-property checked, so the dead prop
re-added silently. The lane made both producers build through an annotated props local,
which IS excess-property checked; re-adding now fails TS2353 at both sites, proven. That
is the difference between a claim of unrepresentability and a proof of one, caught by the
lane rather than shipped by me.

**F3906's bedrock was importability, not laziness.** The decision functions were untested
because UNIMPORTABLE — react-native poisoning through `constants/search.ts` into
`utils/geo.ts`. Thresholds moved to a pure module, decisions to a pure file, 17 tests, and
the finding's own previously-green mutation now reds 5. The territory's Node-pure
decision-layer law (already in .eslintrc for three files) is the shape this confirms.

**F4100's orphan check caught a second orphan ON ITS FIRST RUN — one whose coverage row
read "correct as written" from a line-by-line read.** Recorded as a lesson on
IDEAL-VERIFIED itself: reachability is a fact reading a single file cannot establish; a
file can be internally perfect and dead. The gate's over-crediting bias (last-segment
match, dynamic forms count) is ruled correct for a verdict whose failure mode is "delete
this live file".

**F4101's general guard STOPPED, correctly.** Two regex censuses both mis-parsed nested
type members as top-level args — for a scanner whose verdict is "this argument is dead",
that is accusing live code. Five endemic instances fixed by hand; F4601 filed for a
type-aware (compiler API) version. A false-accusing guard is worse than none — the same
reasoning as the migration guard's narrow scope, applied by the lane unprompted.

The transient tsc error at useBottomSheetSharedRuntime.tsx(433) is the OTHER live lane's
F4502 contract annotation mid-flight — expected, not a defect.

Ten of the sweep-reverted rows re-reviewed and restored with arguments (the 11th was
lefthook.yml, repo-root, already re-pinned).

---

## D89 — P2 verdicts on the resolver/reconciler pass (F4800–F4807, 2026-08-06)

**F4800 — APPROVED, and it is the owner's no-guards preference as a single specimen.** The
ground truth (`controller.signal.aborted`) is OBSERVED and then discarded — runSearch
returns null, fetch converts null to a sentence, the resolver string-matches the sentence
to reconstruct the boolean. Verified myself: `.includes('canceled')` at
search-world-resolver.ts:366 matches NOTHING any file under apps/mobile/src throws, so the
arm exists only as a trap that silently demotes a real failure containing the word; and
two comments credit an F1050 enforcer that does not exist. The rederivation carries the
observation instead of reconstructing it: `runSearch` returns
`{kind:'response'|'aborted'}` and the string-match becomes UNWRITABLE. Mutation: the
resolver cannot express the old arm (tsc), plus a spec where an aborted run classifies
as canceled without any message inspection.

**F4804 — APPROVED, same ladder rung.** `SearchWorldTransition.intent` flattened to
`X | null` across ten classes forces SEVEN downstream guards a discriminated union makes
unwritable. Discriminate the union; the guards die with the flattening.

**F4801/F4802/F4803/F4805/F4806 — APPROVED.** A parameter whose one call site passes
literal `false` (dead conjunct + unreachable lane + an instrument that can only say
`reset:false` — the F2901 shape, third instance); a useMemo whose dep array holds a
fresh-every-render rest-destructure (amends F1610: the cost is a dead optimization, not
verbosity); two params no caller supplies under a comment crediting a parameterization
with zero users; the twice-derived delta whose "unreachable by construction" comment names
the WRONG enforcer — fix the comment to name the real one (retry gated on failure level)
AND pin it with the test the row says is missing; the `as string ?? ''` that defeats the
check it appears to make, ten lines from five honest guards — plus `resolvedAt`, written
thrice and read never.

**F4807 clean bill — ACCEPTED, and flagged to the owner as the model of the target state.**
The overlay-relay controllers are the audit's doctrine already executed: deleted wrappers
named WITH their mechanism, an interaction path RECLASSIFIED so its publish machinery
could be deleted rather than gated, comparators citing the composite spec by assertion
title, and a measurement recorded as expected-to-fall rather than frozen. When the DONE
report is written, this family is the exhibit for "what ideal looks like here".

---

## D90 — nav-overlays P3 ratified; a second design of mine refuted by reading (2026-08-06)

Nine of eleven landed, both STOPs correct, 44 suites / 640 tests green.

**F4506 — MY APPROVED DESIGN'S PREMISE WAS FALSE, and the STOP is the system working.**
The design said a reverse-of-construction collector "preserves today's ordering, which the
hand-written list already approximates." The lane compared the two orders: construction
1–19 versus dispose 9,17,11,7,13,14,18,12,6,3,4,1,19,2,16,15,10 — not an approximation of
anything, and a literal reverse would move the foundation runtime AHEAD of six
collaborators holding subscriptions into its authorities: a silent teardown-order change
on the composition root that nothing in the tree can catch. That is the second design of
mine refuted by a lane that READ where I had pattern-matched (F2403 was the first). Filed
with the real order and two honest paths; returns to P2 with data instead of a premise.

**F4501 landed with a shape better than the design asked:** the routing decision extracted
to a pure module BECAUSE the jest lane cannot render — otherwise the fix would have been
unassertable — and `useAccess` gained `isKnown` because `enforced ?? false` cannot
distinguish "server says off" from "nothing answered". The escalated arm is a named
constant pinned by a test, citing D87. The owner's policy question stands, now with a
one-line landing site when answered.

**F4500's choice is the honest one:** both flows the docblock named as consumers were read
end to end and neither could ever check the field — one calls Clerk directly, the other IS
this file's own memo. Implementing would have meant inventing a consumer for a doc's
claim. Field deleted; the doc now says UNHANDLED.

**F4502's detail earns recording:** `useMemo<T>` did NOT fire excess-property checking;
the callback RETURN annotation does. Same class as D88's JSX-spread discovery — the
repo now has two documented cases where the obvious typing gesture fails to buy the
guarantee and the working form is known.

**F4507 STOPPED on scope** (the ten-contract chain crosses another lane's dirty tree; a
partial deletion does not typecheck) — queued for a screens/Search-owning lane. **F4700
filed:** a 1-in-6 pack-flaky spec from a `virtual: true` mock of a real module — until it
lands, one green run of this territory is not final; re-runs are.

Bookkeeping: six new files' COVERAGE rows added by me (the lane correctly stopped on the
dirty ledger), the D87/D90-ratified edits re-pinned, and one 'GATE' prose token replaced
with a real blob sha.

---

## D91 — P2 verdicts on the api-tails sweep (F4900–F4959 highlights, 2026-08-06)

**F4926 — APPROVED, first in line.** The thinking-config spec defines its own copy of
`resolveGenerationConfig` and imports nothing from llm.service.ts, where the merge is
inlined and private — reverting the production line to the original bug keeps all 196
tests green, so the measured 118x output-token regression the file exists to prevent is
fully reintroducible. The fix is ONE EXPORT: production's function becomes the spec's
subject. The purest testing-a-copy specimen this exercise has found.

**F4950 — APPROVED.** `undefined + 1 = NaN`, `NaN >= 3` is false, so the retirement
ceiling guarding an hourly scarce-polygon draw is unreachable in every test — set the
constant to 999 and nothing reds. One type annotation on the fixture builder makes the
omission unwritable; then a spec must show the ceiling firing.

**F4920/F4921/F4922 — APPROVED AS SPEC-ONLY, the established money-area rule.** Three
unkeyed doubles each ONE SEAM OVER from where a prior campaign stopped (Stripe fixed,
`user.findFirst` beside it not; `findUnique` fixed, `$queryRaw` beside it not;
`entityRedirect` fixed, `pollEndorsement` beside it not). No production line changes;
input-keyed doubles per F2210's pattern. The meta-lesson goes in the row: a hardening
campaign's stopping boundary is itself a place to hunt.

**F4907 — APPROVED.** `recordEnrichmentFailure` swallows the very count write whose
absence caused the documented weekly Places re-spend. The failure-counting write fails
LOUD (the F205 sibling doctrine); no dial changes.

**F4936 — APPROVED with an owner flag.** The one gap in the preserved-anchors enumeration:
`poll_comments.entity_spans` (GIN-indexed, user-authored, feeds the leaderboard) joins the
anchor list in the same clause shape as `messages.shared_entity_id`. This EXTENDS wipe
protection — the safe direction under the restaurants-never-deleted law — but it edits the
wipe script, so: BEGIN/ROLLBACK proof against the local corpus, and the owner is notified
in the report rather than asked first, since the change is strictly protective.

**F4913/F4938 — APPROVED, markets extermination continues:** fixtures proving nothing
about a deleted system and a README crediting recall scoping that the code says in its own
words is display-only.

**F4939 — APPROVED, and the lesson enters the briefs:** the F414 sweep stamped "deletion
candidate" on three files it had not read — defaulting an unknown to the most destructive
value. Correct the stamps; the rule (a sweep emits only the fact it established) joins the
standing brief language.

**F4908 — ESCALATED (owner): two of YOUR rulings disagree.** F109/D7 says the teaser shows
only numbers a real card shows; the implementation clamps `Math.min(score, 9.9)` while the
live corpus contains 10.00 scores that the teaser's own ORDER BY selects. Either the clamp
goes (teaser may show 10.0) or the ruling gains an exception (and the row records why).
Options and a recommendation are on the row.

**F4934/F4932 folded into the F2700/F2701 escalations** as adjacent instances, not
re-litigated. The zero-residue sweeps (ladder/sync-LLM: zero; prompt paths: zero dangling,
with the REASON — one glob, no per-file list to forget) are accepted as evidence.

---

## D92 — resolver/reconciler P3 ratified (F4800–F4806 + F4507, 2026-08-06)

All eight landed, 88 suites / 955 tests green run twice. Three things worth the record:

**F4800 landed at the top of the ladder.** The union REFUSES to let the abort be ignored —
deleting the aborted arm is TS2339, reverting to null-return is TS2322 at two sites. The
old shape is unwritable, not merely untested, and both false comments died with it. The
list fetchers' null now classifies as an honest failure rather than a phantom
cancellation.

**Two of the design's sub-claims were refuted by reading, and the lane proved better ones.**
F4804's guard count was 4, not 7 (three DEV-trace defaults are genuinely live pre-dispatch
and stay WITH a comment saying so), and the row's proposed mutation compiles silently —
TS does not flag a null comparison on a non-nullable — so the lane replaced it with real
unwritability proofs (TS2322 both directions). F4802's `Object.is` mutation is NOT
satisfied without F1610's collapse, and the lane said so instead of pretending.

**The gate ecology worked live.** Deleting F4802's dead memo made its wrapper hookless —
and `check-search-runtime-hook-names` FAILED it mid-lane, forcing the honest outcome (the
wrapper deleted, the caller direct). A guard built three days ago caught the consequence
of a deletion made today. That is what the mechanism-over-convention investment buys.

F4507's ten-contract dead-handler chain deleted as ONE typechecking commit with the spec's
seventeen identity assertions. F5000 filed OPEN rather than deleted-on-a-grep: a route
lane that can be closed but never opened needs its three opener surfaces READ first —
the F4939 lesson applied forward.

---

## D93 — P2 verdicts on the runtime/shared survivors pass (F5300–F5307, 2026-08-06)

**F5300 — APPROVED, and it refines the census's own definition.** Three files, 204 lines,
zero transformation — bucketed GENUINE because each calls a hook, but D70's bedrock says
isolation is bought by a SUBSCRIPTION boundary, and React re-runs these on every parent
render exactly as if inlined. Calling a hook is not a boundary; subscribing is. Inline all
three into the consumer that already destructures the result apart. The stated mutation is
accepted: a layer that transforms nothing cannot lose a behaviour.

**F5302 — APPROVED FOR IMMEDIATE LANDING, the reusable one.** `void <identifier>;` at
eight sites — the author has ALREADY asserted the arg is unread, so a regex rule cannot
false-accuse (the property that made D88 stop the general scanner is absent by
construction here). Ship the lint rule in the one-block law, clean the eight sites, and
the worst case (a value threaded four hops so one hop can discard it) dies with F5300's
plumbing. F4601's type-aware scanner remains owed for the general case; this subclass
does not wait for it.

**F5301 — APPROVED.** Two stacked permanently-cold memos off a fresh-every-render
rest-destructure; the F1610 comment defends the field list while the memoization it rides
is inert. The census ran territory-wide: exactly ONE instance — bounded, fix it, and the
identity assertion is the proof (no type-level form exists, per D92's finding).

**F5303/F5304/F5305/F5306 — APPROVED.** The re-packing memo dies; the widened port
narrows to its sink (F5304 is filed correctly as a port-width defect, not a dead branch —
see F5307); the fourth constant-emitting instrument computes or dies (F2901's rule); and
the one accessor leaking a live handle joins its four cloning siblings — prefer typing
the frozen region readonly so the leak is unwritable, clone only if the type change
cascades unreasonably (say which).

**F5307 — ACCEPTED, and this is now the expected shape.** Two of the lane's own hypotheses
refuted by reading, RECORDED rather than dropped: the profile record layer is genuinely
one-owner (a named accessor for every outside reader), and `state !== undefined` is
satisfiable by type — dead only by caller census. Both live in the ledger so the next
reader inherits the refutation, not the hunch.

**The viewport-bounds clean bill is flagged as a second exhibit** alongside D89's
overlay-relay family: the legacy write path is not deprecated but IMPLEMENTED — a
defineProperty setter routes it into the new one, so the two paths are the same code and
cannot diverge. Unrepresentability for six lines.

---

## D94 — api-tails P3 ratified; the coverage gate's pipe exemption closed (2026-08-06)

**All seven D91 items landed, vacuity-first every time** (196/196 green under the reverted
118x bug BEFORE the rewire, then 3 red after; 167/167 green under a 999 ceiling, then
straddled). Deviations all ratified: the merge extracted to a sibling module so the spec
avoids the Nest graph (the gemini-thinking.ts precedent); the wipe anchor as a CASE inside
jsonb_array_elements because a set-returning FROM runs before WHERE (a non-array value
would otherwise error the whole wipe); five double-seams covered instead of three because
D91's triplet did not match the rows — the lane covered BOTH readings rather than picking.

**The wipe-anchor proof found real data:** two entities in the austinfood corpus are
anchored ONLY by a poll comment span — the current wipe would have deleted them. Preserved
5736 -> 5746 on the dry run. Owner notified, not asked; the change is strictly protective.

**F5100 — APPROVED, queued:** `recordNoMatchCandidates` is the identical silent twin of
the F4907 fix; the lane correctly filed rather than improvising on a money path. Same
F205 form, next api P3.

**F5101 — FIXED BY ME, the guard-that-cannot-fail shape in our own primary-key gate:**
NF==8 silently exempted every row whose findings cell contained a pipe (~36 paths outside
the uniqueness guarantee). Path is $2; the condition bought nothing. Mutation-proven on
the exempt class: old parse zero duplicates, new gate names the path. This is the SECOND
defect found in the coverage tooling by a lane using it honestly (F2600 was the first) —
the tooling keeps earning its own audits.

Cross-lane note: the mobile survivors lane committed the shared ledgers wholesale under
its message, sweeping this lane's rows — content intact, gates green, and the eighth
sweep instance is on ledger files where wholesale commits are the practical norm; the
LANE_PATHS fence covers production files, which is where sweeps did damage.

---

## D95 — P2 verdicts on the authority-controllers pass (F5400–F5425, 2026-08-06)

**F5417 — APPROVED, and it earns a place in the catalogue: the fix addressed the leg and
left the sink.** The half-pop probe was repaired under the banner "an instrument that
cannot fire is an always-green lie" — and the repaired leg emits through a debug logger
gated on a constant false, so it STILL cannot fire in any build. The rederivation is the
ruling: a correctness TRIPWIRE and a narrative TRACE are different populations; split
them so only the trace may be flipped off. The tripwire emits unconditionally (or through
the crash-reporting seam), and the spec proves it fires with the debug flag off.

**F5405 — APPROVED with its honest cost.** A module-global Set maintained on every
production arm/disarm exists to serve txns minted OUTSIDE the single-live-transaction
holder — which exist because the constructor is exported and the spec uses it 14 times
against the engine's own architecture. Un-export, stage through the holder (which already
supersedes-and-disarms), delete the Set and its duplicated-ledger hazard. The cost is
stated and accepted: two spec cases rewritten, and if one asserts a state production
cannot reach, it DIES rather than being contorted — a spec of an unreachable state is
the F4507 shape.

**F5407 — APPROVED, priority within the batch.** The dismiss richness gate — inside the
golden-guarded deadlock seam — reads a field with ZERO writers whose own type comment
concedes it is unwritten, and setting it flips a branch the golden assertion cannot see
(it guards the emission, not the branch choice). Delete the dead field and the branch it
gates; the golden stays exactly as strong because it never saw this axis.

**F5400/F5404/F5410/F5411/F5418 — APPROVED.** The publication lane collapses to the one
integer it carries (and that integer's derivation gets ONE home instead of three); the
phantom union member whose only use is a spec's invalid-value case dies with its false
header credit; the correct `=== undefined` discrimination replaces the broken `??` eight
lines away so the admission policy becomes clearable; the hard-coded `durationMs: 0`
computes or the span dies (F2901's rule); and the silently-discarding guard becomes a
shape that cannot receive a second scene.

**F5416 — accepted, and it changes an acceptance bar:** the F4700 flake reproduced at
1-in-7 with the suite dying wholesale (3 tests lost, no assertion failing) — consistent
with the `virtual: true` registry-effect diagnosis. The fix's bar is TWENTY consecutive
greens, not one. The lane's honesty about not capturing the suite name (ran --silent) is
noted; the fix lane must run without it.

**The re-verification discipline drew blood again:** a delegated "contradiction" was two
different flags' docblocks — recorded as a NON-FINDING so nobody re-derives it. And the
26 clean bills include the contrast that teaches: premount-violation-probe is ARMED and
honest about its unmeasured constant, in the same territory as F5417's disarmed sibling.

F5000 remains OPEN honestly — its opener surfaces are in unreached files and the lane
did not guess.

---

## D96 — survivors P3 ratified; my "cannot false-accuse" claim was FALSE (2026-08-06)

**F5302's lint rule is DEAD, and the refutation is mine to own.** I ruled the `void
<identifier>;` rule shippable because "the author has already asserted the arg is unread —
false accusation is absent by construction." A repo census found THIRTEEN sites, not
eight, and in four of them the void means the OPPOSITE: `void _assertEveryRuntimeField...`,
`void exhaustive;` — the voided identifier is a declared const WHOSE DECLARATION IS THE
CHECK (never-exhaustiveness bindings, compile-time type assertions), and the void marks it
used. Deleting the line deletes a real guard. ESLint cannot resolve bindings, so no
selector separates the two meanings; and the F2050 one-block law makes scoping the rule
unavailable (a second no-restricted-syntax block would REPLACE the display-name bans).
Third element of mine refuted by reading (F2403's composite, F4506's dispose order, now
this). The terminal state is honest: seven in-territory sites cleaned to their producers
(tsc-proven), two remain with out-of-lane callers, the rule is NOT shipped, and the
general answer stays F4601's type-aware scanner. F5427 (make no-unused-vars args an
error) FOLDS INTO the F2406 owner escalation — same decision, same cost surface.

**The rest landed at the standard.** F5300's mutation held exactly as designed (no spec
edited, nothing lost); F5301's spec is a real discriminator (the identity tests red under
the restored rest-destructure while wiring tests stay green); F5304's caller-side proof
ran at all three sites simultaneously per the D92 warning; F5306 chose the higher rung
with a MEASURED zero cascade rather than a guessed one.

**F5426 — ESCALATED (product), and it reframes F5306:** `setOverlapRegion` has zero
callers, so the frozen region was never written and the leak had no state to leak — the
fix was correct and free, but the real question (freeze the overlap region per search, or
recompute per source build) is a product behavior choice. Options on the row.

---

## D97 — authority-controllers P3 ratified (2026-08-06)

8 of 9 landed, 46 suites / 655 tests green, and the batch closed three long-running arcs:

**The flake is dead, at the bar D95 set:** `virtual: true` on a REAL module keyed the mock
factory by literal specifier, so a successful resolution loaded untransformed
react-native and killed the suite wholesale. The fix is the sibling pattern (drop the
third argument), proven by TWENTY consecutive non-silent green runs at 45/650. A green
run of this territory is trustworthy again.

**The tripwire/trace split landed with a claim withdrawn:** F5417's secondary assertion
(a docblock describing "an ungated path that does not exist") was FALSE — the ungated
path exists, it just does not route through the logger the grep searched. Claim withdrawn
in the ledger, docblock untouched. Meanwhile the tripwire now spans the whole seam
(armed by the pop verb, disarmed at the restore's camera commit) and its spec's FIRST
assertion is that the debug flag is off.

**F5405's unreachable-state spec was DELETED, not rewritten** — with the constructor
private, "two live transactions coexist" asserts a state production cannot mint, the
F4507 shape, exactly as D95 pre-authorized. And the lane held the line on scope:
`markTransitionJoinInput` stays exported because un-exporting it would delete three live
contract assertions to remove one test import — a deviation argued, not slipped.

**F5418 STOPPED, and the stop is worth more than the fix would have been:** the weak
fallback (delete the guards, rely on types) is DISPROVEN — with guards gone and a second
scene added, tsc is CLEAN because the controller's state is two search singletons; a
second scene would silently ALIAS onto search state, worse than being dropped. My row's
"per-scene state fails to compile" did not hold. The strong shape needs two one-line
producer edits in screens/Search (now a free territory); the row carries the exact fix
and acceptance, queued for the next lane in.

**F5411's ruling paid twice:** the consumer READ decided measure-over-delete (a constant
zero pinned the owner to the bottom of worstByDuration forever), and the fix
incidentally made the uninstrumented path cheaper.

---

## D98 — P2 verdicts on the mobile-search final-push P1 (F5700–F5707, 2026-08-06)

**F5703 — VERIFIED MYSELF, APPROVED, first in line. A defect in this session's own D61
work.** The watchdog's recommit flows through the F1374 supersede block, which is not
retry-aware: `isWatchdogRetry` is threaded in and consulted only to set `retried`, so the
retry emits `cancelled` for the completion downstream armed on, then continues under a
fresh id nobody holds — a SUCCESSFUL rescue reported as failure, tearing down the
scene-switch settle it just saved. The F1374 law (an armed completion resolves exactly
once) is correct; the retry violates its spirit by resolving the WRONG once. Rederivation
as proposed: on retry, REUSE the pending completionId and suppress the supersede cancel —
the same completion continues and still resolves exactly once. The lane's proving
mutation is the acceptance, and the park spec (its own F5707 exhibit) gains the missing
assertion rather than a new harness.

**F5700 — APPROVED.** Provenance declared, filled differently by five call sites, read by
none — then overwritten with a constant, so a recent-search tap reaches the backend as an
autocomplete submission with the entity's own name as the user's typed prefix. Carry the
declared fields through the emission path; delete the constant. Found by reading the
emission path after a comment credited a path that lane cannot take — the D97 discipline
paying again.

**F5701 — APPROVED at the unrepresentable rung.** 17 of 38 option members unread; shrink
the type and tsc is the proof. The four-link memo chain whose only live output is
unchanged dies with the two dead uiPorts members that were its whole reason.

**F5704 — APPROVED.** Four commit-path legs, and the ONLY uninstrumented one is where a
committed intent genuinely vanishes (park supersession) — while commit() has already
returned true. The enumeration omits the failure it was commissioned for (F2901 one level
up). Instrument the park-supersession leg with a completion emission, consistent with the
one-law-both-paths comment.

**F5702/F5705/F5706 — APPROVED.** Two permanently-false flags and their dead arm +
zero-delta wrapper deleted (callers enumerated); the geometry contract's `enabled` becomes
the real pointerEvents-derived fact or the duplicate field dies; the three style orphans
deleted with the prose-mention class noted for any future orphan tooling.

**The refutation section is the model.** The lane DISCARDED its own orphan sweep entirely
after its quoting bug returned 135 false positives including a file it had just watched
being imported — no claim salvaged from a broken instrument. Two suspected defects
un-filed after reading (the RED bark genuinely fires on the gesture path; the viewport
sync runs post-gesture where the park is already cleared). The ledger inherits three
refutations and zero hunches.

---

## D99 — nav-overlays final-push hybrid ratified (F5418, F5000, F5802–F5806, 2026-08-06)

**F5418 landed above its own design.** Deleting `sceneKey` from the parameter — not the
guard — made a second scene unNAMEable (TS2353 at the producer), and the deletion exposed
that the entire policy-key vocabulary (`ROUTE_SCENE_POLICY_KEYS`, its type, the authority
map) had NO reader at all: the question the row deferred as "larger" had no consumer to
ask it about. Banked in the same commit.

**F5000 ruled DEAD on a structural clincher, −520 lines.** All three openers converge on
the launch-intent search world (the re-route HAPPENED; it was documented at the policy,
not at the abandoned lane), and the second reading is the kind that ends arguments:
`isParentScopedRestaurantRouteEntry` requires `source !== 'search'` while the only living
producer always sets `source: 'search'` — it could NEVER return true. The row's own
live/dead census inverted under reading: two "live" actions were live-by-syntax only,
always early-returning behind a draft with no writer. And the doc defect that kept the
lane looking alive is the catalogued shape — a comment asserting TWO producers, naming
the dead one FIRST. The lane also correctly widened the blast radius past the row's
scope: stopping where the row stopped would have left a controller whose snapshot is
provably always EMPTY, the same disease one layer up.

**F5806 — APPROVED, priority, and it names a pattern for CLAUDE.md:** `FRAMES_PER_SECOND
= 60` in the momentum rebound spring halves the impulse on ProMotion — the EXACT defect
F889 fixed in reorder-drag-math, recurring in a second location. The fix is the F889 form
(measure the frame delta, never assume it). When it lands, CLAUDE.md's F889 note gains
"found again at a second site — grep for FRAMES_PER_SECOND assumptions when touching any
gesture math."

**F5802/F5803/F5804/F5805 — APPROVED.** A type predicate replaces four `as string`
launders; the closed 2-member enum reaches the client typed (and the copy switch loses
its "Something happened" default — the server side already proves loud-fail); username
normalization gets ONE home (three copies, two already drifted, one contradicting its own
placeholder); availability keyed to the draft it answered for so Save cannot arm on the
previous handle's answer.

32 nav-overlays rows remain; the concurrent-lane STALE rows and one failing suite were
verified by git status to be the D98 lane's in-flight edits, not this lane's.

---

## D100 — mobile-search D98 P3 ratified (2026-08-06)

All seven landed in separate commits, both-direction proofs throughout, 46 suites / 327
tests green. Three outcomes to record:

**F5703 went one branch beyond the design, correctly.** With the supersede cancel
suppressed, a retry whose command channel returns FALSE would have stranded its
still-armed id — a hole the design created and the lane found by reading the park branch
before landing. That branch now resolves `cancelled` exactly once. The exactly-once law
survives every path again, including the one my design would have broken.

**F5705's deletion carries the strongest argument available:** rendered-but-inert is
unrepresentable IN THE COMPONENT (pointerEvents is a pure function of the visibility
boolean; nothing gates between them), so deriving `enabled` would reproduce an
undivergeable boolean with longer provenance — and the consumer's `enabled === true`
conjunct could never contribute. Instrument deleted at the source, conjunct died with it.

**F5850 — APPROVED as a finding with teeth:** `React.useMemo<T>(() => ({...}))` is NOT an
excess-property-check position (probe-verified), so a file whose own header claims the
F1668 inline-literal discipline does not actually have it there. Third instance of the
obvious-typing-gesture-fails class (JSX spread D88, useMemo generic D97, now this) — the
class deserves one home: a short section in CRAVE.md's guard-integrity notes listing the
three known non-checking positions and the working forms. Queued for my next map update.
F5851 (widen the orphan gate to styles keys) approved for the next tooling P3.

Design corrections accepted: the newer-commit park arm's real sequence is
parked/parkSuperseded/parked/replayed (the superseding commit parks in turn — the host is
still unmounted), and the resetSheetToHidden producer attribution moves to the
clear-restore authority. Both now recorded where the next reader will look.

---

## D101 — D99 P3 ratified; F5901 fixed by me; the missing CLAUDE.md entry (2026-08-06)

**All five F580x items landed**, each with the reading that changed something:

- **F5806**: the frame-rate fix matched F889's mechanism found IN THE CODE — because the
  CLAUDE.md entry my brief told the lane to extend DID NOT EXIST. That absence is not a
  detail; it is the causal explanation for the recurrence. The lane wrote the entry with
  both sites named. A law that lives only in a fixed file's history protects nobody.
- **F5805**: the server's own regex dictated the rule — `@` is not in the username
  alphabet at any position, so client-side stripping is LOSSLESS, and the one normalizer
  lives in its own module because the proposed home (users.ts) pulls axios and cannot be
  tested hermetically. "A rule nobody can test is how it drifted."
- **F5803**: the enum crosses the wire typed with a `satisfies` pin at the API WRITE, so
  a new Prisma member fails the api build before any client sees it — and no wire-level
  unknown-string parse was added, deliberately, because it would need the exact fallback
  the row killed.
- **F5802**: the row's proving mutation was REFUTED (the FollowListPanel destination
  accepts null, so those casts were never load-bearing) — the real fix (require the
  param) filed as F5900 with its blast radius, not improvised.

**F5901 fixed by me, and it closes a loop:** the one red test on main was a SOURCE
SCANNER over coordinator ternary text whose subject F4501/D97 moved into the pure
destination module — where the SAME law is pinned behaviorally. The scanner breaks on any
refactor the law survives; the successor breaks only when the law breaks. Deleted with a
pointer; 19/19 both suites; main green.

F5850's non-checking-positions class and F5851's gate widening remain queued; F5900 joins
the P2 queue as a small design (param requires userId; four consumers).

---

## D102 — P2 verdicts on the mobile-search last block (F6000–F6005, 2026-08-06)

**F6000 — APPROVED with its honest cost carried into the P3.** Three mechanisms guard one
suppression, and the render body unconditionally erases the third whenever the first is
false — so the three call sites that suppress WITHOUT setting state have their suppression
undone on the next render, while the two that set state make the ref redundant. The
rederivation deletes the ref and its no-op partner (threaded through four repack memos,
two contract types, two live spec assertions), forcing the three orphan sites to set the
state the lifecycle memo can SEE. The row's caveat is the P3's instruction: this is a real
behavior change on those three paths — the acceptance includes exercising them, and the
sequence-bump remains the actual late-response guard (the lane traced this; the P3
re-verifies it).

**F6001 — APPROVED, unrepresentable rung.** The F1033(b) comment defines the disease and
the fix landed on ONE of two identical siblings; 23 lines below, the other still returns
the discarded field — computed from a state built with `sheetCollapsedSettled: true`
hardcoded on the only reaching branch, making the exported readiness predicate dead while
the real decision lives elsewhere. Apply the same fix; the predicate dies or finds its
real caller; tsc is the proof.

**F6002/F6003/F6004/F6005 — APPROVED.** The six-field snapshot shrinks to its three read
values (three tautological equality conjuncts die with it, plus the unread field whose
only effect is a wake-up that early-returns); the extra dep is deleted with the note that
exhaustive-deps polices MISSING deps only — extra ones are invisible to it (a lesson for
the ledger, not a new gate); the autocomplete cache gets scoped BY ITS KEY (including the
userLocation the request carries) instead of by a clearing effect that is right only
after commit; and the five-storey tower loses its two transform-nothing storeys with the
verbatim-x5 signature getting one home.

**The refutations are the model again, one in each direction:** a five-literal-false
silhouette that is NOT a constant-emitter (live producers found by reading the map
controller), and a frame-budget file that is the COUNTER-exhibit — its header records
deleting a tautological headroom model. Both recorded whole.

**F5851's sweep already ran: zero orphans in styles.ts** — so the queued gate widening is
regression prevention, not a backlog, and its priority drops accordingly. The third
frozen-Dimensions importer instance (SCREEN_WIDTH seeding trackWidth) joins the F2306
escalation's instance list.

**F5900 rides along as READ-ONLY:** the P3 reads the userProfile param's four consumers
(route stack, equality map, URL codec, entry-restore) and reports whether requiring
`userId: string` is mechanical or a design — implementing only if mechanical, else the
report becomes the P2 input.

---

## D103 — D102 P3 ratified; F5900 landed mechanical (2026-08-06)

All seven items, five commits, 50 suites / 335 tests. Ratifications and the round's
corrections:

**F5900's navigation carve-out is RATIFIED.** The scope line excluded navigation/ "except
reading"; item 7 authorized implementing if mechanical. The lane read the tension
correctly, landed the one-file tightening in its own commit, and flagged it instead of
burying it. The verdict rests on all four consumers read (no algebra path mints the
entry; the codec parses only from a present segment; zero producers of getSceneParams
today), and the decisive proof closes a loop: F5802's mutation that COULD NOT go red —
deleting the interactability guard — now fails TS2322. The cast-laundering class in that
corner is extinct at the type.

**F6003's benefit claim is REFUTED and the correction recorded:** the deletion buys
TRUTH, not identity stability — the callback closes over a memo whose dep list re-mints
on every mark regardless. The change was still right; the ledger now says what it
actually bought. A fix's justification is as auditable as the fix.

**F6005 found a stale meta-claim with real consequences:** the hook harness's comment
that the jest project lacks react-test-renderer is FALSE — it resolves and runs effects —
so the row's demanded observable spec became real instead of skipped. Every future
"cannot test here" claim in this territory now has a counterexample to check against.

**F6001's predicate was deleted, not rehomed,** on the right argument: no real caller is
POSSIBLE because terminality depends on surface policy that module never sees. The
sentence moved to where the decision actually lives.

**F6000 landed with specs strengthened, not weakened** — the deleted member's absence is
itself asserted — and the three orphan suppression paths are each composed with the
lifecycle memo and proven to survive a render.

Remaining UNREVIEWED after this wave: ~63 mobile-search, 32 nav-overlays, ~17 api tails.
Final P1 push next; then the CRAVE.md pass (the non-checking-positions section, the F889
class note, this session's arcs) and the terminal report.

---

## D104 — P2 verdicts on the final sweep (F6200–F6212, 2026-08-06)

**F6206 — APPROVED, and the arithmetic was executed, not argued.** The price clamp forces
`high >= low+1`, so any both-handles-between-integers position mints a degenerate `n-n`
corner the ten-entry table does not contain — and the fallback substitutes the WIDEST
range at a fixed 0.250 weight, dragging the blended reel value (1.667 -> 2.000 measured)
into the neighbour crossfade. The fix is free by the lane's own reading: `applyCorner`
already divides by totalWeight, so DROPPING the illegal corner renormalises itself — the
fallback dies rather than being corrected. No spec exists; the proving test is RED as-is.

**F6209 — APPROVED, priority: a wrong search result.** The tie-plurality emit reached four
of five linker lanes; the dense lane computes `tiedTop`, spends it on the argmax, and
drops the plurality — under a comment claiming THE SAME PLACEMENT LAW as every other
lane. The F6001 sibling-hunt instruction paid exactly as designed. Route the dense lane
through the same emit; the comment becomes true.

**F6201 — APPROVED.** F1389's deletion updated only the deletion site; five citations of
the ghost fields survive, including a dev error that INSTRUCTS the reader to consult a
field the comment above says is gone, and the scene-adding guide promoting the ghost to
"the law" at the exact moment someone adds a scene. All five corrected against the code.

**F6203/F6210 — APPROVED (the F6000 stacks):** the twice-spelled default for a parameter
its one live caller never supplies collapses to the outer spelling; the BigInt spot map
superseded by the sanitize edge dies with its schema-forbidden arm.

**F6200/F6202/F6204/F6205/F6211/F6212 — APPROVED as smalls** per their rows: the
single-member discriminant's constant strings; the one-field envelope + zero-caller
restore; the two 25-line freeze mechanisms whose RULE F1324 already collapsed; the cast
that would let [REVEALSYNC] print nil forever; the four zero-reader constructs and four
self-refuting guards.

**F6207's refutation is the standard once more:** `contentOverscroll?` looked dead and
its comment claims "none today" — but a real omitting caller exists; only the
parenthetical is stale. The optional stays, the comment gets the caller's name.

**Vocabulary note ratified:** the lane's PROPOSED/MEASURED rows recorded under the
existing convention rather than inventing tokens — correct; the gate's closed vocabulary
is the mechanism and conventions bend to it, not it to them.

Not reached, named honestly (F6208): the ~40 assembly hooks and the three largest files.
That plus this batch's P3 is the remaining distance to full coverage.

---

## D105 — final-sweep P3 ratified (F6200–F6212, 2026-08-06)

All items landed, 98 suites / 999 mobile + 51/372 api green. Ratifications:

**F6209's mutation explains its own history:** dropping the emit reds ONLY the new spec —
every other suite stays green, which is exactly how the omission survived four sibling
fixes. The wrong search result is fixed and the comment is finally true. The shared
constructor extraction is deferred BY NAME in the ledger, not silently.

**F6206's deviation is RATIFIED (the D103 precedent):** the reel math moved to a pure
module because the proving test was unrunnable inside the Reanimated hook — pure math,
byte-identical behavior, and the lane's caveat is carried forward: this is a sim-look
change, and the OWNER'S EYE remains the oracle on reel feel (CLAUDE.md's law). Flagged on
the owner queue as a look-check, not a decision.

**F6204's shape is the ladder executed:** `useFrozenWhile` with a first-render-initialised
ref means both `?? next` fallbacks DIE rather than go unreachable — deleting one host's
latch was green before; deleting the hook is a compile error reaching both hosts now.

**Two STOPs, both correct:** F6211(c) is a genuine owner either/or (wire the tier into
the diagnostics its comment names, or delete member + comment and let denseTierUsed be
the signal) — filed PARTIAL with the question, not half-decided. And `collapseActiveSheet`
— the twin the design said to census — turned out to carry a DIFFERENT defect than the
one approved (its default is spelled once and live), so it became F6300 rather than a
fold-in. A design's approval covers the defect it names, not its neighbors.

**Owner queue additions:** the F6206 reel look-check; F6211(c)'s either/or.

Remaining to full coverage: the ~40 assembly hooks + 3 large files (F6208), this batch's
residuals (F6300, F6211(c)), then the two consecutive clean passes.

---

## D106 — P2 verdicts on the last-coverage P1 (F6400–F6409, 2026-08-07)

**F6407 — APPROVED, JUMPS THE QUEUE. Dietary filters do not survive a relaunch, and the
drift instrument is blind by construction.** The mirror's value-guard enumerates six of
seven fields, omitting `dietary`; the one write site sits behind that guard; and the
`__DEV__` drift contract cannot report it because the early return skips BOTH the store
write and the `lastMirrored` baseline — the two values it compares stay in perfect
agreement while both go stale. Green precisely because the bug happened: the purest
specimen of this exercise's thesis, found on the final coverage lane. The rederivation is
the D93/F6407-stated one: the guard is DERIVED FROM the record type (keyof enumeration),
so omitting a field is unwritable — and F6409(e)'s sibling (`selectLensRequestFields`,
same disease one dimension over) lands in the same commit. Note for the ledger: this is
CLIENT persistence, engineering — distinct from the F2601 server-policy escalation, which
stays with the owner.

**F6401 — APPROVED.** An unsatisfiable predicate whose `pass("proved shared sheet/nav
motion-plane descent")` has NEVER been earned — both producers hardcode the other
literal, three sibling sites have the correct one. Fix the literal, and the contract must
then actually run RED-able (prove it can fail before trusting its pass).

**F6400/F6406 — APPROVED TOGETHER: the delete-gate's own rot.** An unemittable union
member policed by a 260-char proximity pattern spanning 77 lines, green since written —
inside a gate whose header says proximity assertions are "what rotted." F6400(b) proves
one already retired silently. The fix honors the header: unemittable member deleted with
its four payload restatements (two byte-identical under different names); the proximity
CONTENT_CHECKS convert to the negative-only form the gate's own doctrine demands, or die.

**F6404/F6405 — APPROVED.** Six styles whose whole body sets a default and three
expressing a distinction that does not render — deleted (the "does it do anything" question
now joins the orphan question in future sweeps); the mid-slide law's LAND half gets its
assertion (the defer half alone is half a law), with the `stillPending == null` arm
exercised.

**F6408 — held to its own NEXT ACTION:** the delegated map-controller claims are filed,
NOT attributed; the 2,764-line file gets a first-hand read before any edit. CLAUDE.md's
attribution law, applied by the lane to its own delegates.

**The honest remainder is accepted as the coverage map's final state before residuals:**
62 UNREVIEWED with reasons (25 of them a nav-overlays block never assigned to any lane —
the LAST P1 dispatch), 916 PARTIAL (61 deliberately marking delegated breadth as
unattributed), 34 NEEDS-TRIAGE, 5 OWNER-DECISION.

---

## D107 — D106 P3 ratified; the delete gate is red on main and CI knew (2026-08-07)

**F6407 landed with the vacuity MEASURED as a three-row table** — shipped guard: store
stale, drift contract green-because-the-bug-happened; baseline advanced alone: drift RED;
fixed: correct and silent. The baseline now advances unconditionally because it is the
INTENT record, so a field the guard fails to write surfaces as store-vs-intent drift on
the next publish. F6409(e) landed as compile-time totality (every lens dimension projected
or explicitly LANE-OWNED with its reason) rather than inventing wire fields — the honest
repair when payloads are already byte-identical.

**F6401's fix was proven failable before its pass was trusted** — a fully conforming
sample previously printed "did not prove" (the predicate was unsatisfiable), and a
violating one now FAILS. **F6400's converted check RED-proved itself on the lane's own
deletion comment** — the first time that check has ever been able to fail, firing on the
banned name in prose the moment it existed.

**F6406's STOP is accepted and re-scoped:** the census found 51 proximity checks, not ~5,
and ~35 are pure co-location claims with NO bannable residue — "convert or die" would
delete 35 design laws unrehomed, which the row itself forbids. Owner scoping question
now properly sized, with the forcing-function shape specified (an F1792/F1793 sibling
that cannot land until the population drains).

**F6500 escalated to a live investigation:** the delete gate is RED on main for three
checks and CI's no-bypass-search-runtime job IS failing — masked by the separately-red
build job, which means a second red job drew no eyes. Verified myself without the pipe
trap (real exit 1). The attribution lane is answering, per check: did the SUBJECT move
(this exercise's renames) or did the LAW break (a runtime regression) — with the map
check under the owner lock if its law looks broken, and the red-duration answer sizing
the finding.

---

## D108 — P2 verdicts on the truly-final coverage lane (F6600–F6623, 2026-08-07)

**F6619 — VERIFIED MYSELF, APPROVED IN TWO PARTS, and the defect is MINE to own.** The
root-ownership gate — whose invocation and exit codes I hardened twice in F2510 — exits 1
on HEAD because a check asserts the EXISTENCE of chip-read-model-builder.ts, which D78/F3900
deliberately deleted; and its six budgets (max 70–238) all aim at index.tsx, measured at
87 lines, while the hook mass lives in 689 files next door. I re-checked the mechanism
twice and never re-checked the AIM. Part 1 (now): remove/update the stale-path check so
the gate runs — the deletion it fails on was ratified, so the check updates to the
successor shape (search-filter-chip-state.ts) or dies with a reason. Part 2 (design): the
budgets' aim is a real question — retarget at the layer that actually holds the mass, or
retire the ratchet with its history recorded. That is a design against the 689-file
reality, not a patch; it returns to P2 with the lane's own measurements as its input.

**F6601 — APPROVED.** The profiler's off-switch computes the right predicate one layer too
late: `ProfilerOnRenderCallback | null` returned unconditionally means React.Profiler is
permanently mounted and ~12 "disabled" branches across 8 hosts are dead. Hoist the
predicate to mount time; the dead branches die.

**F6600/F6604/F6609/F6622 and the batch — APPROVED** per their rows: the comparator fix
that never reached its diff-marker twin (already re-diverged both directions, the export
for the job having zero importers — the F6001 class again); the "byte-frozen" oracle
edited in lockstep with its subject plus an assertion entailed by its return type; the
DATABASE_URL guard in 3 of 4 siblings; `.filter(() => type !== undefined || true)`.

**F6618 — ESCALATED (owner, legal-adjacent):** the privacy policy discloses IDFA
collection the app does not do and omits Cloudinary. Words about data practices are the
owner's; the diff between policy and reality is the deliverable, and it is on the row.

**The refutations again carry their weight,** including one refuted BY THE LANE'S OWN
COMMIT (the glob it suspected inert had just matched its own nested path) — corrected on
the row rather than deleted, which is the honesty norm applied to one's own filing.

**Coverage floor reached:** 14 UNREVIEWED — 4 held by another session's dirty tree
(named), 10 the staleness gate's own sanctioned reverts from a concurrent lane's churn.
Everything else in the repo is terminal or honestly PARTIAL with its gap named. The listTests
observation (zero integration specs in the default jest run; they ride `yarn test:db`,
which CI DOES run at ci.yml:157) is recorded as verified-fine.

---

## D109 — the three red checks attributed; the CI wiring was never decorative (2026-08-07)

**All three: subject moved, law intact, map untouched.** And the sizing answer changes the
finding's meaning: red for ~26 HOURS, not weeks — `no-bypass-search-runtime` was green
through 01:23Z and first red at 01:46Z on the offending push. The F702/D37 wiring FIRED
IMMEDIATELY. What failed was the READER: the build job was separately red on main, so the
one job that changed state was invisible. F6552 records the real lesson — a
permanently-red pipeline doesn't just hide its own job, it blinds every job beside it.
The fix for that is the one already escalated: the lint file the other session holds.

**Check 3's attribution found a deeper rot than the triage guessed:** the regex matched
two COMMENTS narrating a ratified deletion (the gate forbade DESCRIBING cleanup), while
its `runOne` alternatives were unmatchable against any identifier — trailing `\b` cannot
fire inside `isRunOneFreezeActive`. It could catch prose but not code: the inverse of
every scanner defect this exercise has fixed. Rewritten to match identifiers including
suffixed revivals, RED-proven, and the re-added prose stays green — the rot is gone, not
just the symptom.

**The lane also REJECTED the row's proposed general fix with the right argument:**
stripping comment lines gate-wide would shift the `{0,N}` proximity distances of most of
the 203 checks — a global mutation to repair one bad regex. Local fix, global question
left to F6406's owner scoping where it already lives.

**Check 2's repair honors the gate's own doctrine:** the deleted lane's assertion moved
to the NEGATIVE form; the two positives that remain are kept KNOWINGLY (they are the only
enforcement of an unspecced law) and filed as F6551 rather than carried silently.

**Gate state: 0 on HEAD, 203 content + 55 path checks, four planted-defect RED proofs.**
The lane's caution stands: concurrent lanes caused one transient false-red and one
clobbered ledger edit — a FINAL QUIESCENT GATE SWEEP runs after the three active P3s
land, before the clean passes begin.

---

## D110 — F6619p1/F6601/F6600 ratified; a stash violation and a mechanism gap (2026-08-07)

**Both departures RATIFIED — each caught an inconsistency in MY brief.**
F6601: my brief said "delete the dead branches", which is option (A) and contradicts the
row's ratified option (B) it cited — under (B) the null return makes those branches LIVE,
and deleting them would leave `<Profiler onRender={null}>`. The lane implemented the
design, not my restatement of it, and flagged the conflict. The blast radius was also
~45 sites across 18 files, not ~12/8 — measured, corrected on the row.
F6600: derived-not-deduped, and the argument improves the row — the exported key array
was a SECOND NAME for the same list, and a second name is precisely what makes divergence
writable again. Deleted; the marker iterates the comparator's own keys; net −77 lines.
The lane also corrected a mutation claim in its own docstring after RUNNING it and
finding it green — the standard applied to one's own prose mid-flight.

**F6619 Part 1 landed:** all seven declared paths re-verified, one stale, gate 0-on-HEAD /
1-on-bogus / 1-on-planted-stale-path. Part 2 (the aim) remains explicitly OPEN.

**THE VIOLATION, recorded in full: the lane ran `git stash`** (a malformed invocation),
sweeping three sessions' uncommitted work. Recovery was disciplined — zero-clobber rule,
16 files restored, 4 skipped as newer, stash retained as the recovery path, the one
unresolvable file saved aside and handed to its owning lane (messaged before it commits).
**The mechanism gap is real and must be stated: git has NO stash hook.** The LANE_PATHS
fence guards commits; nothing can guard a stash. The ban stays convention, now with a
proven recovery procedure attached (zero-clobber + retain the stash), and the brief
language gains: `git stash` in ANY form including `stash list` variants is the one
irreversible-risk command with no mechanical fence — treat the string itself as
forbidden.

Numbers at this landing: 150 suites / 1468 mobile tests, both ledger gates green,
ownership gate green. The 1450→1468 delta between the lane's runs is concurrent churn,
attributed not assumed.

---

## D111 — tooling residuals ratified; the scanner earned trust the only honest way (2026-08-07)

**F4601's scanner was shaped by its own false positives, and that is the point.** Three
report-only runs each forced a design correction — platform types excluded, credits keyed
by property SYMBOL so the compiler's own unification of aliases/intersections does the
work, `getRootSymbols` so a mapped-type comparator 600 lines away still credits its
source. Calibrated against the real F4101 family restored from pre-fix blobs (found all
provable shapes; the one non-calibratable case is NAMED, with why). Live-tree run: 11
candidates, 11 verified genuine — zero false positives — and TWO of the eleven were
already declared dead in the code's own comments while their types still carried them.
**--check exists, is proven, and is deliberately UNWIRED** because the tree holds those
11: a gate that lands red is what this repo keeps learning not to ship. F6900 queues
their deletion with the wiring point named. That sequencing — earn the gate, then drain
the population, then wire — is now the house pattern (third use).

**F5851's gate falsified the hand sweeps it was meant to merely freeze.** Two manual
sweeps reported zero orphans over 153 keys; both credited bare `styles.<key>` hits in
files that own a SAME-NAMED key on their own local StyleSheet and never import the
module. The gate found 20 dead keys behind that shadowing — verified by hand, deleted,
−115 lines — and its comment-mention mutation stays RED. The stripper replica count went
DOWN (moved to scripts/lib, both gates import it, the hook-names gate re-proven after
the move). Regression-prevention tooling that pays for itself on day one.

**F6405(b)** landed with the demonstration the old assertion could only show green.

F6900 (drain the 11, wire --check) and F6901 (pre-existing styles warnings) queued.

---

## D112 — final residual rulings; the board is quiescent (2026-08-07)

**The api lane's landing is ratified**, including three judgment calls that were each
correct: the second-copy alert over the unapproved shared writer (a money path takes the
approved shape, with the remaining debt stated); the F4000 triage that SPLIT (kind-grain
already correct — the measured reason the dialect survived three audits — echo leg
inflating scores 43%, fixed through the builder); and the F6609 deviation (the prescribed
vacuous throw would have relocated vacuity into a permanently-red case — the spec mints
its own witness instead).

**F6604(a) — RULED: frozen DIGEST plus frozen readable SAMPLE.** The lane's numbers
(24,200-row domain, 1.78MB artifact) rule out both the full frozen golden and any shrink
that re-derives the implementation. The design: freeze a content hash of the complete
derivation output (drift of ANY row fails, nothing re-derived) plus a small frozen
human-readable slice for debuggability. Queued as a P3.

**F6800 — census-first P3:** if no caller passes echo kinds, route the fifth dialect
through the builder plainly (the tension is theoretical); if one does, the semantic
question escalates with that caller as the evidence.

**F6801 — recorded as an understood limitation, not fixed:** the DATABASE_URL guards are
dormant wherever `.env` exists because @prisma/client injects it at import — the guard's
real population is a machine with neither `.env` nor env var (fresh clone, misconfigured
CI), which is exactly the case it was written for. The four rows gain that sentence so
nobody re-audits a guard as dead that is merely rarely-armed.

**F6802 was the mechanism working:** a prose toucher awaiting its classification — the
scanner's failure IS the design review, and the review is now written.

**Two incidents on the record:** the hard reset (ANOTHER session's, destroying uncommitted
work across lanes mid-flight; this lane's backups saved its items, and no fence of ours
can guard against another session's reset — recorded as an environmental hazard, not a
process gap of this exercise), and the F6609 stash-file merge resolved cleanly (the
committed version is a strict superset; nothing lost).

Board state: ALL LANES QUIESCENT. Next: the full-gate quiescent sweep, then the clean
passes fan out.

---

## D113 — the oracle lands; F6800 ruled by the doctrine's own text (2026-08-07)

**F6604(a) ratified.** The digest is proven a pure FUNCTION OF THE TABLE (bless under a
mutation, restore, re-bless — the original digest returns), drift the sample cannot see
is caught (mutation 1: digest RED, slice green), and bless refuses without the flag,
printing both digests — a visible act, never a side effect. The lockstep-editing disease
is dead: 24,200 rows cannot be edited in agreement unknowingly. The self-reported
`git stash list` slip is recorded: read-only, letter broken, spirit intact, no stash
touched — the D110 language stands and the report is the compliance.

**F6800 — RULED, not escalated, because the doctrine already decided it.** The census
found a live caller passing an echo kind ON PURPOSE (autocomplete's attribute-support
lane), and signals.service.ts:65-67 states in the ECHO doctrine's own words: kind-FILTERED
readers keep reading echo rows directly — "there the echo IS the act being asked about."
`kinds` is a LANE SELECTOR WITHIN the law, not an exception to it. Verified the text
myself. The mechanical P3 is approved as the lane pre-derived it: route through the
builder with `echoKinds` applied ONLY when `params.kinds` is absent, plus the missing
`subjectScope: 'entity'` filter unconditionally (no caller defends its absence).
Acceptance: the F4000 mutation shape for the default path; the autocomplete
echo-kind path asserts echo rows still flow when explicitly selected.

---

## D114 — both bedrock designs APPROVED; the proximity class was inert since birth (2026-08-07)

**F7201 (the ratchet's aim) — APPROVED as proposed.** The provenance answers the bedrock
question: a CONCENTRATION law, born when index.tsx was 6,211 lines / 71 effects — and the
law WON (87 lines, 0 effects; the budget satisfied structurally). The surprise is the
finding: measured against birth actuals, FIVE OF SIX budgets were slack the day they were
committed — the famous 101→97→70 descent was a ceiling drawn above the ceiling, never
once capable of failing. The rederivation is right because it re-derives the SUBJECT: a
concentration law names a tree, not a file; the quantity is a max over files; a failure
names its own argmax. Budgets 6 and 16 at ZERO headroom, from measured actuals — a
ratchet with headroom is the defect being fixed. The non-zero witness generalizes F2510.
The kept absence-bans, the named ban-rescoping follow-on, and the deliberate refusal to
invent an LOC axis are all ratified as scoped.

**F7200 (the 41 proximity laws) — APPROVED, and it dissolves the F6406 escalation.** The
premise moved under proof: the gate's rg loop lacks `-U`, so every proximity check matched
LINE BY LINE — `{0,900}` was characters within one line, and the shapes cannot occupy one
line in formatted TypeScript. **The entire class has been inert since it was written**;
its only two firings ever were on comments. The classification (17 ROTTED / 10 HISTORY /
14 LAW, with 3 of the 14 being dependency rules whose ideal home is an import
restriction) turns the owner's blind either/or into a 14-item rehoming question. The
global `-U` mutation is approved BECAUSE it is measured — exactly three new matches, all
already in the delete bucket — with the per-check RED proof mandatory before any pass is
trusted, exactly as the proposal itself demands.

**P3 sequence approved:** (1) delete the 17 on their evidence; (2) convert the 10 to
negative bans, RED-proving each; (3) add `-U` and RED-prove each of the 14 by planting
its forbidden co-location, demoting any that will not fire; (4) the 3 dependency rules
move to import restrictions (the one-block law applies); (5) implement F7201's
`max_per_file_in_tree` kind with the measured budgets and the argmax-naming failure.
The remaining 11 live proximity laws stay as NOW-WORKING behaviour guards with rehoming
recorded as the named follow-on — a working guard beats a dead one, and the ladder climb
continues from a functioning rung.

**F6406 closes into F7200's sequence. The owner's scoping question is WITHDRAWN from the
escalation queue** — the evidence made the decision mechanical.

---

## D115 — F6900 ratified; two P3s remain before the clean passes (2026-08-07)

**F6900 landed at the standard.** The re-derived candidate list matched D111's eleven
exactly (the tree had not moved — stated, not assumed). The deletions cascaded UPWARD
correctly: a forwarded-only ref died at its leaf and took the type member, the runtime,
and the supply site with it; the F1064 `Omit` that stopped two keys short of its own
comment's claim became a `Pick` with the comment recording the correction. The scanner's
--check is wired with the full earn-then-drain-then-wire history in its CI comment, and
the house pattern completes its third instance. 1471/1471 with one ts-jest load flake
(green on rerun, no assertion failed — the D76-documented shape).

Remaining before clean pass 1: the D114 sequence (F7200's 17-delete/10-convert/-U-prove
+ F7201's max_per_file_in_tree) and D113's F6800-mechanical. Both dispatched.

---

## D116 — F6800 ratified; the fifth dialect is dead (2026-08-07)

Landed exactly per D113, and the conditional's spelling came from the BUILDER'S SIGNATURE
rather than an invented flag: `echoKinds` is a kind list, so the honest form is an empty
list when a caller selects lanes explicitly (`<> ALL('{}')` vacuously true) — the law
carried by data shape, not by a boolean. Both mutations bracket the semantics: the
restored hand-rolled SUM inflates the echo case +77%, and the unconditionally-applied
exclusion ZEROES autocomplete's attribute-selection lane out of the map entirely — the
exact harm the census-first STOP predicted and the doctrine-text ruling avoided. All five
daily-acts dialects now route through the one builder. One P3 remains (the D114 gate
sequence); clean pass 1 fans out on its landing.

---

## D117 — the D114 sequence lands; all approved work is terminal; clean passes begin (2026-08-07)

**Ratified with three deviations, all correct:** 8 conversions not 10 (two of the ten WERE
two of the three dependency rules — handled once, not twice); one ban tightened against
measurement (the bare form has one legal live call — the ban is the exact killed form);
and **F7300, which is mine to own**: my D114 summary said the three new `-U` matches were
"all in the delete bucket" — the third was a RESIDUE check F7200 explicitly declined to
classify, and executing my summary literally would have shipped a red gate. The lane
measured before trusting, caught it, resolved it on F7200's own residue data. Third
instance of a summary outliving its measurement; two of the three were mine.

**The scoreboard:** 22 checks RED-proven in one pass (9 bans + 13 laws), ZERO demotions —
every law fired on its multi-line planted shape, the shape that was invisible for the
class's whole prior life. The dependency rules landed as import restrictions (strictly
stronger: `runOnUI` is live in seven other modules, so only a file-scoped rule can express
the law). The concentration ratchet watches the TREE with zero-headroom measured budgets
and names its argmax. Delete-gate 203→183, ownership 27→23, six theatre budgets retired
WITH their birth measurements recorded.

**All approved designs are now implemented or formally closed. CLEAN PASS 1 BEGINS.**
Charter per territory lane: fresh-eyes re-hunt (zero new findings = success, reported
honestly either way); close the remaining UNREVIEWED residue reachable in its territory
and any PARTIAL whose named gap is readable; every full-suite invocation captured
`> file 2>&1` (F6803 protocol); no re-litigation of terminal rows.

---

## D118 — clean pass 1, lane 1: NOT ZERO, and F7500 is the exercise's gravest find (2026-08-07)

**F7500 — APPROVED FOR IMMEDIATE P3, with the escalation analysis stated rather than
skipped.** The scope builder ORs every person-bearing column and hands the OR to DELETE,
so one column's `delete_row` ruling OVERWRITES the other columns' declared rulings. Two
live instances: erasing P deletes THIRD PARTIES' collaborator rows on other people's
lists whenever P sent the invite (against a declaration reading "the invite survives on
someone else's list; who sent it does not"), and a reporter's purge deletes the safety
record ABOUT a still-live third party at a horizon never that record's. Why this is a P3
and not an owner escalation: the DECLARATIONS are the owner's prior rulings, and the code
overwrote them — the fix IMPLEMENTS the rulings as written (per-column scoping: delete_row
where the delete_row column matches; null_column for the column whose ruling is
survival-without-attribution), making erasure STRICTLY MORE PROTECTIVE of third parties.
The F4936 precedent applies: strictly protective changes to the data layer notify the
owner, they do not wait. Acceptance: BEGIN/ROLLBACK proofs on the real corpus for both
instances (P's own rows erased per ruling; the third party's row SURVIVES with P's
attribution nulled; the safety record survives the reporter's horizon), plus the erasure
integration specs extended to pin both. The coverage allowlist sentence that bought the
blindness ("No invites in the dev corpus") is corrected, and the empty-table-buys-an-
allowlist-entry pattern is recorded as a lesson on that spec.

**F7501 — APPROVED with F7500.** `contradictions()` structurally returns [] (its filter
excludes the only verb that could contradict) under a spec asserting emptiness — the
instrument for exactly F7500's second instance, blind by construction. Fix so it can see;
its spec must show a contradiction when one exists (RED under the restored filter).

**F7502/F7503 — APPROVED.** The one-line tiebreak with its honest blast statement; the
log-mode spec asserts the record that is log mode's only product.

**The pass verdict:** lane 1 is NOT clean. Per the mandate, pass 1 restarts after these
land. The lane's disc
---

## D118 — clean pass 1, api-core: NOT CLEAN. F7500 erases third parties. (2026-08-07)

**F7500 — VERIFIED MYSELF, ESCALATED (user-data lifetime), with a loud-fail guard approved
NOW.** `person-data-scope.ts:subjectRows` ORs every person-bearing column of a table and
hands the OR to DELETE. But `person-data-class.ts:67-72`'s own doctrine states delete_row
is a PER-COLUMN verb — each column scopes its OWN delete — and the allowlist declares
`user_list_collaborators.invited_by_user_id` as SEVER: "the invitation survives for the
OTHER collaborators, minus who made it." The emitted `user_id = $1 OR invited_by_user_id
= $1` DELETE instead removes the whole row: erasing the inviter deletes third parties'
collaborator memberships on OTHER people's lists. Second instance on `user_reports`: a
reporter's purge deletes the safety record ABOUT a still-live third party at a horizon
that was never that record's. I verified the contradiction between the declaration and
the emitted SQL directly (the allowlist text at spec lines 54-55 says the OPPOSITE of what
the code emits). It escaped because the dev corpus has no invites — the empty table bought
a human-declaration allowlist entry whose sentence is backwards.

THE SPLIT (the F4501 pattern for a data defect): the CORRECT erasure semantics — does the
sweep DELETE only on delete_row-declared columns and SEVER (null) the sever-declared ones,
producing per-column statements the doctrine already describes — is engineering, and the
fix is deriving `subjectRows` from the per-column DISPOSITION rather than OR-ing all
person columns. But it CHANGES WHAT AN ERASURE DOES to real user data (third-party rows
now survive that are deleted today; a live safety record now persists), so the switchover
is the owner's call on a legal-compliance surface. APPROVED NOW as engineering, not
policy: a loud-fail assertion at the sweep — if a table has a person column whose
disposition is NOT delete_row and that column is being OR'd into a DELETE scope, THROW at
construction naming the table and column. That makes the current silent over-deletion
IMPOSSIBLE to run unnoticed while the owner rules the semantics. Mutation: the assertion
fires on user_list_collaborators today (proving it catches the live defect); it stops
firing only when the scope is per-disposition.

**F7501 — APPROVED (the guard-that-cannot-fail, in the erasure tooling itself):**
`RetentionHorizonService.contradictions()` is structurally always `[]` (retain is not in
ACTING, so ruleWhere returns null for every rule the filter sees), with an it-block
asserting that emptiness — and the contradiction it is NAMED to find is LIVE one level up
(F7500's user_reports instance). The instrument commissioned to catch exactly this class
cannot. Rederive it to see the disposition conflict F7500 exposes; it must go RED on
user_reports today.

**F7502 — APPROVED.** Offset pagination on non-unique createdAt (Postgres now() is
txn-stable) — the F1902 family, one producer today, becomes real on the first batch
producer. Unique tiebreak in the cursor.

**F7503 — APPROVED.** Log-mode's only product is the record and nothing asserts it (the
logger double returns a fresh object per setContext so it couldn't) — deleting the
logger.info leaves the suite green. Key the double and assert the record.

**Clean pass 1 is INVALIDATED for a re-run** once F7500's guard + F7501/F7502/F7503 land —
the pass restarts against the fixed tree, per the mandate. This is the loop working: the
fresh-eyes re-hunt found what four coverage passes over this territory did not, because
the empty table had bought an allowlist entry and nobody had evaluated the DELETE it
emits against the declaration it cites.

---

## D119 — clean pass 1, api-search: NOT CLEAN. F7600 breaks its own fold law on 20% of labels. (2026-08-07)

**F7600 — VERIFIED MYSELF, APPROVED (schema rederivation).** `scanForKnownEntityGroups`
states the N1 FOLD SYMMETRY law in its own header — both sides canonicalFold'd, citing the
1,714 entities that were unreachable before — and the ALIAS arm honors it correctly
(`ea.form_folded = ANY(folded candidates)`, and `entity_alias` carries a `form_folded`
column + indexes, schema:167/184-185). But the LABELS arm (:1366-1370) does
`LOWER(el.form) = ANY(folded candidates)`, and `EntityLabel` (schema:194) has `form` with
NO folded column. So a folded candidate `cesar` is matched against `LOWER('ensalada
César')` = `ensalada césar` and cannot equal it. The lane's measurement — 2,262 of 11,068
active labels (20.4%) structurally unmatchable, overwhelmingly the Spanish rows the arm
exists to serve — is the corpus proof. The repo states this exact law in prose one module
over (demand-vocabulary: "lower('Crème Brûlée') would never equal stored 'creme brulee'").
REDERIVATION: `EntityLabel` gets a `form_folded` column (the alias table's exact shape,
same index), written by canonicalFold at every label write site (the sweep + seeder), the
match arm compares `el.form_folded = ANY(candidates)`, and the migration backfills
existing rows. This makes the asymmetry UNREPRESENTABLE — a label without a folded form
cannot be written — rather than fixing the query alone. Migration under the
parallel-worker guard (F303/F2163). Acceptance: an es label (`ensalada césar`) is reachable
by its folded candidate; mutation: the pre-migration `LOWER(el.form)` form misses it.
ESCALATION NOTE: this is data-shape, not policy — a NEW column and backfill on a table
whose writes are the vocabulary pipeline; it is engineering, but the backfill touches the
label corpus, so the OWNER is notified of the one-time re-fold, not asked (it only makes
more labels reachable — strictly additive to recall).

**F7601 — APPROVED.** `openNowFilterMs = 0` literal forwarded into phaseTimings — a
constant instrument (F2901 family). Measure it or drop the field; the three other
zero-constants the lane triaged and REJECTED with reasons are the discipline working.

**F7602 — APPROVED.** The seventh non-unique ORDER-BY-under-LIMIT site (`matched_tags`,
builder:603), same shape as F3802's five and F3807's one — the sibling hunt's standing
value. One-line tiebreak.

**The lane's clean confirmations are half the value:** the F3801 DISTINCT ON fix complete,
F3807's cap reproduced to the exact row (11,141) against the live corpus, the Prisma.join
sweep STILL zero, all 14 new specs input-keyed, and 288 backticked comment identifiers
scripted for non-comment survival — zero ghosts. The territory is sound except the three.

Clean pass 1 restarts on the api-search fixes too (F7600 gated on its migration).

---

## D120 — clean pass 1, mobile-search: NOT CLEAN. F7700 disarms the recovery it promises. (2026-08-07)

**F7700 — VERIFIED MYSELF, APPROVED.** The dismiss motion plane's `useLayoutEffect`
(:618) deps on `observeDismissMotion`, which deps (:274-275) on the two `notifyClose*`
callbacks the sole caller passes as INLINE ARROWS — fresh every render. So mid-dismiss,
any re-render runs the cleanup (`clearDismissMotionBoundaryTimers` at :624, clearing BOTH
the 420ms watchdog and the F1041 1200ms recovery deadline), then re-registers and
re-invokes `observeDismiss` — which hits the idempotent early-return (:427-433, same
active transaction + motion in progress) BEFORE the two arm calls at :438-439. The timers
are cleared and never re-armed. The module header says it "RECOVERS, always"; a single
mid-dismiss re-render makes it unable to. Read end to end across the three files and the
early-return/arm ordering confirmed directly.
REDERIVATION (the ideal, not a patch): the registration effect must not churn on callback
identity — the arming is a property of the TRANSACTION, not of the render. Either (a) the
caller memoizes the two callbacks (fixes THIS site but a third caller can forget — a
convention), or (b) THE CORRECT ONE: the effect deps drop to the stable observation
identity and the callbacks are read through a ref, so re-registration cannot disarm a live
transaction because re-registration no longer HAPPENS on callback identity. Rederive to
(b); the timers arm on transaction start and clear only on transaction END or unmount.
Mutation: a forced re-render mid-dismiss (bump an unrelated prop) must leave both timers
armed — RED today, GREEN after; the F1041 recovery must still fire on a stalled boundary.

**F7701 — APPROVED (the F6400 red-team's blind spot, named).** Four provenance literals
hardcoded in the one producer's emit, so `badDismissNavSource` can never differ from its
own literal — its `pass` is unearnable. F6400 asked "is the name consumed?" and never "CAN
THE CONSUMPTION FAIL?" — the deeper question for every positive contract assertion. Either
the check gains a second producer to disagree with it, or it becomes a type (the literal
is the only legal value → make it the type and delete the runtime check). Read the contract
to choose; a check that cannot fail is deleted or made failable, never kept.

**F7702 — APPROVED with the lane's own caution honored.** `boundaryY`/`collapsedY` are one
shared value under two names (fifth instance of the F6400 alias class), BUT the `+ 8` band
in the handoff assertion may encode a real threshold the alias is hiding — so the P3 READS
whether the two names were ever meant to differ: if the band is real, the names become two
DISTINCT values with the offset made explicit; if not, collapse to one. Not a blind
dedupe.

**The lane's HELD verdicts are the pass's real product:** F5703's retry (including the
gesture-during-retry hole re-checked), both halves of F6407, F4800's zero `.includes`,
F6206's renormalisation, F6000's collapse — all verified holding TODAY, months of this
exercise's own fixes re-confirmed under fresh eyes. Five reverted rows closed with fresh
reads.

Pass 1 restarts on mobile-search too after these land.

---

## D121 — clean pass 1, mobile overlays/nav: NOT CLEAN. F7800 reopens a row this exercise closed wrong. (2026-08-07)

**F7800 — CONFIRMED, REOPENS F4700, APPROVED.** F4700 was marked FIXED (D97) after
repairing ONE spec's `virtual: true` mock — but the disease is live on main: four
`virtual: true` mocks of the REAL react-native module survive, and the jest
`moduleNameMapper` is EMPTY (verified — F4700's approved repair (b), map react-native in
the mapper, was never applied). The lane measured RED deterministically three ways (a full
run reds 1-in-6 with react-native/index.js:27's exact signature; a specific trio
`--runInBand` reds 8/8; parallel and each-alone green — the load-order signature). This is
the sharpest self-correction of the exercise: a row closed on a partial fix, its own
close-condition (D97's twenty-green bar) satisfied only because the flake is load-order
dependent and twenty sequential greens can miss it. REDERIVATION: the four remaining
`virtual: true` on real modules become real mocks (drop `virtual`, or `moduleNameMapper`
the module — read each to choose), AND the flake gets a real gate: the `--runInBand` trio
is a ready-made RED-before/GREEN-after. Wire it or a broader deterministic-order run so the
class cannot silently return. F4700 -> reopened -> folded into F7800's fix.

**F7801 — APPROVED (the F5000 collapse stopped at the union).** After the restaurant-route
source union collapsed, `createRestaurantRoutePanelDraft` always returns an object, so
`panel` is permanently non-null while its type still says `| null` — eight sites written
for an unreachable state (the F4507/F5405 shape: a spec/branch of a state production cannot
reach). Narrow the type to non-null; the eight guards die by compile. Mutation: re-adding
`| null` is dead-branch-flagged or the guards read as unreachable.

**The lane VERIFIED NINE of this exercise's landed fixes standing today** — F4501's
fail-open closed, F5418's unNameable scene, F5000's deletion, F4502's drift-proof contract,
F5405, F5806's time-carrying math, F5805's one username home, F6601, F6407 — each re-read
in full. That is the clean pass's core deliverable even where it found F7800/F7801: the
prior work HOLDS, and the two new findings are a partial-fix reopening and a
collapse-residual, not regressions.

Four of five pass-1 lanes reported; all four found real work. Pass 1 is NOT clean and
restarts after the F75xx/F76xx/F77xx/F78xx fixes land. The gate self-audit lane remains.

---

## D122 — clean pass 1, gate self-audit: the highest-yield lane, as history predicted. NOT CLEAN. (2026-08-07)

The tooling audits itself last, and it found four holes — three in the gate machinery, one
the CI root cause. Every one of the ~20 gates RED-proved on a planted mutation; the five
Fable-era proof-holes stayed closed. The findings are where the gates DON'T reach.

**F7900 + F7902 — FIXED BY ME (both clean), the containment fence's own two holes.** The
gate was RED ON MAIN unobserved (a `bless` class it didn't define + a header on the wrong
line), and its `find` was blind to `.mjs` — so all nine mjs CI gates plus scripts/lib
could be added unclassified, the exact condition the gate exists to prevent, in the gate's
own file type. Added `bless` and `library` as NAMED classes (the vocabulary grows to name
real kinds; only silent defaults were ever forbidden), fenced `.mjs`, headed the eleven
surfaced files. 67 scripts classified, RED-proven. The fence now guards its own kind.

**F7903 — the CI root cause, handed to the owning session (dirty file).** `yarn lint` is
RED on main: 2 errors in `apps/api/scripts/job-control.ts`, one a violation of the repo's
OWN env-flag ban — introduced by the F420 fix whose entire point was to move the file into
the lint project, which verified with tsc and never with lint. This is F6552's mechanism
proven: a red build job masks every job beside it, which is why the delete-gate red went
26 hours unseen. Fixing it un-blinds CI. Messaged the owning lane; if unclaimed, I take it.

**F7901 — APPROVED (a gate covering half its mandate).** check-lint-ban-inheritance's
BASELINE file carries one of the two F2050 bans; the SKELETON LAW ban (ActivityIndicator
in panels) is an override-only ADDITION, so a later override can delete IT with the gate
green — the exact class the gate exists to catch, on the exact ban that motivated it.
Demonstrated live by the lane. FIX: the baseline must carry BOTH bans (add a second
baseline probe whose scope includes the panel ban, or assert the union of all F2050 bans
as the floor). A gate whose baseline is a subset of what it guards cannot guard the
remainder. P3.

**The census + spot-checks are the pass's clean half:** every ci.yml step resolves (no
F2143 dangling), 5 laws have live mechanisms, 5 IDEAL-VERIFIED configs hold exactly, the
D68 MVCP correction is accurate in code. One recorded-not-filed: COVERAGE's status column
has no closed-vocabulary gate (FINDINGS got one in the ledger gate); 2 rows already
drifted off-vocabulary, invisible to staleness. Filed as the F7900-adjacent observation
for a P3 — the ledger gate's own sibling gap.

**PASS 1 COMPLETE, NOT CLEAN: all five lanes found real work** (F7500 escalated + guard,
F7600 schema, F7700 timer, F7800 reopened-flake, F7801 collapse-residual, F7901 half-gate,
F7903 CI-root, plus the smalls). This is the loop's verdict that the tree was not yet
clean — exactly what the pass is for. Next: batch the approved P3s (grouped by territory),
land them, and PASS 1 RESTARTS against the repaired tree.

---

## D123 — flake+gate remediation ratified; F4700 truly closed this time (2026-08-07)

**F7800 ratified, and the lane corrected the DESIGN.** "Drop all four virtual mocks" was
wrong for one: `scene-load-failure-policy.spec.ts` targets a `.tsx` the hermetic node
lane's moduleFileExtensions deliberately excludes, so it is UNRESOLVABLE by design and
virtual is the CORRECT tool (no ESM-load flake is possible for a module that cannot
resolve) — proven by `Cannot find module` on the drop. The design delegated "read each to
decide"; the lane did. The real fix is config-level: a `^react-native$` -> stub mapper so
a transitive RN import from any directory resolves to a union stub, not untransformed ESM.
The GATE is the part that makes F4700 stay closed: `yarn test:inband` (jest --runInBand)
as a CI step, because the parallel run CANNOT catch a worker-order regression. Verified
MYSELF: in-band trio green, 3/3 parallel green here (lane reported 6/6 on the 1-in-6
flake), and the gate RED-proven — the disease reds the in-band run while the parallel run
stays green, the exact contrast that motivates it. F4700 was closed on a partial fix once;
this time the close-condition is a gate that can show RED on the load-order axis, not
twenty greens that a load-order flake can slip through.

**F7901 ratified.** A frozen `SCOPED_FLOORS` requires BOTH F2050 door-lock bans over the
panel + Button scope, asserted directly rather than derived from a live config a later
override could shrink in lockstep — the fix for a gate whose baseline was a subset of what
it guards. Both bans RED-proven; dropping ActivityIndicator stayed green BEFORE (the
defect) and reds now. Gate green on HEAD.

**F7701 correctly STOPPED on the overlap the brief anticipated** (its file is F7700's), with
the recommendation recorded: the TYPE branch — one producer exists, no second-producer
disagreement is representable, so the four literals become const types and the unfailable
check is deleted. It lands with F7700's lane or after.

Three of four remediation lanes' territories now clean; F4700 no longer reopenable on its
own axis.

---

## D124 — api-core erasure guard ratified; F7500 fail-open-vs-closed goes to the OWNER (2026-08-07)

**F7500's guard ratified** — the contradiction is DERIVED ONCE from the disposition
declaration (`personNamingRules()` exposes the exact OR'd column set;
`deleteScopeContradictions()` flags any column OR'd into a row-DELETE whose disposition
says the row survives), finds EXACTLY the two live instances and nothing else, and is
proven via the non-production assertion path (not wired into live erase/sweep). That is
the ideal shape for the AUDIBLE half: the silent contradiction is now a named, tested,
derivable fact rather than a comment.

**The fail-open-vs-closed decision is a genuine OWNER ESCALATION — the lane correctly
refused it and so do I.** Both options destroy or delay something a person is owed:
- FAIL-CLOSED (guard throws in the live sweep): third parties' data stops being
  irreversibly destroyed NOW, but a requester's own erasure cannot complete until the
  per-disposition semantics land. A GDPR erasure REQUEST is itself time-bound (30 days),
  so this trades one compliance obligation for another.
- FAIL-OPEN (log + ops-alert, sweep continues): erasures complete on time, the defect is
  audible, but every real erasure keeps destroying non-consenting third parties' rows,
  now logged.
The lane's lean (and mine) is FAIL-CLOSED — irreversible over-deletion of non-consenting
third parties is graver and less recoverable than a bounded, logged delay of the
requester's own erasure, and the delay is visible/actionable where the deletion is not.
But this is a compliance-law values call weighing two legal duties against each other; it
is the owner's, with the semantics fix (per-disposition DELETE/SEVER, the real end state)
as the thing that dissolves the dilemma. RECOMMENDATION ON THE ROW: land the semantics fix
FAST (it makes both horns disappear), and fail-closed in the interim only if the owner
accepts erasure-request delay as the lesser breach.

**F7501 ratified** — the always-empty contradiction instrument now reads the horizon subset
of the same derived contradiction set, non-empty and RED on user_reports today, its
`toEqual([])` assertion deleted. The guard-that-cannot-fail in the erasure tooling itself
is fixed by pointing it at the real fact.

**F7502/F7503 ratified**, migrations landed atomically with F7600's (D-note above:
commit ae466c0d5 resolved the two-lane schema entanglement — schema + both migrations
together so a fresh DB is consistent).

F7500's guard-half is FIXED; its semantics + live-path decision remain the owner's — the
single most serious item in the escalation queue.

---

## D125 — mobile remediation ratified; the recovery timer holds through a re-render (2026-08-07)

**F7700 ratified — the fix is at the right rung and the proof is real.** The registration
effect no longer churns on callback identity: a stable observation identity (empty-dep
useCallback wrappers reading the live callbacks through refs) means re-registration no
longer HAPPENS on a re-render, so cleanup runs only on unmount and the timers arm on
transaction start / clear on transaction end. The spec drives the REAL hook through an
effect-committing harness with fake timers — test 2 reds on the pre-fix churning-deps
wiring (notifyCollapsed called 0x) and greens after (1x), while test 1 proves the F1041
1200ms recovery STILL fires (the fix did not break recovery to fix re-arm). Verified
myself: 2/2. The worklet boundary-commit correctly stays with the perf harness; the
recovery deadline is a plain setTimeout and is fully driven here — the exact mechanism.

**F7702 resolved to COLLAPSE on maestro evidence** — a prior pass already removed AND
forbade a distinct commit-lead boundary (the parity pin's negative lookahead bans
SEARCH_DISMISS_BOUNDARY_COMMIT_LEAD_PT/pre_handoff), so manufacturing a distinct boundaryY
would fabricate a threshold with no producer. One geometric boundary, the +8 slop stays on
it. The lane READ whether the band was real before collapsing — the D102 instruction
honored.

**F7801 ratified** — the F5000 collapse residual: seven dead panel-null guards removed by
narrowing the type to non-null, with `panel.data?.restaurant` correctly KEPT (it guards
nullable data, not the impossible panel-null). Re-adding `| null` flags all seven RED via
tsc.

Three of four remediation lanes ratified. Only the api-search service/backfill lane
remains in flight; its schema landed atomically (ae466c0d5), so it commits service code
only.

---

## D126 — api-search fold remediation ratified; ALL pass-1 findings terminal (2026-08-07)

**F7600 ratified — the lane went past the query to the real defect.** Fixing only the
WHERE would have left the acceptance ("es label reachable") FAILING, because the labels arm
surfaced no folded label into matchedFormsSelect — so even a WHERE-matched label produced
NO SPAN. The lane added the foldedLabels SELECT + attribution loop so the arm actually
emits, which is the honest rederivation. The fold-in-SQL-vs-script call is correct and
matches the alias precedent: canonicalFold is NFKD + Unicode-class regex, not
platform-stable in SQL (glibc vs mac), so the backfill is a TS script — run once, 11,068
rows re-folded, 0 unfoldable, re-run touched 0 (idempotent proven), accented rows now
correct. Both accent tests red on the LOWER(el.form) revert, green after. The 20%-label
recall defect is closed at the schema level: form_folded is NOT NULL, app-written, so a
label without a folded form cannot be written — unrepresentable, not patched.

**F7602's mutation gate is the D-note worth keeping:** the DB run alone COULD NOT gate the
tiebreak (Postgres sorted the small tie stably regardless), so the reliable gate reads the
RENDERED SQL for the ORDER BY, with the DB run as a correctness smoke. A determinism fix
whose only witness is a stable-by-luck DB sort is exactly the always-green trap; the
rendered-SQL assertion is the one that can fail.

**F7601** — the constant-zero instrument deleted (its only consumer was the log).

**ALL TWELVE PASS-1 FINDINGS ARE NOW TERMINAL OR OWNER-ESCALATED:**
F7500 (guard FIXED / semantics ESCALATED), F7501/02/03 FIXED, F7600/01/02 FIXED,
F7700/02/801 FIXED, F7701 (recommendation recorded, lands with F7700's file — verify),
F7800 FIXED (F4700 folded), F7901 FIXED, F7900/7902 FIXED, F7903 (job-control FIXED /
notification-dispatcher held by another session). Pass 1's remediation is complete.

**NEXT: the quiescent re-sweep, then PASS 1 RESTARTS (attempt 2).** The two-consecutive-
clean counter is at zero and stays there until a full re-hunt returns empty twice.

---

## D127 — pass 1 attempt 2: NOT CLEAN (F8400) + a coordination-seam catch. Counter stays at zero. (2026-08-07)

**Attempt 2's verdict: NOT clean, and the loop earned its cost twice.**
- api lane: all 7 attempt-1 fixes VERIFIED HOLDING under fresh reads, and ONE new finding —
  F8400, the `llmMs: 0` twin of F7601 that the original sweep stopped short of, WITH the
  producer's own comment saying the field should have been deleted. The F6001 sibling class
  a final time. FIXED BY ME (edd36c82d): a phase that does not run has no phaseTiming; the
  generic-Record consumer handles the 2-key object identically. Verified: tsc clean, 121
  search tests pass.
- mobile+tooling lane: ZERO NEW FINDINGS — every pass-1 fix held, the three wave-changed
  gates RED-proven, the flake class green 6/6.

**A coordination-seam catch the mobile lane surfaced, now closing: F7701 was never landed.**
D126 assumed F7700's lane would fold it in; that lane edited the same file but did not.
Not a new finding — a tracked-OPEN row that fell through a seam — and its approved
TYPE-branch fix is dispatched (delete the unearnable `ln` check + tautological conjuncts
across both contract scripts + the maestro pin).

**A verified infra trap recorded (not a finding):** `yarn invariants` run CONCURRENTLY
with `yarn test` produces 7 spurious FAILs — the invariants harness plants/removes probe
files mid-compile and ts-jest picks them up. tsc clean throughout; serial re-run green.
NEVER run the two concurrently. This goes into the quiescent-sweep protocol.

**The counter does NOT advance.** Attempt 2 found F8400 -> remediated -> attempt 3 is the
next full pass, and it must come back zero to be the FIRST clean pass. The convergence is
visible in the SHAPE of what each pass finds: pass 1 found 12 (structural defects across
every territory); attempt 2 found 1 (a single sibling-twin the prior sweep missed by one
file). The findings are getting smaller and more peripheral — which is what approaching a
fixed point looks like — but "smaller" is not "zero," and the mandate is zero, twice.

---

## D128 — F7701 ratified; the brief was wrong twice and the lane read past it (2026-08-07)

Landed as the TYPE branch, with two of my brief's claims corrected by reading:
1. "Delete the four literal fields" would have been WRONG — the lane read the consumers and
   found the literals are legitimate POSITIVE selectors (visual-contracts.js:883 selects the
   DIFFERENT value 'routeSheetMotion' to distinguish producers; interrupt/extract-video
   contracts filter on them). So the emit stays; only the tautological `badDismissNavSource`
   check + its unreachable if/else and the three narrow-nothing conjuncts in
   missingRealMotionProgressProofWindow were deleted — the check keeps its real narrowing
   (progress band, sheetY, proofStage) and remains failable.
2. "Byte-identical block in parity-contracts.js:3420-3500" was INACCURATE — grep-verified
   zero occurrences there; that block mirrors other checks. Nothing to delete. The maestro
   pin references the emit source text (kept), not the deleted logic — left as-is.
Banking law satisfied: the check's name + both strings exist only in the one file.
Stated limit honestly: no fixture perf-log in the repo, so the script can't run
end-to-end, and the proving mutation is UNREPRESENTABLE today (single producer) — which
is exactly why the check was unearnable and deleted.

F8600 flagged (not this row's): the redundant source-literal conjuncts survive in sibling
POSITIVE filters (instantCollapseWindow, etc.) — redundant but not unearnable, so a scoped
cleanup, not a can't-fail defect. Queued.

**F7701 was pass 1's last unlanded item. Attempt-2 remediation (F8400 + F7701) is complete.
ATTEMPT 3 is the next full pass** — it must return zero to be the first clean pass.

---

## D129 — F8500: the two surviving delete-gates swallowed rg exit 2/127 as PASS (2026-08-07)

Attempt 3's gate hunter found it; I verified and fixed. `scan_active` in both
`crave-score-cutover-delete-gate.sh` and `search-results-prepared-rows-delete-gate.sh`
was `if rg -n "$pattern" …; then fail`. `if rg` reads EVERY non-zero exit as
"no match → clean," but rg exit 2 = invalid regex and 127 = rg not installed.
So a pattern rotted into invalidity, or any local run without ripgrep, made
every NEGATIVE ban PASS having scanned nothing — a gate green where the
developer looks at it. The asymmetry made it worse: the co-located `require_active`
(`if ! rg`) DID fail loudly when rg was absent, so a maintainer saw the positive
checks fire and reasonably assumed the negative bans had too. They hadn't.

This is the exact class the sibling gates already close — `no-bypass-search-runtime.sh`
(a `command -v rg` precondition) and `app-route-runtime-delete-gate.sh` (per-check
`status=$?` with exit-2 discrimination). All three were wired in the same D37 sweep
(F703/F704), but these two never inherited the defense.

FIX (mirrors the siblings): a `command -v rg` precondition failing the whole gate
when rg is absent, plus full exit-status discrimination in BOTH helpers —
scan_active: exit 0 → ban fired (fail), 1 → pass, 2 → invalid-pattern fail,
other → tool-broke fail; require_active: 0 → present, 1 → designed absent-fail,
2/other → tool-broke fail reported DISTINCTLY so a rotted pattern is never
misread as a missing symbol.

MUTATION-PROVEN three ways (all against the reverted defect):
- normal run → pass (exit 0), unchanged.
- PATH stripped of rg (127) → FAIL exit 1 ("cannot verify anything") — was silent green.
- one pattern corrupted to an unbalanced `[` (exit 2) → FAIL exit 1
  ("invalid rg pattern … the scan did not run") — was silent green.

**Attempt 3 is NOT clean: it found F8500 (real). api core + api rest (both halves)
+ mobile returned zero new. Remediation of F8500 done → attempt 4 is the next full
pass.** Two sub-P1 items remain queued from this pass: F8600 (mobile — four redundant
source-literal conjuncts on POSITIVE filters, confirmed dead weight not load-bearing,
safe to delete for honesty) and the dead-effect-in-body-spec class the mobile hunter
sampled but did not fully rederive across 961 files.
