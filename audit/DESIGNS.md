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
