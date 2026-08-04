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
- F883 Mapbox style cache-buster becomes dev-only (**DEV**-gated).
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
