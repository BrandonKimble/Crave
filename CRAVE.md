# CRAVE — the canonical map

Built incrementally, territory by territory, as the exhaustive
rederivation covers ground. Written for a competent engineer who has
never seen this repo. Each section: what it is, the abstractions and
their real contracts, data/control flow, invariants and why, entry
points, gotchas, what deliberately does NOT exist and why, rederivation
verdicts.

## Repo shape (orientation)

Monorepo: `apps/api` (NestJS + Prisma + Postgres — the product's entire
backend), `apps/mobile` (Expo/React Native iOS app with custom native
map kits), `packages/shared`, `scripts/` + `maestro/` (ops + test rigs),
`plans/ product/ business/` (living docs — never delete), `audit/`
(this effort's ledgers). ~4.2k files, ~1.3k of them mobile image assets.

Territory sections follow as they are mapped.

## Territory: repo-root (pass 1, partial — configs verified, docs/lockfile mapped)

**What it is.** Workspace plumbing: yarn workspaces (`package.json` —
scripts are thin `turbo run` / `yarn workspace` delegations plus rig
shims), turbo task graph, single root tsconfig, lefthook (live hook
manager — its generated hooks live in `.git/hooks`; `LEFTHOOK=0`
bypasses), gitleaks, knip (pre-commit `deps-check` lane, gated on
package-file changes — REBUILT 2026-08-06, F2501/D67: the old
`--workspace 'apps/*'` invocation exited 0 with zero output because knip
does not glob --workspace, so the gate audited NOTHING for months;
workspaces are now derived from git ls-files with zero-resolved a hard
failure), prettier/eslint/editor configs, Railway
deploy manifests (THREE: `railway.json` api / `railway.worker.json`
worker / `railway.site.json` site — NEVER add a startCommand (replaces
the Dockerfile CMD, exec'd without a shell) or watchPatterns (Railway
skips deploys while reporting success); both are now CI-enforced by
`scripts/check-railway-manifests.mjs`, manifests discovered via git
ls-files so a fourth is covered the day it lands), `patches/`
(patch-package, rnmapbox 10.3.1 — applied via postinstall).
CORRECTED 2026-08-06 (F1994): this map used to bless root Expo shims
(`App.tsx`, `app.config.js`, `babel.config.js`) as "deliberate, minimal,
ideal". They were DEAD — `npx expo config` resolved everything from
apps/mobile alone, root app.config.js was never read (and carried a
plugins array the native-authority gate forbids) — and are deleted.
A prior pass had IDEAL-VERIFIED them without executing the resolution.

**Gotchas.** `.node-version`+`.nvmrc` pin Node 22; `.lefthook/
with-node-22.sh` re-execs hooks under Node 22 because GUI git clients
run hooks with a minimal PATH. `stories.md`/`PRD.md`/`BRD.md` are the
STALE original spec family — product/ and business/ supersede them
(CLAUDE.md says so; keep for seed ideas only). `copy.md` is the living
copy library.

**What deliberately does not exist.** A CI-enforced hook path
(`core.hooksPath` unset — lefthook owns `.git/hooks` directly); a
multi-agent commit-coordination ritual (the `.githooks/` +
`scripts/agent-log/` cluster enforcing claimed entries in
`plans/agent-log.md` was DELETED this pass — never wired, superseded by
the commit-straight-to-main + pathspec-per-session law).

**Rederivation verdicts.** Configs IDEAL-VERIFIED (each is the minimal
honest shape for a real constraint); agent-log cluster DELETED (F1);
`patches-parked/` being removed by a concurrent session (not touched);
`yarn.lock`/`stories.md`/`copy.md`/`PRD.md`/`BRD.md` mapped, held for
the docs territory verdict.

---

## Territory: api-identity-money (identity, entitlements, billing, legal, moderation, teaser)

Six NestJS modules under `apps/api/src/modules/`, 57 files. Together they answer
three questions: **who is this**, **may they be here**, and **did they pay**.

### What it is

- **identity** — Clerk-backed authentication, the local `users` row, the social
  graph (follow/block/report), usernames, profile stats, device observation,
  and account deletion.
- **entitlements** — the access-grant LEDGER and the one app-wide paywall.
- **billing** — Stripe and RevenueCat webhooks, translated into ledger grants.
- **legal** — `/privacy` and `/terms` as HTML string literals (App Store req).
- **moderation** — one LLM text call behind a service.
- **teaser** — the pre-auth, pre-paywall "first answer" onboarding payload.

### The real contracts

**Auth.** `ClerkAuthGuard` verifies a bearer token, calls
`UserService.syncFromClerkClaims` (upsert-on-first-sight, gap-backfill of
name/avatar from Clerk's admin API only when the JWT lacks them, never
clobbering user edits), attaches `request.user`, and fire-and-forgets a device
observation. `OptionalClerkAuthGuard` is the same thing except a missing token
is success with **no** `request.user`. There is also a hard-coded dev token
(`crave-dev-perf-scenario`) triple-gated on `ENABLE_DEV_PERF_SCENARIO_AUTH=true`
AND non-prod NODE_ENV AND non-prod appEnv — deliberately opt-in, because "we
don't look like prod" once failed open.

**The ledger** (`entitlement.service.ts`) is the single truth for access.
Grants come in two kinds, declared once in `GRANT_POLICY`:

- _absolute_ (`subscription`, `comp`, `promo`) carry `expiresAt`; NULL = lifetime.
- _day_ (`trial_base`, `winback`, `gift`) carry `grantedDays`, and their coverage
  is **derived at read time**, never stored: day grants chain sequentially from
  the latest absolute grant's _effective end_ (expiry, clamped to revocation),
  each segment starting no earlier than it was earned.

That derivation is the module's best idea. Because coverage is computed, not
banked, a refunded subscription cannot leave a reward tail, revoking a
mid-chain grant coherently shifts the later ones, and days earned under a
lifetime comp survive its revocation. All four properties are pinned by an
integration spec that runs against the real dev DB.

**The verdict type** (`access-verdict.ts`). `accessVerdict()` returns
`granted | denied(reason) | indeterminate(cause, message)` — never a boolean.
The reason: a boolean's catch block must invent an assertion from the _absence_
of information, and it chose `true` globally, which cannot be right for both a
shared-poll read (availability wins) and an LLM-backed search (money wins).
`resolveVerdict(verdict, 'allow'|'deny')` forces every surface to name its own
policy at the call site. **This is the pattern of record in this codebase** and
the yardstick the rest of the territory should be measured against.

**The paywall** is a global `APP_INTERCEPTOR`, not a guard — global guards run
_before_ controller guards, so `request.user` would not yet exist. Every
authenticated route requires a live grant unless it carries `@AllowUnentitled`.
Absence of a user is a REFUSAL, not a pass ("publicness is declared, never
inferred from absence"): omitting the Authorization header used to be the
bypass. The wall's own indeterminate policy is `allow`, stated out loud, because
an entitlement-store blip must not lock out every paying customer.

**The boot audit** (`paywall-coverage.audit.ts`) reads the DI graph at
`onApplicationBootstrap` and **throws** if any route neither declares itself
public nor sits behind a guard marked `@BearsRequestUser()`. It replaced a Jest
spec that walked the filesystem for `*.controller.ts` and grepped for guard
names — which could not see controllers outside the directories it walked. Its
spec proves it goes RED on the real historical defect (an operator-authenticated
ops dashboard) and that Nest itself refuses to start.

**Billing** never grants directly: both webhooks translate into
`syncSubscriptionGrant(userId, sourceRef, expiresAt, active, code)`, which is
idempotent per `sourceRef`, revokes duplicate rows, and refuses to create a
subscription grant with no expiry (that would be lifetime). RevenueCat event
types are mapped EXPLICITLY, never substring-matched (`UNCANCELLATION` contains
"cancel"); `CANCELLATION` means auto-renew off and access rides to expiry —
`EXPIRATION` is what ends it. `TRANSFER` resolves the gaining account's state
_before_ revoking the losing one, because doing the destructive half of a move
first is how a move becomes a delete.

**Account deletion** (Apple 5.1.1(v)) is soft-delete + anonymize, ordered:
best-effort Stripe cancel → **delete the Clerk user** (a failure here leaves
nothing local changed, so the client just retries) → revoke grants, destroy the
avatar asset, hard-delete push tokens / device rows / username history, then
anonymize the `users` row. Community content survives as an anonymous author;
`stripeCustomerId` is retained for financial audit.

### Invariants, and why

1. **The ledger is the only access truth.** Redis holds a 0/1 cache with one
   authoritative writer (`recomputeCache` after every write; the read path only
   SET-NXes cold misses, so it can never overwrite a fresh recompute).
2. **Every ledger write holds a per-(user, code) pg advisory xact lock**, and the
   live-rows partial unique index on `(userId, source, sourceRef)` is the RED
   backstop — P2002 is an idempotent no-op, not an error.
3. **Profile stats are LIVE counts, never counters.** Every denormalized counter
   drifted (writes outside the edge tx) and the columns were dropped; each stat
   now counts the same rows its profile section lists, so stat == section by
   construction. `user_stats` survives only as a provisioning seam.
4. **Same-type id pairs are passed by NAME, not position** (`blockUser({blockerUserId,
blockedUserId})`). Both ids are users, branding cannot separate them, and the
   controller genuinely calls unfollow in both directions on adjacent lines.
5. **A deleted account never receives a grant** — the webhook user lookup filters
   `deletedAt: null`, or deletion's own cancel call would resurrect it.

### Entry points

`POST /auth/apple/native`, `GET|PATCH /users/me`, `PUT /users/me/onboarding`,
`/users/username/{check,claim,suggest}`, `GET /users/:id/profile` (public,
optional auth), the follow/block/report routes, `DELETE /users/me`,
`POST /billing/subscription/cancel`, `POST /billing/webhooks/{stripe,revenuecat}`,
`GET /privacy`, `GET /terms`, `POST /teaser/preview`.

### Gotchas

- `ENTITLEMENT_GATING` is `off | log | enforce`, read per request. `log` mode is
  the mode where a broken route still works — which is exactly why the boot audit
  exists rather than a startup warning.
- Paywall exemption on `UserController` is **per-method on purpose**: a
  class-level `@AllowUnentitled` would silently exempt every future route. The
  social graph sits behind the wall; only self-service (me/onboarding/username)
  is exempt, because those are what a never-subscribed user needs to reach payment.
- `AccountDeletionModule` is its own module because it orchestrates identity AND
  billing, and `BillingModule` already imports `IdentityModule` — folding it into
  either closes a cycle. `UserListProvisioningService` is provided by
  `IdentityModule` for the same reason.
- The teaser is a deliberate NON-use of the search stack: it is public, so it
  serves only fixed aggregate compositions (top-3 + count) for hard-coded live
  cities, and it is rate-limited because every cache miss is several raw geo
  queries.

### What deliberately does NOT exist

- **No web checkout/portal rail.** Deleted 2026-07-09; only `cancel` survives, and
  App Store subscribers are told to manage in iOS Settings. (Note: memory records
  the owner has since ratified a web Stripe rail — restoring it is planned work,
  not an accident.)
- **No monetary engagement incentives.** `reward_photo`/`reward_referral` and the
  per-source anti-farming caps were deleted with the hard-paywall lock-in;
  engagement is recognized, not paid.
- **No follower/list/favorite counters.** See invariant 3.
- **No automated consequence for user reports.** v1 records only; moderation is
  human and reads `user_reports` directly.

### Rederivation verdicts (pass 1)

**Ideal, and the reasoning holds.** `access-verdict.ts` (three answers, policy at
the call site); the derived day-chain in `deriveSummary` (deriving instead of
storing kills a whole defect class, and the specs prove all four consequences);
the paywall-as-interceptor with refusal-on-absence; the boot audit that throws;
named-participant object parameters for same-type id pairs; live-count profile
stats; the RevenueCat explicit event-type map; TRANSFER resolving before
revoking; the account-deletion ordering; `UserDevicesService` as a never-throwing
observation. These are argued, tested, and I could not improve them.

**Not ideal — see FINDINGS F101–F113.** The headline is F101: an unmapped
RevenueCat entitlement id silently becomes our entitlement code, while the wall
only ever asks about the default code — a paying customer can hold a live grant
the paywall never looks at, and the config ships a _guessed_ default map. F102:
the `@BearsRequestUser` marker is two-valued in a three-valued world, so a route
guarded only by the _optional_ guard passes the boot audit and would 403 anonymous
callers under enforce. F103: the access_grants CHECK is NAND, not the XOR its
comment claims, so the emptiest possible row reads as lifetime access. F105:
moderation still returns a boolean and fail-opens in its catch block — the exact
defect `access-verdict.ts` already rederived away, one module over.

---

## Territory: `apps/api/src/modules/external-integrations` (the vendor boundary)

**What it is.** Everything in this app that spends third-party money lives
here: the Google Gemini LLM gateway and its batch machinery, the Google
Places client, the Reddit client, and the spend-governance layer that
admits, meters, and stops all of it. 76 files, ~25.5k lines. Four
sub-territories — `llm/`, `google-places/`, `reddit/`, and the cross-cutting
`shared/` + `governance/`.

Read this section before touching anything that costs money. The design here
is unusually deliberate: nearly every guard carries a comment naming the
incident that produced it and the cheaper shape that failed first. Those
comments are load-bearing documentation, not noise.

### The four laws this territory encodes

1. **One gateway.** All Gemini traffic goes through `LLMService`. The raw
   `@google/genai` client is constructed inside `GatedGeminiClient` and never
   escapes — no getter, no field, nothing to reach past. Paid surfaces
   (`generateContent`, `embedContent`, `createCache`, `createBatch`) `await
this.gate()` before touching the vendor; free surfaces (batch get/list/
   cancel, cache TTL-update/delete) do not. Outside services call
   `LLMService.generateForCaller()`; the batch service and embedding service
   receive _typed vendor ops_ (`batchTransportOps()`, `embedVendorOp()`)
   rather than a client. An ESLint import boundary keeps the SDK out of every
   other file.

2. **Numbers are facts, owner choices, or derivations — never priors.** A
   literal in this tree must be a vendor fact (K4), an owner price tag (K1),
   or computed from measurement. Where a placeholder was unavoidable it
   carries an explicit _erasure note_ saying what will replace it and when
   (`ENVELOPE_BOOTSTRAP_TOLERANCE`, `MIN_SAMPLE_UNITS`, the TomTom hot-pool
   proxy). Cooldown-timer-shaped tunables were deleted for cause — do not
   reintroduce them.

3. **Two currencies, one legal exchange.** Our meter is not the bill: Gemini
   is measurably ~1.7x under-metered against the BigQuery billing export.
   `spend-currency.ts` makes `LedgerMicros` and `BilledMicros` different
   _types_. Anything that decides when to STOP (monthly pools, campaign
   envelopes, the backstop derivation) must count `BilledMicros`;
   `ReconciliationMultiplierService.gross()` is the only way to produce one
   from a ledger figure. This exists because campaigns were once minted in
   billed dollars and drained in ledger dollars — an $82 envelope spent ~$139
   before it registered as breached.

4. **Boundaries are structural, not audited.** The repo's ratified pattern is
   to make a violation _unrepresentable_ (delete the field, brand the type,
   union the vocabulary) rather than to scan for it. Three source scanners
   were deleted in one commit after one of them shipped a false green by
   matching its own guard string inside a comment. What remains as a test is
   only what no type can express — e.g. `gemini-gateway-lockdown.spec.ts`,
   which asserts two lists agree (every live `usageCaller` has a profile; no
   profile is an orphan).

### Control flow

**Interactive Gemini.** caller → `LLMService.callLLMApi` → spend gate →
caller profile (`gemini-caller-profiles.ts` supplies model, output ceiling,
thinking context, keyed by the same `usageCaller` the ledger records) →
universal generation defaults merged so a caller-supplied config cannot drop
a computed one → `GatedGeminiClient.generateContent` (gate again) → usage
ledger row → retry/classify on failure.

**Batch Gemini.** `GeminiBatchService.submit` → spend gate + campaign
dispatchability check → persist job + items → provider submit (deferred to
the poller on failure) → 5-min cron poll → ingest under an ambient
`WorkContext` so everything downstream is attributed to the funding campaign.
State machine: `persisting → pending → submitting → submitted → succeeded →
ingesting → ingested|failed`, every claimed state lease-guarded so a dead
worker self-releases. Idempotent at both ends: a deterministic `displayName`
lets a crashed submit _adopt_ the paid provider job instead of buying a twin;
a per-job `dedupeKey` makes the usage row at-most-once.

**Places.** `GooglePlacesService` → **dollar gate first** (`assertPlacesSpendOpen`),
then the Redis rate gate → ledger row → HTTP. Rate is not budget: the
configured limits alone permit ~$2.8k/day.

**Reddit.** Every vendor HTTP call is exactly one governed draw on the
`reddit.requests` pool at the single `makeRequest` chokepoint. Response
headers (`x-ratelimit-remaining/reset`) realign the pool after every call —
the vendor's ledger is truth, ours is the estimate, and alignment only ever
tightens.

### Governance: the three tiers

- **Tier 1 — campaigns** (`spend-campaign.service.ts`). A named finite job.
  The owner approves an exact estimate _by hash_; approval mints a grant pool
  sized `estimate × (1 + tolerance)`. Grant exhaustion and envelope breach are
  the same event by construction. Tolerance is derived from completed
  campaigns' declared-vs-actual history, floored at the 0.25 bootstrap.
- **Tier 2 — lanes.** Per-lane cost baselines, owned outside this territory.
- **Tier 3 — the catastrophe backstop.** `gemini.monthlySpend` and
  `googlePlaces.monthlySpend`: durable, fail-closed monthly dollar windows.
  The Gemini limit is re-derived nightly as 3× trailing _measured_ spend; the
  env var only seeds the very first boot. Expected to never fire.

`PoolRegistry` is the primitive: reserve → act → reconcile, with
declared-vs-actual pairs as the estimator-drift instrument. Durable windows
(month/day/grant) write through to Postgres; `perMinute` pools are memory-only
by design. A window the store cannot _confirm_ fails CLOSED.

### Invariants, and why

- **A budget that cannot prove what it has spent must not admit.** An
  unconfirmed durable window denies rather than reading zero.
- **Meter-only pools re-read the store on a TTL.** `ensureWindow` returns
  early once confirmed, which is right for a pool this process owns and wrong
  for one sibling processes also spend against — api and worker deploy
  separately, so a $475 cap was really $475 _per process_. `admit()` forces a
  refresh every 30s.
- **Denials are a typed third outcome**, never an error. `PoolDenial` and
  `RedditGovernanceDenialError` exist so no generic catch can brand a
  "not now" as a failure, a cooldown, or an empty success.
- **Unknown spend over-meters, never vanishes.** Unknown model → priciest
  known rate. Unknown SKU → highest. NaN token counts coerce to 0 _and warn_,
  because `micros <= 0` silently no-ops the meter.
- **Attribution is ambient, not threaded.** `work-context.ts`
  (`AsyncLocalStorage`) is established once at the entry point that knows the
  campaign; the ledger reads it. Hand-threading covered ~7% of a campaign's
  priced manifest.
- **Context caches are content-addressed and shared.** Identity is
  `(model, sha256(prompt))` in Postgres, so one cache serves every process:
  lookup-before-mint, extend-instead-of-remint, retire-with-refcount. A young
  cache is never vendor-deleted (a builder may already hold its name).

### Entry points

`GovernanceService.assertGeminiSpendOpen` / `assertPlacesSpendOpen` (the
gates) · `LLMService.generateForCaller` (the public gateway) ·
`GeminiBatchService.submit` · `UsageLedgerService.record` (the metering
chokepoint — everything paid flows through it) · `SpendCampaignService`
prepare/approve/recordSpend · `PromptRegistryService.activate`.

### Gotchas

- `usageCaller` is not optional in spirit. Omitting it warns and drops to the
  dead-man `llm.callGeminiApi` tag _and_ loses the caller profile (model,
  ceiling, thinking) — an expensive default. It stopped being hit on
  2026-07-25 when the taxonomy landed.
- `LLMService` owns three _different_ context caches with different TTLs:
  interactive system (3h), query instruction (lazy, 3h), and batch system
  (30h — must outlive the Batch API's 24h SLA).
- The Places `operationLimits` keys, the ledger's `operation`, and the pricing
  table are one vocabulary (`PlacesOperation`) on purpose. There were once
  three, and the cap you would most want to set was the one you could not set.
- `spend_unit_costs` is a polymorphic table: most rows are currency, but
  `pipeline.entities_per_kilodoc` is a ratio and `backstop.gemini/month` is a
  derived limit. Read the unit column.
- `getMetrics()` on `SmartLLMProcessor` reports hard-coded zeros — do not
  trust it (finding F115).

### Deliberate absences

No per-vendor retry config on Places (it does not retry — see F117). No LLM
registration in `RateLimitCoordinator` (LLM admission is the Redis
`CentralizedRateLimiter`; `gemini.tokens` only mirrors it for drift). No
reddit window in `RateLimitCoordinator` (moved wholesale into the governor —
one pool, one ledger). No `startCommand` in railway.json. No dev Places probe
controller (deleted, not gated — it was an unauthenticated spend faucet).

### Rederivation verdicts

**IDEAL, argued:** the gateway/`GatedGeminiClient` split (a paid call that
skips the gate is unrepresentable); `spend-currency.ts`'s branded currencies;
`work-context.ts`'s ambient attribution; `gemini-context-cache.registry.ts`
(content-addressed identity fixes minting, extension, and retirement at once);
`gemini-caller-profiles.ts` + `gemini-thinking.ts` (one home per cross-cutting
truth); `llm-audit-policy.ts` (applied to exactly the three ephemeral-reason
schemas — moderation's semantic reason and the gate's persisted reason are
correctly exempt); `RedditGovernanceDenialError`'s deliberate non-subclassing;
`PoolRegistry`'s reserve/act/reconcile and fail-closed store law.

**Open proposals:** F114 (zero means closed, not default) · F115 (an
always-green metric is lying) · F116 (invented priors on a dead surface) ·
F117 (dead Places retry config — OWNER-DECISION) · F118 (the cap-poison
substring needs a detector for its own rot) · F119 (finish the currency brand
at the pool level — `meter()` still bypasses it) · F120 (one spend gate, not
one per vendor) · F121 (derive the unknown-model rate from the table) · F122
(fold the query timeout into the caller profile) · F123/F127 (dead injection,
drifted barrels).

**Coverage honesty:** 26 files IDEAL-VERIFIED, 36 PARTIAL, 14 UNREVIEWED. The
unreviewed remainder is the prompt corpus (`llm/prompts/*.md`), the two Reddit
docs, `reddit-data-filter.ts`, `llm.types.ts`, and `llm-input.dto.ts` — prompt
text and type declarations, which want a different kind of review than code.
All 17 spec suites (144 tests) were executed green this pass; the specs marked
PARTIAL were run but not line-read.

---

## Territory: api-signals + api-ops (the user-act ledger, and the owner's instruments)

_Pass 1, 2026-08-02, at HEAD `c9702f6a1`. 47 files, all read. Baseline: 14 suites / 125 tests green._

Two territories that belong in one chapter because they answer the same question from
opposite ends: **signals** is how the system learns what users did, and **ops** is how the
owner learns what the system did.

### The one big idea: the ledger is the ONE record

`signals` is an append-only, immutable, permanent ledger of user ACTS (master plan §3).
`SignalsService` exposes exactly one verb — `record()` — and there is no update or delete
path anywhere, by law. Everything else in the demand stack is a _derivation_ of it.

Three consequences a stranger must internalise before touching anything here:

1. **Merges never rekey the ledger.** When two entities merge, the historical rows keep
   pointing at the loser id forever. Readers resolve identity through `entity_redirects`
   with a one-hop `COALESCE(r.to_entity_id, s.subject_id)` **at read time**. This is why
   merges are cheap. It is also this territory's biggest structural weakness — see
   _Gotchas_, and F202.
2. **A write failure never fails the user action.** `record()` is fire-and-forget: it
   returns `void`, never throws, and must never be awaited on a hot path. Skips (no actor,
   no geo) are debug-logged once per reason key so they cannot spam.
3. **Qualifiers are judged at read.** "cached", "unresolved", "low-result" live in
   `meta` and are interpreted by readers, never baked into the act's kind. Kinds are ACTS
   only. This is what makes the ledger re-interpretable forever.

### Flow: an act becomes a number

```
user act
  -> SignalsService.record()        (append-only row in `signals`, partitioned by month)
  -> SignalDemandAggregateService   (cron */15: rebuild whole UTC day slices from the ledger)
       writes `signal_demand_daily` = day x actor x place x subject x kind
  -> SignalDemandReadService        (every demand/history/autocomplete read)
       resolves redirects, applies the recency curve, returns scores
  -> collector / polls / explore    (decides what gets enriched, i.e. real money)
```

The aggregate is **purely derived** — `rebuildAll()` is always safe and always converges.
Which days rebuild is **watermark-driven**, not a trailing window: signals carry
`recorded_at` (when the ledger learned) beside `occurred_at` (when it happened), so an
offline flush or a backfill lands in its own day slice within one pass. The watermark is
also the geometry-upgrade seam — a place promotion pulls it _back_ so old days
re-attribute against the true polygon.

### Invariants, and why they exist

- **`occurred_at` is naive-UTC, and it is the only such column left.** Every other
  timestamp in the DB is `timestamptz`; this one could not be migrated because Postgres
  refuses to alter a partition key. `signals/sql-instant.ts` is the one coercion helper,
  scoped to the one column. If `signals` is ever rebuilt on a timestamptz key, delete that
  file with it. (One consumer currently skips it — F204.)
- **Echo kinds weigh zero in mass reads.** One user act deliberately writes several rows:
  a selected failing search mints `search` + `autocomplete_selection` + `on_demand_ask`,
  all sharing the parent's request id. `ECHO_SIGNAL_KINDS` excludes the children from
  subjectless place MASS reads — summing raw aggregate rows would weigh one act 2-6x.
  Kind-FILTERED readers still read echo rows directly, because there the echo _is_ the act
  being asked about.
- **Dedupe is per-(kind, request-id), window-wide.** The kind is part of the act's
  identity _by design_: `search` and `autocomplete_selection` share `meta.searchRequestId`
  because one submit is two acts, so a kind-blind key would silently drop one act of every
  selected search.
- **`kind` is IN the day-acts grain.** Two different kinds by one actor on one day are two
  acts and must SUM. Collapsing them into a single MAX under-counts demand — this actually
  happened, and the divergence fed the collector's enrichment decisions.
- **Attribution is containment, never intersection.** A signal geo lands on the smallest
  place _containing_ it plus the coarsest places _contained_ in it, judged against the one
  ground (`place_geometries.geometry`). Storage is O(few) rows per signal; the "every place
  in view" semantics is supplied at READ time by ancestor/descendant inheritance.
- **Place-ANCHORED acts carry NO geo at all.** A poll act's WHERE genuinely _is_ a place,
  so it attributes along the vendor's stated DAG chain (both directions), never through
  geometry. Ancestry comes from the DAG, never from polygon nesting — 10.85% of asserted
  municipality→state links are not geometric containments.
- **Longitude is wrap-aware everywhere.** `minLng > maxLng` means the bbox crosses the
  antimeridian. Never min/max-normalize it: doing so inverts a 6°-wide Fiji viewport into a
  ~354° band that attributes to every place on earth.
- **Partitions must exist strictly ahead of the clock.** An insert into a missing month
  FAILS, and the fire-and-forget writer swallows it — silently dropping signals. The daily
  cron keeps a 2-month lead, which is the definition of "strictly ahead", not a tunable.

### Entry points

| What                                | Where                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| The only client-facing signal write | `POST /signals/viewport-dwell` (`signals.controller.ts`)                       |
| The write path                      | `SignalsService.record()`                                                      |
| The aggregate rebuild               | `SignalDemandAggregateService` (cron `*/15`), `rebuildAll()`, `rebuildDay()`   |
| Every demand/history read           | `SignalDemandReadService` (14 public methods)                                  |
| The shared SQL law                  | `act-identity.ts` (`dailyActsCteSql` builder, `DEDUPE_KEY_SQL`, `ACT_KEY_SQL`) |
| Geo predicates                      | `ground-containment.ts`                                                        |
| Vote-audit HMACs                    | `audit-hmac.ts`                                                                |
| Sybil detection                     | `SybilClusterReportService` (cron `45 3 * * *`)                                |
| Owner dashboard                     | `GET /ops` + `GET /ops/api/summary` (`ops-dashboard.controller.ts`)            |
| Deployed-commit truth               | `GET /health` -> `commit`, `appEnv`                                            |
| Rate-limit tiers                    | `infrastructure/throttler/throttler.decorator.ts`                              |

### The ops side

- **`/health` self-reports `DEPLOYED_GIT_SHA`.** "What is this environment running" must be
  a FACT — `railway up` ships a working tree, not a git ref, so before this the only way to
  answer was probing live rate-limit _behaviour_. `unknown` is honest and means nothing
  stamped it (a hand-rolled deploy). The prod promotion gate reads this.
- **`OpsTokenGuard` is header-only, forever.** Absent `OPS_DASH_TOKEN` => **404**, not 401 —
  the surface must not reveal it exists on a fresh env. The `?token=` query branch was
  deleted for cause (the logging interceptor, exception filter, Sentry, browser history and
  proxy logs all record query strings in cleartext). **Do not re-propose it.** But note
  F200: the _page_ is now unreachable from a browser as a result, and the right answer is a
  cookie bootstrap, not the query param coming back.
- **The ops dashboard is exempt from the paywall** (`@AllowUnentitled`), deliberately:
  `OpsTokenGuard` authenticates an OPERATOR, not a user, so it sets no `request.user`, and
  flipping `ENTITLEMENT_GATING=enforce` would 403 the incident console at exactly the moment
  you reached for it. Log mode cannot warn about this, because log mode is where it works.
- **Alerts have ONE seam.** Every emitter in the codebase calls `OpsAlertsService.emit()`,
  which owns dedupe collapse (`dedupe_key` is a FOREVER unique column, not a window), the
  email-only-on-a-genuinely-new-insert rule, and a shutdown pending-set so a short-lived
  script cannot drop an alert mid-flight. There is no second path. Critical + `RESEND_API_KEY`
  => best-effort email; never throws.
- **The dashboard is honest about absence — where absence was known at design time.**
  `drainPending: null` renders "—" rather than a fabricated number; TomTom prepaid credit
  reports `declared: false` rather than inventing a balance (prepaid credit is invisible to
  the vendor API, so the balance is an owner-declared fact minus measured burn). It is _not_
  honest about absence that arrives at runtime — F206.
- **Rate limiting: ONE mechanism, not two.** There used to be a path allowlist that opted
  routes out; a substring test over it disabled throttling app-wide (appending
  `?x=/webhooks/` to any URL removed every ceiling in the app). Now only `/health*` is exempt,
  matched EXACTLY, and webhooks carry a generous `webhook` tier like everything else. Being
  on the wrong side of a tier costs a vendor a 429; being on the wrong side of a list cost us
  the entire ceiling.
- **The throttler tracks per-VERIFIED-user, falling back to IP.** It used to read `req.user`,
  set by a ROUTE guard that runs _after_ this APP*GUARD — always undefined, so the per-user
  branch was dead and everyone behind one carrier NAT shared a bucket. The identity must be
  \_verified* here (local JWKS signature check, memoized per token), because keying on an
  unverified token would let an attacker mint a fresh bucket per request.

### Deliberate absences (do not "fix" these)

- **No generic "record any signal" endpoint.** The controller doc forbids it explicitly: the
  ledger's meaning lives in server-side chokepoints, not in client claims. `viewport_dwell`
  is the one act no existing endpoint can see.
- **No fresh-ledger arm in demand reads.** It was deleted (docket #6). The aggregate INCLUDES
  today — the 15-minute cadence _is_ the freshness. The second arm was the law's second
  dialect and produced a midnight step-discontinuity.
- **No `centroidGeoFromPlace`.** Deleted; it existed only to manufacture a value for a NOT
  NULL geo column on anchored acts, and it silently dropped poll acts.
- **No prefilter before the PostGIS containment predicates.** `ST_Covers`/`ST_CoveredBy` ride
  the geometry GiST directly and short-circuit on the cached bbox; every hand-written
  pre-check was re-implementing the index by hand.
- **No `user_search_demand_daily`.** The old rollup is dropped (migration
  `20260720030000_phase_c_purge`) and does not exist in the DB — verified. Only migrations
  reference it. Demand lives on the signals substrate.
- **No enforcement in `integrity/`.** Sybil clustering is DETECTION only; trust signals never
  touch vote weight. The owner's ack on the dashboard means "reviewed, legit". Enforcement on
  a confirmed ring is a documented manual three-seam procedure.
- **No LOD/map telemetry here.** Unrelated territory; see CLAUDE.md.

### Gotchas that will bite you

1. **The redirect COALESCE is a convention, not a contract.** 14 hand-written
   `LEFT JOIN entity_redirects` + `COALESCE` in `signal-demand-read.service.ts` alone, plus
   two more modules. Nothing enforces it, and `lastEntityViewAt` already omits it. The
   existing test asserts only that the SQL _contains the string_ `entity_redirects` — which a
   reader that joins the table and ignores the COALESCE passes. See F202.
2. **`record()` is a bare void call.** Seven services inject `SignalsService` and call it as a
   statement. A new surface that forgets simply has no ledger row, forever, silently. See F203.
3. **Three crons fail silently** (aggregate refresh, partition maintenance, sybil sweep) —
   log-only, no ops_alert, despite the alert seam existing and being injected next door. The
   partition one can silently stop the ledger. See F205.
4. **Two "optimisation" catches change the ANSWER**, not availability: a failed
   `expandWithRedirectSources` / `expandPlaceIdsWithAncestors` silently under-counts demand and
   logs at `debug`. See F207.
5. **`@RateLimitTier('default')` applies nothing** — there is no `default` entry in
   `tierLimits`. It only sets a metadata key nothing reads. See F208.
6. **The ops page cannot be opened in a browser.** Header-only guard on a navigation. See F200.
7. **Effects/telemetry conventions from CLAUDE.md apply**: instrument the composite, and a
   metric that cannot show RED is lying. This territory contains a proven live example — the
   ops-token guard's spec passed 5/5 against a mutant that admitted any token (F201, now fixed).

## Territory: api-migrations (the schema's autobiography — 215 applied migrations)

`apps/api/prisma/migrations/` — 215 `migration.sql` files + `migration_lock.toml`
(provider = postgresql). These are **historical, applied artifacts. Never edit or delete
one** — that corrupts replay for every environment that already ran it. A defect found in
an applied migration becomes a gotcha here, or a NEW forward migration; never a patch to
the file.

### Replayability verdict: PASS (executed, 2026-08-02)

`createdb crave_replay_test` → `prisma migrate deploy` with a `DATABASE_URL` override →
**all 215 applied, exit 0**. Verified independently before dropping the scratch DB:
215 finished rows in `_prisma_migrations`; 97 base tables; 7 extensions (plpgsql, btree_gin,
pg_trgm, fuzzystrmatch, citext, postgis, vector). Nothing references a function or extension
before it is created; every backfill is set-based and no-ops on an empty database; the
`crave_fold` create→use→drop arc replays clean. See F300.

### The epochs — what the model moved FROM and TO, and why

1. **Monolith baseline** (20240901). One `entities` table (restaurants, foods, and both
   attribute kinds in one polymorphic bag), `connections` (restaurant×food), denormalized
   `boosts` / `category_aggregates`, users + Stripe subscriptions. Restaurant location was
   COLUMNS ON THE ENTITY. Array-of-UUID columns guarded by a `validate_entity_references()`
   plpgsql CHECK — the shape everything since has been unwinding.
2. **Locations split out** (2025-02). `restaurant_locations` + a `primary_location_id`
   pointer: a restaurant is not a point.
3. **Polls, billing, notifications** (2025-03). The poll/vote model and the
   provider-neutral billing surface (Stripe **and** RevenueCat) arrive.
4. **The naming convention war** (2025-12). Domain **schemas** (`core.`, `polls.`, `users.`…)
   were tried in 20251216100000, then **reverted one migration later** (20251216110000) to a
   single `public` schema with `core_*` / `poll_*` / `user_*` / `collection_*` / `billing_*`
   table PREFIXES. That prefix law still governs every table name today. Expect long
   rename-only migrations through this era; they are data-preserving.
5. **Markets** (2026-04 → 2026-05). PostGIS lands; Census CBSA/place boundaries, a `markets`
   table, `market_key` stamped across a dozen tables. Then provider-neutrality: Census →
   TomTom, `local_fallback` → `locality`, app-owned `regional`.
6. **Markets EXTERMINATION** (2026-07). The whole market layer is deleted — `market_key`
   columns, `core_markets`, `core_entity_market_presence`, `geo_boundary_features`,
   `market_bootstrap_events`, the `market_type` enum (20260722120000, "leg 4"; legs 1-3
   removed readers/writers first). **Never reintroduce it.** Its replacement is the epoch below.
7. **The Places catalog + Signals ledger** (2026-07, `geo-demand-foundation-rebuild`). The
   current substrate: `places` (a containment DAG), `place_geometries` (PostGIS ground),
   an append-only immutable `signals` ledger with pseudonymous `signal_actors`, and
   `signal_demand_daily` as a REBUILDABLE derived read model. Collection re-keys from
   markets onto **sources/engines/lanes**. `signals` becomes monthly RANGE-partitioned
   (20260720110000) with a row-count invariant guarding the copy.
8. **Crave Score, four times** (2026-05 → 2026-06). cutover → v3 (endorsement redesign) →
   rising/heat as an explicit **EXPAND then CONTRACT pair** (20260627 / 20260628 — read that
   pair for the house style on a two-release destructive change) → a 0-10 native display scale.
9. **The one-ground charter** (2026-07-28 → 07-30). A place has ONE ground: its polygon.
   Stored bbox columns die (20260730060000), a real FK protects grounds from orphaning,
   and identity dissolves to the vendor's own key — (geometry id, entityType).
10. **Identity, folded** (2026-08-01/02). The last four days are an identity-key saga worth
    reading in order: a GENERATED stripped-key column → a Unicode-aware `crave_fold()` SQL
    function mirroring the TS fold → an empty-fold guard (every CJK/Cyrillic name folded to
    `''` and collided) → and finally the retreat to an **APP-WRITTEN** `identity_key`, because
    Postgres Unicode character classes are **platform-dependent** (glibc PG17 ≠ mac PG18).
    `crave_fold()` is dropped in 20260802050000. One implementation, in TS.
11. **`timestamptz` everywhere** (20260802060000). 162 columns converted off naive
    `timestamp`. The header is the best short essay in the corpus on why fixing a TYPE
    deletes the mitigations, not just the bugs. **One structural exception:
    `signals.occurred_at` stays naive** — Postgres refuses to alter a partition key's type.

### Gotchas a future migration author must know

- **THE SERIAL-PLAN LAW.** Prod postgres has a small `/dev/shm`. Any STORED-column rewrite,
  `ALTER COLUMN ... TYPE`, or event-table-wide join MUST open with
  `SET max_parallel_workers_per_gather = 0; SET max_parallel_maintenance_workers = 0;`
  or it dies on "could not resize shared memory segment" and P3009-crash-loops the boot.
  Five migrations do this correctly (20260801230000, 20260801240000, 20260802010000,
  20260802030000, 20260802050000). **20260802060000_timestamptz_everywhere — the heaviest
  rewrite in the corpus — does NOT**, despite being authored later (F303). It is applied
  history and cannot be fixed; treat it as the cautionary example, not the pattern.
- **`prisma migrate dev` will try to DROP objects Prisma cannot model.** This ALREADY
  HAPPENED: the HNSW vector index was silently dropped inside an unrelated poll migration
  and had to be recreated (see the excellent in-file note in
  20260705003434_recreate_entity_name_embedding_hnsw). The same exposure covers the partial
  and expression indexes on `core_entities`, the `places` partial unique, the `curated_lists`
  NULLS-NOT-DISTINCT unique, **`place_geometries.geometry` (PostGIS — reported as a removed
  COLUMN)**, and the `signals` composite PK **(dropping which breaks partitioning)**.
  `migrate deploy` does not diff, so prod is safe; on dev, REJECT these auto-generated drops.
  Full triage in F304.
- **Spell drops with the name POSTGRES knows.** `DROP TYPE IF EXISTS "SearchEventKind"` is a
  silent no-op — the type is `search_event_kind`. Three enum types survive on every database
  because of exactly this (F301). Prisma's PascalCase model name ≠ the snake_case DB type.
- **Same-timestamp directory prefixes break ties ALPHABETICALLY on the suffix.** Eight groups
  currently collide (incl. a three-way tie at 20260801140000). Deterministic, and the replay
  proves today's order is dependency-correct — but a new colliding migration whose suffix
  sorts before something it depends on fails only on a FRESH database (F306).
- **`signals` partitions are minted by a cron, and `CRONS_ENABLED=false` kills it.** The
  migration only tiles through 2026-10; `SignalPartitionMaintenanceService` keeps
  [current .. current+2] alive daily. A missing partition FAILS the insert, and the §3 writer
  SWALLOWS write failures — so the symptom is silently dropped signals, never an error (F305,
  compounding F205).
- **Place-grounded restaurants are never deleted** (~$118 lesson, CLAUDE.md). The data-repair
  migrations honour this: 20260801210000_restaurant_junk_archive ARCHIVES junk venues and
  carries an explicit **user-anchor exemption** (H-E-B had 43 curated list items). Any
  cleanup migration you write must do the same.
- **The corpus has no dead tables** (F307). Table deaths here are explicit, reasoned, and
  usually carry a measured audit in the header. Keep that standard: these headers are the
  primary documentation of WHY the model is shaped as it is, and several (Phase C purge, the
  cuisine facet, `timestamptz` everywhere, the rebuild-floor pair) are worth reading in full
  before touching their subject area.

## Territory: api-places-enrichment

`apps/api/src/modules/{places,restaurant-enrichment,attribute-ontology,estimators}`
— 44 files. Two independent systems that share a spend posture, plus two small ones.

### What is here

**The place catalog** (`places/`) is a containment DAG mirroring TomTom's own
geography entities. **A place is a mirrored vendor entity** — that one sentence
explains most of the module. Identity is the vendor's composite key
`(providerPlaceId, providerLevelCode)`; an observation that does not name an
entity is REFUSED at the door, not reconciled. There is exactly ONE ground
representation: every place has a row in `place_geometries`, born as a
rectangular sketch envelope (`provider_boundary_id IS NULL`) and upgraded IN
PLACE to the vendor outline by the promotion drain. There are no bbox columns —
the bbox is DERIVED from the ground at the moment of use.

**Restaurant enrichment** (`restaurant-enrichment/`) grounds restaurant entities
to Google Places: primary grounding (autocomplete/text-search → candidate
ranking → optional Gemini chooser → place details), secondary expansion
(attach every same-domain + same-brand-name place as an additional location),
cuisine extraction, a weekly lifecycle janitor, entity merging, and the nightly
convergence coordinator.

**Attribute ontology** (`attribute-ontology/`) adjudicates quarantined
(`pending`) attribute vocabulary into the active set via embeddings for recall
plus a narrow LLM decision for precision. **Estimators** (`estimators/`) is one
file: the Estimator primitive (self-erasing priors). Its only consumer today is
poll supply — it is NOT dead, despite living alone with a single commit.

### Entry points

| Surface              | Entry                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Viewport slice read  | `GET /places/in-view` → `PlacesCatalogService.placesInView`                                                                 |
| Header verdict       | `GET /places/viewport-verdict` → `ViewportVerdictService` (polls feed calls the same service — one law, one implementation) |
| Cold-start camera    | `GET /places/launch-position` (public, `@AllowUnentitled`)                                                                  |
| Naming observation   | `PlacesReconcilerService.noteViewport(view)` — fire-and-forget, returns void synchronously                                  |
| Outline promotion    | `PlacesPromotionService.enqueue` (via `PLACE_BIRTH_LISTENER`) + hourly `drainTick`                                          |
| Restaurant grounding | `RestaurantEnrichmentQueueService.queueEnrichment` → worker → `enrichRestaurantById`                                        |
| Nightly convergence  | `NightlyConvergenceService.runNightly` — the ONE 3AM cron                                                                   |

### Invariants, and why

- **1:1:1 — every place has exactly one ground and one promotion row.** Verified
  on the local mirror: 22,770 / 22,770 / 22,770, zero places without a ground,
  and exactly 3 sketch-grade rows which are exactly the 3 unpromoted queue rows.
  This is what makes "the ground judges, the bbox only indexes" safe: there is no
  bbox-only fallback arm to get wrong.
- **A ground only ever gains detail.** Sketch writes carry
  `WHERE provider_boundary_id IS NULL`, so a landed outline can never be
  clobbered; sketch widening is grow-only via SQL against the LIVE row so
  concurrent widenings compose.
- **One vendor entity belongs to at most one place, per level.** Enforced in
  `promoteOneUnmetered` before the scarce draw is spent. The refused place keeps
  its honest sketch envelope — "the vendor does not model this place separately".
- **A failure is not an observation.** `TomtomChainProbeResult` is
  `named | empty | failed`; only `empty` carries a region that may be remembered.
  This type is why a whole bug class stopped recurring — read its docblock.
- **Place-grounded restaurants are never deleted** (CLAUDE.md's $118 law).
  Everything archives. `enrichMissingRestaurants` and the janitor both filter
  `status = active` so tombstones never buy Places data again.
- **The ledger is never rekeyed; merges write `entity_redirects`.** The merge
  service rekeys events and rehomes user anchors, but user-act history resolves
  through redirects at read.

### Gotchas that will bite you

- **`yarn test` does not run `places-containment.integration.spec.ts`**
  (`testPathIgnorePatterns`). Only `yarn test:db` does, and only CI runs that —
  behind a `Lint` step that is currently failing. That file holds the REAL
  spatial semantics; several unit specs explicitly delegate to it. Run it by
  hand: `DATABASE_URL=postgresql://$(whoami)@localhost:5432/crave_search npx jest
--testPathIgnorePatterns='[]' --testRegex='places-containment.*integration'`.
- **Several unit specs string-match generated SQL.** Two are mutation-proved
  always-green (F370, F371) — a janitor that archives healthy rows and a
  viewport cap of 1 both pass. Do not read a green unit suite here as proof.
- **The PostGIS `geometry` column lives OUTSIDE the Prisma model.** Any
  polygon-precise operation is `$queryRaw`. Prisma will not help you.
- **Never union view arms into one geometry for an index operand.** `&&`
  compares bounding boxes, and the bbox of two arms at ±180 is the whole world.
  Measured: union form 693 rows/seq-scan, per-arm 1 row in 0.18ms.
- **`enrichSecondaryLocations`' `locationBias` parameter is dead** — its one
  caller passes two arguments, so live expansion is an UNBIASED global name
  search. Do not reason about metro behaviour from the signature (see F353; this
  corrects a premise of the ruled P2.2 design).
- **The three enrichment queue services are one concept written three times**
  and their divergences are accidents, not policy (F356). Only the primary
  lane captures a spend campaign.
- **The `Cron`-suffixed methods are not crons.** The round-12 coordinator took
  the decorators off the phase services; `sweepSameNameDuplicatesCron` is
  uncalled residue and `NightlyConvergenceService` calls the underlying method
  directly.

### Deliberate absences — do not "fix" these

- **No fallback place-minting lane.** Owner ruling 2026-08-01, "TomTom or
  nothing": a droughted poll creation refuses honestly rather than minting a
  synthetic place sized by the creator's zoom. It had minted zero rows ever.
- **No county-axis name-identity table**, no `resolveGeometryId`, no census
  cheap-geocode step, no `[lodev]`-style attention memory for header answers.
  All deleted deliberately ("THE FINAL DISSOLUTION"). If a chain node arrives
  id-less, that is a vendor contract change to investigate — not a reason to
  resurrect name matching.
- **The catalog mirror is ACCRETIVE, never re-synced.** Parent edges only
  append, scalars only gap-fill. A vendor RESTATEMENT leaves the old truth
  standing. This is a recorded, accepted trade; the honest fix is a
  vendor-refresh sweep built when a real restatement is first MEASURED.
- **Per-metro chain entities were REJECTED** (P2.2). One brand entity, many
  locations, search geo-scoped by locations. Do not reintroduce branch-level
  entities.
- **Cuisine extraction is once-ever per restaurant** — deliberate today, though
  the machinery for "has the evidence changed" was built and left unwired
  (F369).

### Verdicts from the 2026-08-02 rederivation pass

- `places-catalog.service.ts`, `places-reconciler.service.ts`,
  `tomtom-chain-probe.port.ts`, `place-dag-read.ts`,
  `viewport-verdict.service.ts`, `places.controller.ts`,
  `nightly-convergence.service.ts` — **IDEAL-VERIFIED**. I tried to find the
  seams and mostly could not; where a docblock states a law, the code implements
  that law. The observation type and the one-ground unification are the two
  ideas doing the most work.
- `places-promotion.service.ts` / `tomtom-chain-probe.adapter.ts` — right shape,
  but "a consumed draw" is defined three different ways across the pool, the
  usage ledger and the campaign envelope, and the two that cost money disagree
  with the one that spends it (F350).
- `restaurant-location-enrichment.service.ts` — 4,706 lines, ~95 methods, and
  the only file in the territory that has not been rederived. It is where the
  money is and where the open findings cluster (F352, F353, F354, F363).
- `estimators/estimator-registry.ts` — a good structural law (no self-gating
  estimator without an exploration mechanism) sitting on top of three declared
  fields that nothing reads (F358).

---

## Territory: api-core + api-scripts (the boot, the config, the shared seams, and 100 scripts)

Pass 1, 2026-08-02. `apps/api/src/{shared,config,prisma,sentry}`, `main.ts`,
`app.module.ts`, `test/`, `data/`, the tsconfigs/Dockerfile/package.json, and
all of `apps/api/scripts/`. Findings F400–F423.

### The boot story, in order

`node dist/main.js` (behind `prisma migrate deploy` in the Dockerfile CMD):

1. **`main.ts` top-of-file, before any Nest import.** `dotenv` loads `.env`
   from cwd then from `__dirname/..`, then `Sentry.init()` runs — it MUST
   precede the module graph, which is why its config cannot come from
   `ConfigService`. `beforeSend` strips auth/cookie/x-api-key headers and
   top-level password/token/secret from bodies.
2. **`AppModule` static evaluation.** Two decisions are made at MODULE level,
   before any provider exists, and both are gates rather than runtime checks:
   `isSchedulerRuntime()` decides whether `ScheduleModule.forRoot()` is
   imported at all (this, not `stopCronsUnlessWorker`, is the real cron
   chokepoint — F412), and `isDebugRoutesEnabled()` decides whether
   `DebugModule` exists. `ConfigModule.forRoot({isGlobal, load:[configuration]})`
   then assembles the whole config object once.
3. **`bootstrap()`.** Fastify with `trustProxy: 1` (exactly one hop — Railway's
   LB); `fastify-raw-body` opted in for the two webhook routes whose providers
   sign raw bytes; helmet/CORS/validation-pipe/Swagger all keyed off
   `isProd = NODE_ENV === 'production'` (F404); global prefix `api/v1` with
   health/legal excluded; `enableShutdownHooks()`; listen on `::` (dual-stack,
   so the iOS simulator's `::1` resolution works).
4. **Module init.** `PrismaService.onModuleInit` is the loud gate:
   `assertNotProdDatabaseFromDev()` (a non-deployed `APP_ENV` may not open a
   Railway host), then `DatabaseValidationService`, then `$connect`, then
   `assertClientSchemaCoherence()` — three `findFirst` calls with no `select`
   so a stale generated client fails THE BOOT instead of 500-ing every authed
   request at the auth guard (the 2026-07-09 incident).
5. **Per-request.** `LoggingInterceptor` (global, from `SharedModule`) opens an
   AsyncLocalStorage `RequestContext` and logs; `SentryInterceptor` (global,
   from `SentryModule`) opens a performance span; on failure
   `GlobalExceptionFilter` (global `APP_FILTER`) formats an `ErrorResponseDto`
   and logs by STATUS.

**The three boot audits are three different seams, not three copies.**
Paywall-coverage and signal-coverage are route-graph scans that run at boot and
refuse to start on an uncovered route; the Clerk audience check is a
constructor-time config refusal. They share the fail-at-boot posture and
nothing else — no consolidation is called for.

### The config law, audited

`configuration.ts` (559 lines) is the single assembly. Provenance is unusually
well kept: nearly every number carries the measurement, incident, or owner
ruling that produced it (the Places per-operation ceilings are derived from
`api_usage_ledger` percentiles; the LLM model default IS the A/B decision; the
`revenueCat.entitlementMap` has NO default on purpose). Three structural
problems, none of them about a wrong number:

- **A third of it is unread.** A census of all 69 `config.get('<key>')` call
  sites in `apps/api/src` shows `logging`, `sentry`, `throttler`, `jwt`,
  `onDemand`, `restaurantEnrichment` and `clerk.publishableKey` have **zero**
  readers, and `pushshift` has two out of ~40 keys. `JWT_SECRET` is still set
  in `.env` and read by nothing (F405).
- **The falsy-zero class is ABSENT here, and that is not luck.** Every default
  is applied to the raw env STRING (`process.env.X || '0'`) before `parseInt`,
  so a deliberate `0` survives — a string `'0'` is truthy. The class lives
  where a NUMBER is defaulted, which is `governance.service.ts`'s
  `readSpendCapUsd` (already fixed and spec'd). Do not "modernise"
  `configuration.ts` to `??`; the current shape is correct.
- **NODE_ENV vs APP_ENV is the real fault line** (F404). `app-env.ts` exists
  because staging must be deployed-but-not-prod, and its header is the best
  explanation of anything in this territory. Boot then keys the
  security-bearing decisions off raw `NODE_ENV` anyway, `configuration.ts`
  carries a verbatim second copy of `resolveAppEnv` (F403), `job-control.ts` a
  third (F420), and the debug-routes gate compares `APP_ENV` to string
  literals so `production`/`PROD`/`stage` sail past it (F402).

### The seams, and their health

| seam             | home                                                                     | verdict                                                                                                   |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| env flag reading | `shared/config/env-flag.ts`                                              | ideal, **under-adopted** — `CRONS_ENABLED` (F401) and `ENABLE_DEBUG_ROUTES` (F402) still hand-roll it     |
| app environment  | `shared/config/app-env.ts`                                               | ideal, **under-adopted** — three hand-rolled copies of `resolveAppEnv` remain                             |
| logging          | `shared/logging/logger.interface.ts` (abstract) → `WinstonLoggerService` | **BROKEN** — see below                                                                                    |
| crash reporting  | _nominally_ `LoggerService.error`                                        | **SEVERED (F400)**                                                                                        |
| exception → HTTP | `GlobalExceptionFilter`                                                  | sound shape; leaks typed 500 messages in prod (F422) and misclassifies network errors as DB errors (F423) |
| cron containment | `app.module.ts` module gate (deployed) + `stopCronsForScript` (scripts)  | structural for the app, **by-convention for scripts** — one file already escaped (F411)                   |
| guard scanners   | `shared/testing/{code-only,import-scan}.ts`                              | ideal; the best-derived code here, and under-applied (F421)                                               |
| branded ids      | `shared/types/ids.ts`                                                    | ideal — honest about what branding CANNOT do (same-type transposition)                                    |

**The one thing to know: the API sends no logged error to Sentry (F400).**
There are two classes named `LoggerService`. The abstract one in
`logger.interface.ts` is what DI binds and what everything injects. The
concrete one in `logger.service.ts` holds `captureToSentry` and is imported by
nothing but its own spec. Three comments assert the seam works. It does not,
and never has. Proven by executing the shipped class with Sentry mocked: zero
captures. Fix F407 (the interceptor double-logs every exception at error level,
regardless of status) in the same change, or repairing the seam turns every
404 into a metered Sentry event.

### The scripts inventory (100 files)

`tsc --noEmit -p tsconfig.json` is green across `src` + `test` + `scripts`, and
spot-executed zero-reference scripts still produce real output. **Nothing here
is rotted.** What is missing is a lifecycle (F414):

- **26 executably wired** — 5 via `apps/api/package.json`; 11 via
  `scripts/rig/reextract.sh` + `cost-reconcile.sh`; 1 via
  `.claude/skills/reextract/SKILL.md`; 2 via `eslint.config.mjs` allow-lists;
  the rest imported or read at runtime by another script.
- **~52 mentioned only in a `plans/`/`product/` doc or a source comment** —
  banked as provenance, not runnable by any runner.
- **22 with zero references anywhere** outside `audit/COVERAGE.md`, including
  four `rt-*.ts` committed the same day.
- **No `.github/workflows/` file references any script in this directory.**

The `tsconfig.json` exclusion of `scripts/search-harness/rt-*.ts`
("red-team/exploratory harnesses: throwaway by convention") shows the
convention was already felt — it was just never made operational. The proposal
is a mandatory class header (operational / banked probe / scratch) plus a
lockdown spec, NOT a deletion sweep: several zero-reference scripts are
working, valuable diagnostics whose only sin is that nobody wrote down what
they are for.

**`scripts/reload/*.sql` is the exception and the model (F417).** All six files
were EXECUTED against the local mirror and are schema-coherent today. Every
destructive statement carries the incident that produced it; the preservation
laws (RESTAURANT LAW, USER-ANCHOR LAW, REFERENCED-MEANS-ALIVE,
TOMBSTONES-ARE-MEMORY) live once in `preserved-anchors.sql` and are `\ir`-included
by the three consumers rather than restated; `shadow-discard.sql` opens with a
`DO` block that REFUSES to discard an activated generation. This is what the
rest of `scripts/` should aspire to.

### Gotchas that will bite you

- **`stopCronsUnlessWorker` is an empty function.** Probing
  `app.get(SchedulerRegistry)` on the application PROXY throws through Nest's
  ExceptionsZone and kills the process before any `try/catch` sees it, so the
  cron gate had to move to module import. `main.ts`'s "ONE chokepoint" comment
  is stale (F412). `stopCronsForScript` is real and still required.
- **Jest's `rootDir` is `src`.** A spec under `scripts/` or `test/` is never
  discovered. `test:e2e` points at a `jest-e2e.json` that does not exist, and
  the three `test/*.ts` files are empty placeholders (F410).
- **`apps/api/.eslintrc.json` is dead** — it extends a root file that does not
  exist; the live config is `eslint.config.mjs` (F409). Likewise
  `apps/api/.dockerignore` (build context is the repo ROOT, so the root one
  wins) and `.jestignore` (not a Jest feature) — F419.
- **`apps/api/pnpm-lock.yaml`** is a 340KB stale second dependency truth in a
  yarn workspace (F418).
- **`job-control.ts` lives at the package root**, outside `scripts/` and
  outside the lint project, and derives the BullMQ key prefix itself — a drift
  there means its `clear` command wipes the wrong environment's queues (F420).
- The `logger.error` metadata redaction is exact-key-match, so `apiKey` and
  `accessToken` pass through, and `LoggingInterceptor` logs whole request
  bodies under 10KB (F416). `CorrelationUtils` puts an UNVERIFIED JWT `sub`
  into every log line's `userId` (F408).

### Deliberate absences — do not "fix" these

- **No `sentry` config namespace reader.** `Sentry.init` must precede Nest;
  the fix is to extract one importable resolver, not to make Nest own it (F406).
- **No `revenueCat.entitlementMap` default.** Unconfigured is unconfigured.
- **No JWT auth.** Clerk owns it; the `jwt` config block and `JWT_SECRET` are
  residue (F405).
- **`configuration.ts` defaults the env STRING, not the parsed number.** That
  is what keeps a deliberate `0` alive.

### The scripts corpus, pass 2 (2026-08-03) — what the lockdown actually reaches

Pass 2 re-read the 48 rows pass 1 left PARTIAL. That set turned out not to be a
judgement call: it is EXACTLY the set of files carrying no `@script-class`
header (executed `comm` of the two censuses — 48/48, zero difference). Pass 1
stopped precisely where the containment lockdown's reach stops, and the reason
it stops there is a defect (F1252).

**The reach is one file deep.** `script-containment.spec.ts` finds scripts with
a FILE-LOCAL `includes('createApplicationContext')`. Twenty-one search-harness
scripts boot the full Nest graph through `bootstrap()` imported from
`_shared.ts`; `_shared.ts` carries the header, so the suite is green while
those 21 are invisible to both assertions. This is the `filesImporting()`
disease the spec's own docstring quotes itself curing. The cron half is safe
only by luck of construction (`_shared.bootstrap()` happens to call
`stopCronsForScript`), and the `booting.length > 30` floor cannot see the gap —
it counts 48 and passes. Nothing in the corpus reaches a `.sql` file at all,
which is why the two most destructive files in the tree carry no class.

**Booting Nest is not free, and it is not read-only.** Running the
self-described "PURE read-only" `corpus-integrity.ts` minted a billed Gemini
system-instruction cache (79,513-char prompt, 3h TTL) and re-derived durable
spend-pool state, both from `onModuleInit`. The lesson is already written three
lines away in `llm.service.ts` — the QUERY cache was made lazy for exactly this
reason ("minting it at boot made every script run rent a cache it never read")
— and stops there. `stopCronsForScript` is one member of a family nobody has
named: _a script boot must not start billed or mutating background work_
(F1257).

**The wipe family is sound; the LAW it encodes has a hole.**
`wipe-city-derived.sql` + `preserved-anchors.sql` were re-verified against
every migration landed 2026-08-02/03 and run clean end-to-end as a dry run
(F1251) — no schema drift, and F417's `-v dryrun=1` rehearsal seam works. But
the user-anchor set is an ENUMERATION of surfaces, and `messages.shared_entity_id`
(entity shares in DMs — a bare `core_entities` uuid in a `text` column, no FK)
is not on it. A wipe deletes an entity a user shared in a conversation and the
share card is permanently "unavailable" — proven RED on the mirror, with a
GREEN control through a surface the set does cover (F1250). The file's header
calls itself "THE canonical user-anchor set (single source of truth)"; a
hand-maintained list cannot be that for a growing schema.

**Three recurring shapes across the corpus**, each with a live instance:

- _A replica nobody re-synced._ Five harnesses replicate the linker's decision
  in-script and call `0.82` "the live rule". The flip shipped; the service now
  reads `linker-calibration.generated.ts`. The worst case is the file that was
  PARTIALLY updated — it uses the generated floors and still prints
  `threshold=0.82` (F1260).
- _A one-off that outlived its subject._
  `data-fixes/fix-integrity-defects.sql` is 503 destructive lines targeting 26
  hard-coded entity ids — 0 of 26 still exist — through 9 tables that no longer
  exist, arguing at length for a market-presence model exterminated in July
  (F1253). Its README still publishes the 2026-07 defect counts as the
  baseline; the gate now returns entirely different numbers.
- _A default pointed the wrong way._ `validate-crave-score-fixtures.ts` runs an
  unlocked global `rebuildAllScores()` BY DEFAULT (`--skip-db` is the opt-OUT),
  reaching past the advisory-locked `RescoreCoordinator` that §12.6 makes the
  sole authority — while `rebuild-crave-scores.ts`, two files over, does it
  correctly (F1254). The corpus already knows the right polarity: the wipe
  script's own closing comment reasons about opt-in vs opt-out and picks opt-IN
  for the routine sweep.

**Also standing:** three `rt-*.ts` red-team scripts write to whatever
`DATABASE_URL` names with no env guard, are excluded from `tsc`, and clean up
on the happy path only, under a README that calls the family READ-ONLY (F1255);
`seed-google-photos.ts` raw-fetches billed Places endpoints outside
`api_usage_ledger`, contaminating the billed-vs-ledger reconciliation the cost
law depends on (F1256); and `lib/gazetteer-names.ts` is still the orphan F414
ratified for deletion and never deleted (F1259).

## Territory: apps/api/src/modules/content-processing — the heart (pass 1)

**The pipeline, end to end.** `CollectorPacerService` (10-min cron,
worker-only, `COLLECTION_SCHEDULER_ENABLED`) selects due (source, lane)
rows ordered by normalized lateness = (now − dueAt) ÷ latenessTolerance
— the owner's "days late is fine, months is not" AS the scheduler. No
cycle budget: capacity comes from the governor. Each dispatch reserves
the adapter's declared estimate on the reddit pool; real accounting
happens at the client chokepoint. A pool denial is a typed not-now —
the lane stays due, never errors, never brands a cooldown.

Two lanes. **chronological** (/new, the unbiased sampling lane feeding
docsPerDay) revisits on a derived interval: clamp(0.5 × 1000 ÷ measured
posts/day, 2h, 14d) — 1000 is a vendor fact, 0.5 guarantees one missed
tick can't overflow the window, the 14d clamp IS the measurement's own
lookback. **keyword** (pull, biased, never feeds docsPerDay) selects
≤25 terms/dispatch from four families — unmet / refresh / demand /
explore — floors only on unmet (0.2) and explore (0.08). **archive** is
a one-shot pushshift sweep, never a standing lane. Heavy sorts ride a
60-day watermark.

**Collection → evidence.** Fetch → self-healing orphan-parent sweep →
STAGE the window on the lane row without moving the cursor → register
expected fan-out → enqueue. Batch gate (freshness + comment-delta) →
persist FIRST (a rejected doc is still paid-for evidence) → relevance
gate → pre-LLM coverage gate → atomic claim → Gemini (batch mode ~50%
price) → the same completeChunkPlan as interactive.

**Evidence → identity → projection.** Resolution (exact → alias →
recall+judge → create under advisory lock) → stale ids revalidated
through redirects at write → two append-only ledgers → SAME-TX
supersede-delete of same-generation events + pointer flip. Projection
rebuild from ACTIVE evidence only, per-restaurant locked, full-replace.
Rescore is a singleton debounced coordinator; collection only marks
dirty.

**Invariants + why.** (1) The cursor moves only when evidence exists —
crash = free re-fetch. (2) Activation is atomic with the write — old
evidence can't die before its replacement exists. (3) Supersede is
within-generation; cross-generation deletion belongs to explicit
discard — rollback is a pointer flip. (4) Identity is global and never
versioned — that sharing is why a user's saved restaurant survives a
re-extraction. (5) Place-grounded restaurants are never deleted; user
anchors survive as starved (zeroed, unrankable). (6) Numbers are facts,
owner choices, or derivations — the collector was purged of timers
once; eligibility derives from measured harvest share.

**Entry points.** Pacer tick → job scheduler / keyword orchestrator →
Bull → batch workers → ExtractionPipelineService.processPosts. Replay:
scripts/replay-extraction-run.ts. Re-extract: REEXTRACT\_\* env →
CityReextractRunner (refuses without an approved campaign; pinned
prompt version REQUIRES shadow mode).

**Deliberate absences.** No cycle budget (the governor is capacity). No
cooldown timers (derived eligibility). No generation column on derived
tables (identity is shared on purpose). No poll_surface pull lanes
(push-complete).

**Gotchas.** CollectionEvidenceService is a CORE provider with @Crons —
inert only because ScheduleModule loads on worker runtime alone
(verified). collector-source-registry's evaluateCostBreach hand-mirrors
SQL — change both or you've found the bug the duplication exists to
catch. Replay requires source_map; pre-SRC### inputs unsupported.
activateDocumentsBeforeProcessing trims to chunks that produced output.

**Rederivation verdicts (pass 1).** Campaign-hardened core
IDEAL-VERIFIED with argument (scope service lockdown proven RED under
mutation; fold + fixpoint lemma; evidence lifecycle; loss-horizon
asymmetry; derived keyword eligibility; scheduler-runtime gating).
Fresh findings F450–F478: archive-seam integrity (random ids, string
created_utc, truncation-reports-success), always-green/always-red
instruments, three copies of the supersede law (one dead), Latin-only
similarity defeating the multilingual fold, eight env-flag dialects,
and an undeclared-constants ledger escalated for K-classification.

## Territory: api-search + api-polls (the read side, and the demand engine)

**What it is.** Two modules covering the entire READ path (a free-text
query becomes two ranked lists) and the polls subsystem (the weekly
demand ritual that mints synthetic evidence). ~108 files, ~33k LOC.
The four fat files carry the weight: `search.service.ts` (3.5k, the
orchestrating brain), `search-query.executor.ts` (2.7k, DB + open-now
two-phase + result mapping), `search-query.builder.ts` (2.4k, the SQL
factory), `polls.service.ts` (2.5k, poll CRUD + leaderboard).

### The read pipeline: query → interpret → build → execute → rank

**1. Interpret (`search-query-interpretation.service.ts`).** CUTOVER
2026-08-02: the per-search LLM is GONE. The gazetteer IS the Understand.
`interpret()` calls `interpretViaGazetteer` unconditionally. It scans
the raw query against the closed set of known entity names/aliases
(`EntityTextSearchService.scanForKnownEntityGroups`, one indexed UNION
of a `lower(name)` btree arm + a GIN alias arm, both `status='active'`,
restaurant arm territory-scoped to the viewport's covering engine).
Tokens no grounded span covers are RESIDUE; each residue run is probed
JOINED with its strictly-abutting grounded neighbours FIRST (the
residue-join rule: "brekfast tacos" reaches the compound "breakfast
taco"), then bare, through `linkUnified` — ONE retrieval over all types
→ one candidate pool → one decision (exact-anywhere-beats-non-exact-
everywhere; calibrated per-tier floors for fuzzy; tie-plurality reveals
ALL indistinguishable ids). Placement is a pure function: dietary flag
wins, else a fixed cross-type order. Unknown residue ≤2 tokens records
an `on_demand_ask` signal directly; 3+ tokens stage for the async LLM
splitter (`unsegmented-residue.service.ts` cron). NO WORD LIST (owner
ruling): junk grounding is a data-quality defect owned by extraction
hygiene, not a stop-list — hence 5 pinned generic-query specs are
skipped pending graph cleanup.

**2. Build constraints + directives (`search.service.ts` →
`search-constraints.ts` → `search-constraints.compiler.ts`).** Grounded
ids become a `SearchConstraints` with STRUCTURED food grounding
(anchors ∪ family ∪ similar, each a derived view). Food widening is
seeded pre-probe: category members (one-hop `derived_food_category_edges`),
head-final name variants ("carbonara udon" IS carbonara → tier 0), dense
siblings (`derived_entity_sibling_edges`, ceiling-normalized cosine,
mutual-rank reciprocity), twin ingredients ("burrata" the food also
returns pizza containing it). All producers (`search-sibling-expansion`,
`search-entity-expansion`) fail open to [] and re-check `status='active'`
at read (staleness guard). The compiler flattens to a `QueryPlan`.

**3. The pooled gate (the ranking model).** CUTOVER 2026-08-02: the old
relaxation ladder is DELETED (`RelaxationStage='strict'` only; −1,240
lines). Soft (non-dietary) attribute constraints LEAVE the WHERE
membership and become per-row PROVENANCE: a row matching EVERY soft id
is tier 0 ("all words"), partial is tier 1, the dense similar-ring is
tier 2 (in the scan for window-counting, off the served page). ONE
gated query per projection holds the whole pool; a WINDOW count (not a
correlated CTE — that inlines and re-runs per row, measured 20.9s)
decides whether tier-1 rows are admitted: only when tier-0 can't fill
one page (`threshold = DEFAULT_PAGE_SIZE = 25`, owner-chosen "scarce =
< one page"). Dietary ids stay hard walls. `match_tier` rides to the
client as the section divider. Under open-now the RESTAURANT axis
decides the gate on the OPEN full set and the dish query inherits the
verdict (`gateFull` parameterized) — one gate decision per request.

**4. Execute (`search-query.executor.ts`).** Two parallel queries
(restaurant axis + dish axis), each skippable. Open-now is TWO-PHASE:
a lean candidate query (id + hours, no page limit, capped 50k) resolves
openness in JS over the WHOLE ranked set, then the rich query hydrates
the open page by id-position (`array_position`) — the fix for "22 open
pins but 1 card". `executeSeeLocations` is a lean single-restaurant
variant. Rows map to DTOs; scores come from `core_public_entity_scores`
(percentile_rank is the high-precision sort key so the map badge == list
position).

**5. Coverage semantics.** TWO distinct concepts in metadata:
`resultCoverageStatus` (full/partial/unresolved — did results satisfy
intent) and `engineCoverageShare` (`engine-coverage.service.ts`: raw
area share of the viewport covered by engine territories, NO thresholds,
consumers judge). Engine territory = derived union of member-place
grounds + DAG descendants, measured by ST_Union/ST_Intersection in one
round trip. The `/shortcut-coverage` endpoint (`search-coverage.service.ts`)
paints the in-view dots layer.

### The polls pipeline: supply → ballot → membership → graduation → score

**Supply** (`poll-weekly-ritual.service.ts`, hourly cron). Skips
instantly unless an earth timezone is inside its local Sun-09:00 window.
For each due place: read place + per-subject demand mass
(`demand-mass.reader.ts`, aggregate-backed off `signal_demand_daily`,
lineage = self+descendants+ancestors, echo kinds weigh 0, redirects
resolved at read), replay durable cohort outcomes into a fresh
`EstimatorRegistry`, run `decideSupply` (creditRate = demandMass ·
answerYield ÷ viability; 14d-half-life credit; median dither ±1). Publish
the cohort as `PollTopic`(archived birth-certificate) + `Poll`(active,
`closeWindowDays=7`) + tick + supply-state + notifications, ALL in one
transaction (tick row first = idempotency key). Auto-close is a
DERIVATION-AT-READ, not a timer: `isActivePollDueToClose` computes
`launchedAt + window` each cron pass.

**Ballot** (`supply/poll-ballot-mention.service.ts`). At close, each
distinct voter's standing `PollEndorsement` is minted, under the place's
`poll_surface:<placeId>` Source, as: ONE parent ballot document (the
A(τ)=1 carrier, no mention rows) + ONE per-voter synthetic document
(`…:<sha256(userId)[0:12]>`, `rawPayload.voterUserId` set) each with
exactly one evidence row. Per-voter docs exist to satisfy the
content-identity unique + one-(doc,kind) rebuild guard.

**Membership + score.** The ONLY score membership is PLACE-KEYED:
docs live under `poll_surface:<placeId>`, A(τ) matches `community ==
handle`. Voter-doc mass is EXCLUDED from the room's A(τ) in exactly ONE
place (`public-crave-score.service.ts:604`,
`NOT (raw_payload ? 'voterUserId')`) — one poll = one doc, not turnout+1.
Feed membership (`poll-feed-membership.ts`) is a SEPARATE purely-geometric
concern. **Graduation** (`poll-graduation.service.ts`) runs the approved
thread + creator description through the standard extraction pipeline
(real entity creation + Places enrichment); ballot/thread mentions then
move Crave Score exactly like Reddit mentions.

### Invariants, and why

- **Archived is never served — as a PREDICATE.** The builder adds
  `r.status <> 'archived'` (not an accident of score-table membership);
  the red-team note is explicit that 242 archived-but-scored restaurants
  were hidden only by the location gate.
- **Redirect-resolution-at-read** for merged-away ids (F202 class): one
  hop, then never serve an archived husk. Enforced on the profile/status
  paths; NOT enforced on the poll leaderboard or coverage/autocomplete
  injection surfaces (see findings).
- **Fail open** everywhere on the widening/coverage reads: a widening or
  coverage failure degrades results, never fails the search.
- **The claim-identity rollup** (builder `CLAIM_IDENTITY_WHERE_SQL`): a
  direct mention is shadowed only when the SAME document named something
  more specific at the same restaurant — reads the mention LEDGER,
  membership from `derived_food_category_edges` (the ONE authority).

### Gotchas

- The builder mirrors EVERY SQL clause into a hand-maintained `preview`
  string with NO equivalence test — dual maintenance at 2.4k-line scale.
- `buildConnectionConditions` and `buildConnectionMatchConditions` are
  near-identical copies (food/attr/ingredient/twin/votes arms restated).
- Vestigial ladder vocabulary persists: `RELAX_STRICT_THRESHOLD`,
  `strictProbe`, `relaxation` metadata, `stage/stagePresence` — the
  ladder is gone but its names remain, and the pooled threshold reuses
  the constant.
- The gazetteer + all recall lanes are uniformly `status='active'`-safe;
  the leaks are only at INJECTION surfaces (favorites/viewed/resolver
  refetch) that bypass the core.

### What deliberately does NOT exist

- No per-search LLM (gazetteer-only Understand). No relaxation ladder.
  No market filter (the viewport IS the geographic query). No excluded-
  ingredient lane (negation not interpreted; allergen toggles rejected).
  No word/stop list.

### Rederivation verdicts (pass 1)

Read pipeline and polls are IDEAL-VERIFIED in shape (pooled gate,
gazetteer Understand, per-voter-doc + single-point A(τ) exclusion,
derivation-at-read auto-close, fail-open widening). Search + polls +
entity-text + autocomplete jest all GREEN (94+26+133 pass; 5 search
specs intentionally skipped pending graph cleanup). Findings F500–F599
below. The two real defects worth action: F510 (coverage lacks the
archived predicate the builder deliberately added) and F541 (poll
leaderboard skips redirect resolution — merge silently loses
endorsements); highest-value cleanup is the builder's dual-preview +
copy-pasted connection conditions.

## Territory: api-user-surfaces (user-lists, photos, notifications, messaging, history, home)

74 files under `apps/api/src/modules/{user-lists,photos,notifications,messaging,history,home}`. These are the six
surfaces a real person touches: what they SAVE, what they SHOOT, what they're TOLD, who they TALK to, what they've
SEEN, and what the app OFFERS them. Everything else in the repo produces facts; this territory is where a user's own
data lives — which is why the laws here are about capability, anchors, and honesty rather than extraction quality.

**Where the user's data actually is.** Five tables carry it: `user_lists` + `user_list_items` (saves), `photos`
(uploads), `conversations`/`messages` (DMs), `notification_devices` + `user_notifications` (pushes and the in-app
feed), and — for view history — nothing at all: history is a READ over the signals ledger. `curated_list_items` is
app-authored, not user-authored, but a user can copy one into their own list.

**THE ANCHOR LAW, and why it holds.** `user_list_items` and `photos` point at entities that the extraction pipeline
may merge or archive underneath them. Two mechanisms keep them alive: the schema pins both Entity FKs to
`onDelete: Restrict` (a wipe cannot cascade a user's save away), and `EntityAnchorRehomeService.rehomeEntityAnchors`
hard-rekeys them inside the merge transaction — including a conflict-aware fold for `user_list_items` that KEEPS the
user's note and the earlier position rather than deleting the loser. Verified against the mirror on 2026-08-03: zero
list items or photos point at an archived or redirected entity. This is not luck; do not weaken either half.

**The capability law (user-lists).** `UserListAccessPolicy` is the single authority and lives in its OWN module
(`UserListAccessModule`) precisely because it has consumers outside the feature — the messaging share preview — and
exporting it from `UserListsModule` would drag Search, Photos and Signals into every consumer's graph. Read access is
owner OR collaborator OR presented-shareSlug-matches; the slug IS the capability, so rotation is revocation for free.
Mutation is owner-or-collaborator, never the slug. **Visibility is never consulted for access**: it controls DISCOVERY
(profile presence) only — private means unlisted, not locked. A blocked pair gets the same `410 {state:'private'}` a
revoked link gets, so the block never leaks. Everything else is a fail-closed 404. There is exactly one undeletable
list per user: `kind='favorites'`, lazily created on the first heart, enforced by a partial unique index.

**The photo law.** Uploads are signed direct-to-Cloudinary (bytes never touch our server); the incoming transform
strips ALL metadata, so GPS never reaches storage and `takenAt` must come from the client's picker. The lifecycle is
pending → (safety webhook) → (async is-food Gemini gate, fail-open) → live | removed, and every transition is a
CONDITIONAL update so the database arbitrates races between webhook, reconciliation cron and owner-delete. Reads go
through **`PhotoReads`**, a seam named after the invariant rather than the storage: you cannot obtain a photo read
without naming a viewer, and blocked authors are excluded INSIDE the query (pushing the exclusion into the WHERE of
both the page and the count — applied after LIMIT it would be a truncation, not an exclusion). `PhotoReadService` is
deliberately not exported from the module so that seam is the only door.

**The ledger law, as it lands here.** Every authenticated mutating route declares `@RecordsSignal(kind)` or
`@NoSignal(reason)` and boot refuses otherwise. In this territory the only demand act is `favorite_added` (the save)
and `entity_view` (the history record); everything else — creating a shelf, sharing a link, joining a list, sending a
DM, uploading a photo, reporting content — is honestly declared as NOT demand, with the reason written down. Two
caveats a stranger must know: the audit checks that a declaration is PRESENT, not that it is TRUE (F690 found a false
one on `POST /home/lists/:id/save`), and it exempts `@AllowUnentitled` routes, which is a paywall predicate standing
in for an is-this-a-user-act predicate (F645) — so the notifications routes escape it entirely.

**What is derived, and what is stored (the drift line).** Messaging is the model: `frozen`, `isRequest` and
`unreadCount` are all derived at read time with no column to drift, and history's repeat-view valve is a LEDGER READ
rather than a counter. The counterexample is `user_lists.item_count`, a hand-maintained ±1 denorm that was wrong on
26 of 64 lists in the mirror (stored 336 vs 201 actual) and publishes that number to the home shelf, the public
profile and the DM share preview. When you touch this territory, prefer the derivation.

**Two things that read as durable and are not.** The notification `notifications` row is documented as "the durable
dispatch queue with retry" — there is no retry: `failed` is terminal, nothing moves it back, and `attempts` is
written but never read (F640). And `sending` is an orphan state with no reclaim, so a deploy mid-send strands a row
forever (F641). The table is empty today, so nobody has noticed.

**Home is a materializer, not a query.** `CuratedListBuilderService` runs at 6am per live city (live city = a place
with non-poll collection sources anchored to it, never a hardcoded list), ranks everything off the SAME public score
table search reads, and supersedes atomically — delete every other rotation of (city, recipe, owner) and insert, in
one transaction. Its constants file is the repo's model for §16 discipline. The BUILDER filters `status='active'`
correctly; the READS do not (F692), so a list is clean at build and rots for up to a month.

Findings: F600–F698 in `audit/FINDINGS.md`. Flagship items: F600 (item_count drift, measured), F690 (a false
@NoSignal), F640/F641/F642 (the push queue's three lies), F692 (archived-leak on the home surface), F645 (the signal
audit's wrong exemption predicate), F602 (four surfaces, four answers to "is this a saveable restaurant").

---

## Territory: docs (`plans/` `product/` `business/`) — the doc-home map

**These three trees are the owner's living thought. Nothing here is ever
deleted.** The audit discipline for them is a TRUTH AUDIT, not a cleanup: when
a doc asserts something the code no longer does, you append a dated correction
note IN PLACE. An unbuilt idea is not a defect — that is what the backlog is
for. Only a present-tense claim of FACT can be wrong.

### What each home holds

| Home               | Purpose                                                                                      | Entry point                                                            | Governing rule                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `plans/` (209)     | Concrete EXECUTION plans for work in flight — technical, sequenced, mostly finished          | none single; read by cluster                                           | plans go stale honestly, via "⚠️ Superseded by X" banners                               |
| `product/` (15)    | Rolling canonical feature VISION, one file per app area + `scoring/` + two operational files | `product/README.md`                                                    | "edit and delete in place, no changelog scaffolding" — **not actually held**, see F753  |
| `business/` (~130) | The business model + a large evidence corpus                                                 | `business/README.md` → `business/signal/blueprint.md` **v1.1 = CANON** | "where any other file disagrees, the blueprint wins" — **one live exception**, see F740 |

`PRD.md` / `BRD.md` at the repo root are the stale v3 spec. Already known,
already superseded — not a finding.

### Which subtrees are stale-BY-DESIGN (never "fix" these)

The single most important thing to know before touching `business/signal/`:
most of it is **record**, not claim.

- **`testimony/` (64) + `spine/` (11) — RECORD-BY-DESIGN.** Fixed-schema
  extractions of dated third-party transcripts, with `source:` / `date:` /
  `evidence_quality:` / `incentive_flags:` front matter, claims attributed to
  named outside speakers. They make no assertions about Crave's code.
  Auditing them for factual staleness is a category error.
- **`ledger/` (11) + `claims-ledger.md` — STALE-BY-DESIGN.** Phase-2
  cross-examination that explicitly routes contested calls "→ panel Pn". A
  ledger entry reading "unresolved" is correct as an artifact of its phase.
- **`panels/` (15) — STALE-BY-DESIGN.** Two adversarial _briefs_ per panel
  (deliberate advocacy, usually for the position that lost) plus the
  `verdict.md`, which is the actual output. Read verdicts, not briefs.
- **`redteam/` (16) — RECORD.** Its 33 amendments were folded into blueprint v1.1.
- Live non-record docs in `signal/`: `blueprint.md`, `crave-fact-sheet.md`,
  `onboarding-doctrine.md`, `teaser-spec.md`, `owner-questions.md`.

In `plans/`, the whole Feb–Apr 2026 search-decomp / shortcut-submit cluster is
deep archaeology describing a since-rewritten mobile tree. Of 350 unique
`apps/**` paths cited anywhere in `plans/`, 174 no longer exist — and nearly
all of that is this cluster, correctly. **A dead path in an archaeology doc is
not a finding; a dead path in a doc claiming present-tense delivery is.**

### The plans/ clusters

Current canon (touched 2026-08-01/02): data/collection
(`full-reload-charter`, `reextract-choreography`, `one-ground-charter`,
`data-audit-2026-08`, `async-integrity-ideal-shape`), search
(`search-from-scratch-derivation` — **the** post-cutover canon), ops/business
(`production-hardening`, `payments-ideal-shape`), and the 2026-07-27/31
mobile-shell "derivation" generation (`transition-derivation`,
`page-world-derivation`, `native-shell-derivation`).

Exemplary hygiene, follow their example: the **crave-score chain** and the
**sheet/transition chain** each carry explicit "⚠️ Superseded by X" banners
naming their successor.

The one bad cluster: **markets / TomTom / coverage**
(`tomtom-market-cutover-plan`, `polls-coverage-resolution-cutover-plan`,
`restaurant-identity-domain-rollup-plan`). Markets were exterminated
2026-07-22; these docs assert present-tense DELIVERY of that machinery with no
banner at all, and one points readers at another as the current authority.
F720–F723.

### The failure class this territory keeps producing

A claim is most dangerous when it is **replicated**. The `[lodev]` LOD
telemetry harness does not exist — one stale comment at
`SearchMapRenderController.swift:10417` is its only trace in code — yet FOUR
independent doc homes still describe it as a live acceptance harness
(`plans/lod-v5-architecture.md:58` literally calls it "the acceptance test",
plus `lod-ideal-residency-refactor.md`, `toggle-fade-swap-lane.md`,
`product/map.md:27`), and 11 shell scripts still parse its event stream.
**Rank correction work by how many places repeat a dead claim, not by how
wrong any one of them is.**

---

## Territory: repo-tooling (`scripts/` `maestro/` `.github/` `.claude/` `packages/` `visual-baselines/`)

### CI's real statement: "does it compile, lint, build, test — and did anyone bypass the search runtime?"

`.github/workflows/ci.yml` is **one coherent statement**, and it has been
rederived recently and honestly. Four jobs:

1. **build** — the spine. Postgres is `timescale/timescaledb-ha:pg17`, the same
   image family as prod, so every run is also a migration rehearsal on a
   prod-shaped DB. Order is deliberate: **type-check FIRST** (CI used to die at
   Lint, hiding type errors), then lint → build → test → **`yarn test:db`**.
   That last step exists because the DB-backed integration specs are excluded
   from `yarn test` and the real Postgres above was previously serving only the
   migration rehearsal — a red-team P1 catch.
2. **search-runtime-contract-tests** — one check, `root-ownership-gate.sh S7`.
   The comment explains why S7 and not S6, and it is TRUE: S6 is not in
   `enforcedSliceIds`, so gating on it returns `enforced:false, checks:[],
pass:true` and exit 0 — an always-green lie. S7 can actually fail.
3. **no-bypass-search-runtime** — installs ripgrep first, because the guard
   hard-refuses to run without it (a green that means nothing is worse than red).
4. **native-tests** — `swift test` on MapLodKit, macOS runner, pure LOD logic.

Every target CI references exists. There is no exit-127 step. Both static
guards were **mutation-tested** this pass — planted violations, both went RED
with exit 1, file byte-restored — so CI's teeth are real, not decorative.

Its one dishonesty is quiet: `no-bypass-search-runtime.allowlist` declares
`max_count=6` for the two root camera-write checks while the live count is
**0**. Six violations can be reintroduced with CI green (F701).

### The rig's operational contract — the healthiest corner of the repo

`scripts/rig/` (13 files) is the standing operational tooling, and every file
carries a header encoding a lesson someone paid for. Treat these headers as
load-bearing documentation:

| Script                                                           | The law it encodes                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deploy.sh`                                                      | **staging → production, always.** Prod refuses unless staging's `/health` reports the exact commit being shipped. `--force` is the loud hotfix escape.                     |
| `svc-env.sh`                                                     | **`source` it, never run it.** Credentials enter a command exactly one way — from `.env`. No `<tool> login`, because a stateful login duplicates a secret and then drifts. |
| `reload-dev-client.sh`                                           | The dev client requests a DELTA bundle; computed mid-write it boots mixed revisions. Rebuild until two hashes match, then cold-relaunch. Freshness as a verified fact.     |
| `refresh-local-db-from-prod.sh` / `refresh-staging-from-prod.sh` | **One-way, prod → down.** The prod URL is only ever handed to `pg_dump`. Staging keeps prod's schema + corpus SHAPE and never its user data.                               |
| `push-local-db-to-staging.sh`                                    | The default pit-stop: "staging tests what I test."                                                                                                                         |
| `cost-reconcile.sh`                                              | The bill lives in BigQuery, not the ledger. Run after every one-off spend event.                                                                                           |
| `reextract.sh`                                                   | Prompt iteration never pauses collection: live lanes run the ACTIVE version while a CANDIDATE shadow-replays.                                                              |
| `sim-target.sh`                                                  | `EXPO_PUBLIC_*` inlines when METRO STARTS — so switching targets must restart Metro, or the switch is a hope.                                                              |

Two are phase-scoped rather than standing, and are unreferenced by anything:
`grep-invariants.sh` ("Leg 5 gate") and `lifecycle-matrix.sh` ("Phase-3 Leg
1d"), the latter carrying an `expected_red` table meant to be flipped "as legs
3-4 fix them" (F717).

### Root `scripts/` has NO containment lockdown — and it shows

Unlike the api-side scripts corpus (class headers + a spec), root `scripts/`
(57 files) is a flat bag mixing four unrelated classes with nothing in the
filename or header to tell them apart:

1. **LIVE RIG** — `scripts/rig/**`.
2. **LIVE BUILD/LINT** — `deps-check.sh`, `eslint-staged-package.sh`,
   `ios-refresh.sh`, `generate-{dot,pin-bucket}-sprites.js`,
   `visual-regression.js`; wired through `package.json` + `lefthook.yml`.
3. **DEAD MAP-SAGA SCAFFOLDING** — the 11 `lod-*` files (they drive and parse a
   `[lodev]` stream nothing emits) and the perf-scale-probe pair (their flows
   were deleted).
4. **STALE / ORPHANED GATES** — `app-route-runtime-delete-gate.sh` (declared in
   `package.json`, run by NOTHING, currently **RED with 16 failures**),
   `crave-score-cutover-delete-gate.sh` (greps `modules/favorites/**`, renamed
   to `user-lists` — errors on every path), `search-results-prepared-rows-delete-gate.sh`
   (fires on healthy live vocabulary), and the four
   `search-runtime-s4/s5/s6/natural` contracts whose CI steps were removed
   2026-08-02 but whose scripts were not.

That undifferentiated flatness is precisely how a red gate and a dead cluster
stayed invisible. **Porting the api-side lockdown here is the standing
proposal (F716).**

**CORRECTED 2026-08-04 (audit F716/F1653).** This whole section is now
historical: `scripts/scripts-containment-gate.sh` exists, is wired into
`ci.yml`, classifies every script under both `scripts` and `maestro`
(`SCAN_ROOTS="scripts maestro"`), and passes (56 scripts, all classified) —
mutation-proven RED on an unclassified/misclassified file. `app-route-runtime-delete-gate.sh`,
`crave-score-cutover-delete-gate.sh`, and `search-results-prepared-rows-delete-gate.sh`
are all wired into CI and pass. The four `search-runtime-s4/s5/s6/natural`
scripts named above were retired 2026-08-03. The 11 `lod-*` files carry
`@script-class: dead-scaffolding` headers now instead of sitting
undifferentiated. Left for the record so a reader lands on the fix, not the
disease.

### The 2026-07-06 map-saga deletion, and its blast radius

Commit `9f0d26a5a` deleted 22 map-saga maestro flows as "verified-dead
artifacts". The deletion was right — the map shipped — but three consumers were
never updated, and each now points at a file that does not exist:

- `visual-baselines/README.md` names `search-map-validate.yaml` as the source
  of all four baseline PNGs. **The PNGs are the bank and there is no longer a
  replay path** — an intentional visual change can never be re-approved,
  because `--update` has nothing to capture (F706).
- `maestro/perf/map-accept.sh` — which CLAUDE.md still recommends as "the best
  existing outer-shell-drives-and-asserts example" — had BOTH its legs deleted
  (F707). It fails honestly (exit 2), but it cannot succeed.
- `maestro/perf/README.md:107` and `scripts/perf-scenario-scale-probe.sh:19`
  default to deleted flows (F708).

**The lesson to carry: when you delete a fixture, grep for its consumers.** The
same commit's message says "map-accept.sh kept", which is true of the runner
and false of everything it runs.

**CORRECTED 2026-08-04 (audit F708/F1651, Phase-3 residue drain).**
`scripts/perf-scenario-scale-probe.sh` and its report script
(`scripts/perf-scenario-scale-probe-report.js`) were RETIRED — banking re-grep
found zero references outside this doc, audit/, and the user's own memory
file. `maestro/perf/map-accept.sh` no longer exists in the tree either (it is
gone, not merely broken) — the "kept" framing above is now fully stale for
that file. `maestro/perf/README.md`'s Map LOD Pan/Zoom section still names a
deleted flow (`search-map-lod-pan-zoom.yaml`) and now carries its own dated
correction note rather than being struck outright — repair vs retire is an
owner call (F1652).

### `packages/shared` — the cross-app contract

Coherent and genuinely shared, not a shim. A clean three-way barrel
(`types` / `constants` / `geo`), and the asymmetry in what each app pulls is
exactly what you would want:

- **mobile-heavy DTOs**: `MapBounds` (55 mobile / 0 api), `Coordinate` (44/1),
  `RestaurantResult` (42/4), `SearchResponse` (30/5), `FoodResult` (26/4)
- **api-heavy domain vocabulary**: `EntityType` (55 api / 0 mobile),
  `Entity` (33/2), `Connection` (16/1), `GeoBbox` (15/6)
- **true middle**: onboarding vocabulary, `QueryPlan`, `resolveHeaderPlace`,
  the geo `ground`/`slice` helpers

One defect: eleven exports are v3-PRD scaffolding with zero consumers in either
app AND zero internal use (`ENTITY_TYPES`, `API_ENDPOINTS`, `ApiResponse`,
`PaginatedResponse`, `DualPurposeEntity`, `LocationData`, `LocationQuery`,
`EntityFilter`, `EntityInMenuContext`, `EntityInCategoryContext`,
`SearchFixtureMap`) — the file header still says "implemented according to PRD
Section 4.1", and PRD.md is the stale v3 spec (F712). Do not confuse these with
the geo helpers (`normalizeLng`, `bboxLngArcs`, `pointDistance*`,
`probedRegion*`), which look unused from the apps but are live INTERNAL helpers
— merely over-exported.

### `.claude/skills` — live operational tooling, verify its paths

`service-access` (SKILL.md + 11 service references) is accurate: every script
path it names exists. `reextract` is live and its rig scripts exist, but line
107 tells an agent to run `scripts/enrich-restaurants.ts` when the file is at
`apps/api/scripts/enrich-restaurants.ts` — ENOENT at the one step that repairs
missing Places grounding (F714).

### `maestro/` — 59 flows, and the honest state of them

The perf flows are documented as "mostly historical throwaway", and that holds:
`market-demand/` (10 flows) is current search work, the rest is map/polls/sheet
archaeology kept as record. They are cheap to keep and they name the testIDs
that once mattered. A full census of every `id:` selector and every
`crave://perf-scenario-command` verb across all 59 flows found the command bus
healthy (`set_map_camera`, `animate_map_camera`, `submit_shortcut_restaurants`,
`submit_close_then_submit_shortcut` all registered) and only two real rots:
`poll-feed-sort.yaml` taps testIDs that no longer exist (the sort control became
an option-selector sheet — F710), and `poll-card-open.yaml` pins a hardcoded
poll UUID that dies on any DB refresh (F711).

## Territory: mobile-app-core (the app shell, the api seam, money, onboarding, and the shared kit)

235 files: `apps/mobile` minus the four big rooms audited elsewhere (`src/screens/Search`, `src/navigation`,
`src/overlays`, `ios/`). What's left is everything the four rooms stand on — the entry point, the ONE http client,
auth and entitlements, the stores, the shared component kit, the perf instruments, and onboarding.

**The boot order is load-bearing and stated.** `AppEntry.js` → `App.js` → `App.tsx`, whose FIRST import is
`src/polyfills/react-native-codegen` (before gesture-handler, before React) — the comment says it patches react-native
and everything downstream assumes it ran. `App.tsx` then does five things that are easy to miss because they happen at
module scope, outside the component: it builds the QueryClient with **THE UNIFORM FAILURE CHOKEPOINT** (a
`MutationCache.onError` that announces every mutation failure through the one standard modal, suppressed by
`meta.suppressFailureModal` or by an entitlement-lapse tag, and which is also the crash-reporting seam), wires the
announcer's offline read lazily so the modal store stays dependency-free, calls `enableScreens()` and
`WebBrowser.maybeCompleteAuthSession()`, installs the notification handler, and calls `initializeCrashReporting()`
before any module can throw. The component body then mounts ~15 app-root hosts in a specific nesting: `AuthProvider`
wraps the route coordinators; `PurchasesProvider`, `EntitlementLapseHost`, the photo funnel and the camera live INSIDE
the scene runtime provider; the modal/selector/score-info/collaborator/list-edit hosts live OUTSIDE it, beside
`ShareModalHost`. Four dev-only hosts are `__DEV__`-gated; `ResidentShellPrototype` is NOT (F864).

**THE ONE HTTP CLIENT** is `src/services/api.ts` — one axios instance, and every service imports it. Its request
interceptor attaches the Clerk bearer (through a resolver `AuthProvider` registers, so the client never imports Clerk)
plus a best-effort `x-device-key`. Its response interceptor is where the app's error POLICY lives: clear the global
service issue on success; on `403 + errorCode ENTITLEMENT_REQUIRED` announce the app-wide paywall lapse and TAG the
error so no generic modal stacks on top; on `>= 500` report a service issue scoped `search` (for `LLM_UNAVAILABLE`) or
`global`; log. A module-scope subscription runs a `/health` probe every 5s while an issue is live, so the banner clears
when health returns rather than when some later action happens to succeed. **There is no 401 branch** (F804), and the
base URL is derived through a long dev-convenience ladder (env → Metro host → localhost) whose production input is
wrong in `eas.json` (F803).

**Money is three seams and one law.** `services/purchases.ts` is the RevenueCat wrapper (identity SERIALIZED through
one promise queue; a purchase REFUSED unless RC is configured as the current Clerk user; a `test_` key in a release
build disables purchases loudly) — F819 argues it is ideal. `hooks/useAccess.ts` is the ONE hook every gate reads, and
its law is that **access truth is the server ledger, never RevenueCat CustomerInfo** — RC cannot see comps, rewards or
trials. `store/entitlementLapseStore.ts` + `screens/EntitlementLapseHost.tsx` are the lapse takeover: the api client
announces, the host mounts `PaywallScreen` full-screen, and it clears ONLY when server truth flips active. What is NOT
built: the "hard paywall at onboarding end" that `PaywallScreen`'s own header describes — onboarding has no paywall
step and no gate (F816).

**Onboarding** is `screens/Onboarding.tsx` (3.3k lines) driven by the step table in `constants/onboarding.ts`, with
`store/onboardingStore.ts` persisting a versioned draft through AsyncStorage and reconciling against the server's
`UserOnboardingProfile`. Two branches: live-city (Austin, New York) gets the full flow ending in the teaser + account;
waitlist gets a trimmed one. The payoff beat, `screens/onboarding/OnboardingTeaser.tsx`, is the RIGHT shape — real
ranked dishes with real scores from `/teaser/preview`, degrading to a qualitative fallback. The graph beats before it
are the wrong shape: they compute and display per-user DOLLAR savings from invented rates (F800), and a server-side
completion failure is swallowed into a local "completed" that loses every answer (F810).

**The shared kit** is `src/components` (85 files), and its organizing idea is the **app-root singleton surface**: a
module-scope store plus a host mounted in `App.tsx`, so any code anywhere can call `showAppModal` / `showShareModal` /
`showOptionSelector` / `showScoreInfo` / `showCollaboratorModal` / `showListEdit` without a provider or a prop drill.
Six of them exist and each was written from scratch (F880) — that duplication is the single biggest structural item in
this territory, and it has already produced three copies of one fixed race. Two eslint rules in `apps/mobile/.eslintrc.js`
are the house's door locks: `Alert.alert`/`Alert.prompt` and the native `<Modal>` are banned outright (every modal goes
through `OverlayModalSheet`), and `ActivityIndicator` is banned inside `src/overlays/panels/**` and `Button.tsx` (THE
SKELETON LAW — pending content renders its declared skeleton, button loading is the `SquircleSpinner`). A third
override enforces DECISION-LAYER PURITY: four named modules may not import react, react-native, expo or mapbox, because
they are unit-tested in plain Node. **What the lint chain does NOT have is `eslint-plugin-react-hooks`** (F808).

**The instruments** live in `src/perf` and are KEEP by owner ruling: `perf-scenario-command-registry.ts` +
`PerfScenarioCoordinator.tsx` are the command-bus seed (fire-and-forget verbs driven by `crave://perf-scenario-command`
deep links), and `perf/lifecycle-harness/` is its acked successor — `lifecycle-harness-registry.ts` acks EVERY
invocation and makes `verb_not_registered` itself an ack, which is exactly the bidirectional bus CLAUDE.md's
methodology asks for. The samplers beneath them are the weak half: a missing native UI-frame sampler is
indistinguishable from a perfect run, and the worst stalls are the ones the clamps discard (F850, F851).

**Reading order for a stranger.** `App.tsx` (what mounts, in what order) → `services/api.ts` (the one client and the
error policy) → `store/systemStatusStore.ts` + `providers/NetworkStatusListener.tsx` (the ONE online truth, which
mirrors into react-query's `onlineManager` and whose `subscribeToReconnect` is the shared offline→online edge) →
`hooks/useAccess.ts` + `services/purchases.ts` (money) → `components/app-modal-store.ts` + `AppModalHost.tsx` (the
singleton-surface pattern the other five copy) → `.eslintrc.js` (the laws that are enforced, which tells you which ones
were broken before).

### Pass-2 corrections and additions (D55, 2026-08-03)

**Two facts above are now STALE — D48 fixed them and the map did not follow.** (1) "There is no
401 branch (F804)" is no longer true: `services/api.ts:413` has a `session_lapse` branch that
announces through `store/sessionLapseStore.ts` and tags the error `isSessionLapse`, exactly
mirroring the entitlement branch beside it. (2) "A module-scope subscription runs a `/health`
probe" is no longer true either: F806 moved that subscription behind
`startBannerRecoveryProbe()`, an idempotent start that RETURNS ITS STOP and is mounted by
`NetworkStatusListener` — importing the api client no longer starts a timer, which is what made
the module unusable in the hermetic jest project. What DID survive unchanged is the request
VOICE pair, `USER_INITIATED` / `SILENT`, which is now the one declaration of "does this failure
speak for the whole app" (the default is still "speaks" — deliberately, see the header at :294).

**The toggle engine is a territory this map never named, and it is one of the healthiest things
in `apps/mobile`.** `toggles/toggle-interaction-engine.ts` is a pure, React-free state machine
(begin → restarting quiet window → optional visual-floor gate → commit → optional visual-sync →
finalize) with a seq guard at every boundary, so a superseded async landing can never publish.
`toggles/toggle-strip-consequence.ts` wraps it in the one declaration a page makes — `'world'`
(the commit waits for the presentation fade to bottom out) or `'content'` (old cards exit
synchronously on press-up, bare white under the strip, never a skeleton) — and
`toggles/use-content-toggle.ts` is its React face. The engine's LOUD bounded fallback
(`visual_floor_ack_timeout`) is the pattern to copy: a gate that can hang instead barks and
commits. Its instruments can show RED, which is more than most of this repo manages.
`toggles/toggle-strip-scene-law.ts` is the consumer that made `scene-foundation-spec.strip` stop
being a dead law.

**The store layer is smaller than it looks.** `store/searchStore.ts` reads as a 269-line
persisted search store; it is functionally a six-field filter mirror written by ONE bridge
(`search-runtime-filter-state-store-bridge.ts`) — every other verb and field in it is dead
(F1550), including its `query`/`page`/`history` lane, which duplicates the real, server-backed
recent-search home in `store/searchHistoryStore.ts`. Do not extend it; publish to the
SearchRuntimeBus instead, which is what its own header tells you.

**`utils/logger.ts` gates `debug` only** — `info`, `warn` and `error` all reach production
(F1552). Read any `logger.info('[TOGGLE] …')` in a gesture path as a shipped console call, not
as dev instrumentation.

**`src/hooks` is seven files** — `useDebouncedLayoutMeasurement.ts` and `useCallbackFactory.ts`
(438 lines, zero consumers) were deleted 2026-08-04 (F1551). The live ones worth knowing are
`useAccess` (money, above), `use-favorite-heart` (the heart verb, which never rides the generic
add-item route) and `use-transition-driver` (the shared 0↔1 progress driver, one consumer).

**`src/tracksheet` is the DEFAULT sheet system now**, not a prototype: `track-flip-store.ts`
seeds `{ on: true }` and `crave://tracksheet-host?on=0` is the emergency rollback to the old
overlay hosts. `screens/OneTrackPrototype.tsx` is its dev-only demo consumer and carries
refactor residue (F1560).

## Territory: mobile-nav-overlays (`apps/mobile/src/navigation` + `apps/mobile/src/overlays`)

325 files, ~69k lines. This is the **scene-stack machinery**: how the app decides
what page you are on, what the bottom sheet shows, and how one page becomes the
next without a blank frame. There is no React Navigation stack here for the main
app — the whole thing is bespoke, snapshot-driven, and the single most
concept-dense surface in the repo. Read this before touching anything in it.

### The five layers, outermost in

1. **The route coordinator** (`navigation/runtime/AppRouteCoordinator.tsx`, 497
   lines). Decides ONE thing: which of `onboarding | sign_in | paywall | main`
   the app is on, plus the launch intent (deep link) queue. Everything below
   assumes `main`. `MainLaunchCoordinator.tsx` (1,097 lines) then owns the splash
   -> first-paint gate with two 10s force-reveal escape hatches.
2. **The route stack** (`app-overlay-route-*`). A pure algebra over an array of
   `OverlayRouteEntry` — push / closeActive / popToEntry / popToRoot / setRoot.
   Spec-covered (`app-overlay-route-stack-algebra.spec.ts`). Scenes are named by
   `OverlayKey` string literals; **route roles and scene keys are referenced by
   bare string in many places, so never conclude a key is dead from a symbol grep
   alone.**
3. **The scene-stack runtime** (`app-route-scene-stack-runtime.ts`, 3,407 lines —
   the biggest file in the territory). A controller class that owns which scenes
   are MOUNTED, which is ACTIVE, which is INTERACTIVE, and publishes ~6
   independent snapshot streams through `useSyncExternalStore` authorities. Its
   `dispose()` is the cleanest teardown in the repo (F918).
4. **The transition engine** (`navigation/runtime/transition-engine/`, 6 files).
   See below — this is where the interesting design lives.
5. **The hosts and panels** (`overlays/`). `BottomSheetSceneStackHost.tsx` (1,856
   lines) is the sheet; `overlays/panels/*` are the actual pages (Lists, Polls,
   Profile, Restaurant, Messaging, ...).

### The transition engine, in one paragraph

A page switch is a reified object: `TransitionTxn` (`transition-transaction.ts`).
It moves through explicit phases `staged -> committed -> joining -> revealed ->
settled` (or `superseded`), and the **reveal** — the moment the incoming page
becomes visible — fires when a declared set of readiness inputs have all landed.
The inputs are `paint` (the incoming body's first layout), `chrome` (the header
committed), `mapFrame`, `boundary`, `camera`, `sheet`. Ambient sources _offer_
inputs; the live transaction consumes only the ones its plan declared. A
transition with an EMPTY join set reveals immediately (the "degenerate" class —
seeded scenes, zero-plane dismissals). This is a genuinely good design and the
comments explain the six smells it was built to kill. Two things to know:

- **Nothing visible is animated by the engine.** The `settleRamp` spring drives
  zero pixels; its only job is to time the `onSettle` callback. Every reveal is a
  hard swap gated on `paintAck`. Tuning the spring changes WHEN settle fires, not
  how anything looks.
- **There is a 600ms watchdog per joining transition** that force-reveals and
  barks `[TXN-DEGRADE]` naming the missing inputs. A fire means a readiness
  source is broken — it is a bug to attribute, never a mechanism to rely on.
  (The 600 is unattributed — F905.)

### How to observe it

Every edge logs one line of JSON in dev: grep `/tmp/crave-metro.log` for
`[TXN-TRACE]` (phase edges), `[TXN-DEGRADE]` (watchdog fires), `[L4STAMP]`
(joinWaitMs per transition — how long the reveal waited), `[pageswitch]` (the
host's per-commit leg roles), `[SHELL-RESIDENCY]` (visibility writes),
`[PREMOUNT]` (a body subtree built after the visibility flip instead of before).

### The shell-residency strangler (in flight)

`overlays/shell-residency-registry.ts` + `shell-residency-manager.ts`. The law:
a managed scene's shell mounts ONCE at app idle and stays resident; a switch
retargets a single VISIBILITY bit, never mounts. 13 of the sheet scenes are
migrated; polls / restaurant are still bespoke. `isResidencyManagedScene` is the
strangler boolean the legacy hosts consult — it gets deleted with the last
unmigrated scene. Note the type currently claims a wider set than the array
actually holds (F908).

### Three laws that will cost you a day if you forget them

- **Effects do NOT fire in scene body-spec hooks.** Hooks that build
  `sceneBodyContent` / `sceneBodyTransport` (`use*SceneParts`, `use*PanelSpec`)
  render to produce a spec; their effects never commit. Any `useEffect` there is
  dead code — do it at render time, or move it to the feed runtime / controller.
  (`RestaurantPanel.tsx:162` currently violates this — F922.)
- **FlashList `maintainVisibleContentPosition` must be DISABLED on any
  re-sortable feed** (it defaults ON and anchors the old top row, scrolling your
  header off-screen). Keep it ON for append/chat lists.
- **A transition's join set is declared once, at arm time, by the scene-stack
  host** — the one place that knows cold-vs-warm. Amending it later is a
  contract violation (and the amendment window is currently under-guarded —
  F901/F902).

### Where to start reading

`transition-transaction.ts` (470 lines, pure, no React) is the best single entry
point — it explains the whole model. Then
`transition-engine/transition-txn-stager.ts` (how a switch plan becomes a txn
plan), then `BottomSheetSceneStackHost.tsx:1374-1660` (the host's arm / offer /
reveal wiring). `navigation/runtime/ADDING_A_SCENE.md` is the in-repo guide worth reading first
if you are adding a page rather than changing the machinery. (It absorbed the
performance section of the deleted `overlays/PERFORMANCE_PATTERNS.md` — F961:
that guide's headline recommendation, a `useKeyedCallback`/`useCallbackFactory`
pair, had ZERO consumers anywhere in the app — the hooks were deleted in turn
(F1551) — and its worked example was written against a `useSaveSheetState` hook
that does not exist.)

### Health as of pass 1 (2026-08-03)

`npx tsc --noEmit` and `yarn test` from `apps/mobile` are both GREEN (verified
before and after; this pass changed no product code). Findings for this
territory are **F900-F984**. All 325 files were read in pass 1; four large
controllers (`app-route-scene-stack-runtime.ts`, `app-route-sheet-host-authority-controller.ts`,
`app-route-scene-switch-controller.ts`, `MainLaunchCoordinator.tsx` — ~8,300 lines
combined) were spot-read on their hot paths rather than line-by-line, and their
`audit/COVERAGE.md` rows say so. Everything is PARTIAL, not IDEAL-VERIFIED: this
was a mapping pass. The dominant classes found were: dead
scaffolding from retired phases that still typechecks and still has green specs
(F900, F906, F907, F911, F929); doc-vs-code contradictions where the comment
describes a guard the code does not implement (F901, F909, F915, F930, F935);
and hand-copied runtimes or hand-kept scene-key lists that have already drifted
(F921, F926, F934, F945, F946). The four highest-value items: **F943** (a ~300-line
visibility-policy subsystem that is constructed, threaded and disposed but never
called), **F946** (`SEEDED_FORWARD_OPEN_SCENES`, a hand-kept set with four
documented blank-sheet incidents, which wants to be a metadata field), **F945**
(`'home'` missing from three copies of the top-level scene set), and **F953/F962**
(three live `'polls'` hardcodes surviving the docked retarget, plus the
stranger-facing doc that still promises the retarget was a one-constant change).
In `overlays/` specifically: **F968** (`BottomSheetWithFlashList.tsx`, a complete
507-line second implementation of the sheet, dead), **F970** (a per-scene
"authority" whose `subscribe` is a no-op, so three live subscribers can never be
notified), **F977/F978** (two always-green instruments, one of them the RED
counterpart the chrome-geometry law leans on), and **F980** (nine hand-written
memo comparators whose failure mode is a silently missing re-render — the file
calls it "the memo landmine" twice in its own comments).

## Territory: mobile-search (`apps/mobile/src/screens/Search`)

822 files, ~87.5k lines — **the biggest room in the app**, and by file count the
most finely divided surface in the repo. It is the search screen: the query bar
and its suggestion overlay, the results sheet and its lists, the filter/price/
score chrome, and the entire JS side of the map. The native map itself
(`apps/mobile/ios`, `MapLodKit`, `SearchMapRenderController.swift`) is
**owner-locked and finished** — this territory is everything that talks _to_ it.

### Shape, by the numbers (measured, not asserted)

| area                                            |          files |  lines |
| ----------------------------------------------- | -------------: | -----: |
| `runtime/shared`                                |            544 | 42,600 |
| `runtime/*` (non-shared)                        |            211 | 24,127 |
| `components/`                                   | 24 (+ subdirs) | 10,920 |
| `hooks/`                                        |             17 |  6,398 |
| `utils/` `context/` `constants/` + 7 root files |            ~26 | ~2,600 |

`runtime/shared` is **flat** — 544 files in one directory, median **55 lines**
(p25 30, p75 91, max 1,475). 187 are under 40 lines; 67 export no runtime value
at all. **324 of 534 non-spec files (61%) have exactly one consumer in the whole
repo; 42 have none** (F1010). This is the territory's defining fact and the thing
to understand before editing anything here.

### The spine, outermost in

1. **`index.tsx`** (87 lines) — composition root. Four context providers, then one
   child. Everything below reads from context, not props.
2. **`SearchRuntimeBus`** (`runtime/shared/search-runtime-bus.ts`) — a hand-rolled
   key-scoped store. `publish(patch)` diffs by `Object.is`, notifies only
   listeners whose declared `observedKeys` intersect the changed set, and supports
   `batch()`. **The desired-search TUPLE lives here** and has exactly one writer
   (`search-desired-state-writer.ts`). This is the single most-read file in the
   territory.
3. **The world resolver** (`runtime/resolver/search-world-resolver.ts`) — desired
   tuple in, presented world out, through one ladder: **cache → derivation →
   network**. Superseded resolutions complete _into cache_ and never present;
   presentation is decided by CURRENT desire. A "provisional" derived world (the
   client-filtered open-now variant) presents instantly and is then trued up from
   the network as a **version update**, not a second reveal. Genuinely good.
4. **The surface runtime** (`runtime/surface/search-surface-runtime.ts`, 1,483
   lines) — a **module singleton** (not per-mount; do not go hunting a lifecycle
   leak there, F1017). Owns the reveal choreography and stages transition
   transactions against the nav transition engine. (The redraw-COORDINATOR
   subsystem it once fed is deleted — F1735/F1736; the live `redrawTransaction`
   surface system is a different, functioning mechanism and remains.)
5. **The results-presentation machine** (`runtime/shared/results-presentation-*`)
   — a pure attempt/transport state machine (`(state) → {nextState, appliedLog,
blockedLog}`) plus an authority that publishes the transport. A **second**
   authority (`ResultsPresentationSurfaceAuthority`, a module singleton) owns the
   _data-identity_ keys. `SearchSurfaceResultsTransactionCoordinator` joins the two
   halves and is what decides the reveal.
6. **The map seam** — `hooks/use-direct-search-map-source-controller.ts` builds
   sources; `components/hooks/use-search-map-native-render-owner.ts` (4,008 lines)
   is the JS↔native frame transport; `components/search-map.tsx` (2,287) is now a
   thin GL shell (pins and labels are native ViewAnnotations, not GL layers).

### Things that will bite you

- **The camera is deliberately UNCONTROLLED** for center/zoom/bearing/pitch (only
  `padding` stays controlled). Every programmatic move goes through
  `CameraIntentArbiter.commit()` carrying an `animationCompletionId`.
  `search-map.tsx:521-540` is the authoritative record of why. Two comparators
  (`arePropsEqual`) compare `mapBearing`/`mapPitch` that are never applied.
- **The JS→native frame wire is a revision-proved delta protocol.** Each source
  ships `baseSourceRevision`/`nextSourceRevision`; a patch must prove every
  non-upserted id is already resident, and an unprovable chain falls back to a
  **full replace, loudly**. This is the strongest engineering in the territory.
- **Presentation opacity is entirely native** (display-link tick). JS ships only
  _target_ opacities and role frames. Do not look for a JS fade.
- **Hook call ORDER is the wiring** (F1013). `use-search-root-runtime-stage-runtime.ts`
  sequences 14 stages; `-control-stage-runtime.ts` sequences 12;
  `clearRestoreAuthorityRuntime` **must be last** because it consumes the other
  four authorities. Hoisting a hook call to "group things together" yields
  `undefined` reads four levels deep that TypeScript cannot catch.
- **The `*-args` / `*-ports` / `*-patch` / `*-lane` families are ceremonial.**
  ~35 files whose body forwards arguments to one child hook. Real seams here own
  a _lifetime_ (the `*-authority-runtime` family, the map ref-latch bridges, the
  stage boundaries) — those are excellent. See F1012 before proposing a collapse:
  the decomposition is load-bearing for the body-spec-effects law and for hook
  order, and at least one ceremonial family actively _concealed_ a live defect.
- **Two instruments, opposite quality.** `search-nav-switch-runtime-attribution.ts`
  is the model — env-gated, zero-cost when off, bounded ring, can show RED
  (F1016). `runtime/map/map-query-budget.ts` is the anti-model — written on the
  hydration hot path, **`snapshot()` has zero callers repo-wide** (F1002).
- **Exterminated systems are clean.** No live `markets`, no deleted search
  `ladder`, no `[lodev]`. Every `ladder` hit is the _live, correctly shared_
  `services/retry/network-retry-ladder.ts`; the `market` hits are prose (two of
  them, in `search-map.tsx`, are stale enough to mislead — F1036e).
- **The best file in the territory** is
  `runtime/viewport/viewport-subject-store-controller-core.ts` (F1014): every
  constant is a fact, a derivation, or a labelled owner choice; every guard
  carries the dated failure it was written against; three timers armed, three
  disarmed on both the dispose _and_ the background edge. Judge new code here
  against that file.

### The `runtime/profile` subtree (73 files, 5,327 lines) — pass 2

The restaurant-profile presentation lives entirely here, and its shape is a
direct fossil record of the **L3 machine deletion**. Read it with that in mind:
half of what looks like machinery is the _residue_ of a prepared-presentation
transaction machine that was dissolved, and the comments say so (`profile-direct-
presentation-runtime.ts:10-24` is the best single orientation paragraph in the
subtree).

**The spine, in call order.** `useProfileOwner` (`profile-owner-runtime.ts`) is
the only entry point. It builds, in this order: a runtime-state owner (one
`React.useRef<ProfileControllerState>` holding `runtime.{transition,close}` and
`mutable.{cache, requestSeq, focusSession, …}`); execution models (native camera,
app/foreground, and the machine-less `directPresentationRuntime` that IS the
presentation surface now — camera commit + a standard child push); a presentation
view model; then three _port_ bundles that get merged into `actionExecutionPorts`;
then the action surface. Actions are pure functions over an "action model" —
`resolve*Plan` computes, `execute*` calls ports. That split is genuinely good and
is why the plan files are readable.

**Four things that will mislead you.**

1. **`ProfileTransitionStatus` is a four-state enum with two reachable states.**
   Only `'open'` (`profile-direct-presentation-runtime.ts:60`) and `'idle'`
   (via `resetProfileTransitionState`) are ever written. Any code branching on
   `'opening'`/`'closing'` is dead — two live examples in F1058, and RT-2 already
   caught a third. Presence facts come from the **route stack** and the
   **presentation frame**, not from this enum (`profile-view-state-runtime.ts:30-32`).
2. **Closing is POP-OWNED.** Nothing "closes" the profile; the restaurant entry
   leaving the route stack IS the close. `use-restaurant-entry-pop-teardown-writer-
runtime.ts` is the single writer, and it runs the teardown in **two halves** —
   commit (camera restore, hydration cancel, highlight clear) and settle (null the
   panel snapshot, only once the presentation frame's outgoing clears). The settle
   half must never run at commit or the descending sheet blanks mid-slide.
3. **Several ports are deliberate no-ops that only work because a downstream
   spread overwrites them** (F1064). `profile-owner-auto-open-ports-runtime.ts`
   and `profile-owner-refresh-selection-ports-runtime.ts` both ship
   `(x) => { void x; }` stubs. Delete a spread and the profile silently stops
   focusing — no type error, no crash, just a dead button.
4. **`forceMiddleSnap` does nothing on the open path** (F1056) and its one
   surviving use on the preview path is itself inert (F1057). A live caller
   computes it and passes it in good faith.

**The state record is the thing to read first.** `profile-runtime-state-record.ts`
is 72 lines and defines every mutable the subtree owns. Roughly 30 of the 73 files
are `useCallback`+`useMemo` wrappers over a `*OnRecord` / `*FromRecord` free
function on that record — once you have the record, most of the subtree is
mechanical.

**The one unbounded thing:** `mutable.restaurantProfileCache` (F1065) — a
`Map<restaurantId, HydratedRestaurantProfile>` with no cap, no TTL and no
eviction. Its sibling `restaurantProfileRequestById` _is_ cleaned in a `.finally`,
and `runtime/resolver/search-world-value-constructor.ts:21-53` caps its cache at
12 with LRU retention. The bounded shape exists one directory over.

### `runtime/controller` — an eleven-hop snapshot relay, and the bug class it breeds

Eleven `SearchOverlayLocalRestaurantSheet*StateController` classes form a strictly
linear fan-in: each holds one-to-three upstream snapshots, `Pick<>`s 1-3 fields,
memo-compares, republishes. `shouldRenderSearchOverlay` is copied unchanged
through **five** of them. Every hop is a hand-written comparator — and
**three separate bugs in this territory are the same comparator mistake**:
`this.snapshot === nextSnapshot` against a producer that always allocates a fresh
object (F1052f, F1061, and F1071c on the map side). When you touch a controller
here, the first question is: _does the thing I am comparing get allocated fresh?_
The correct shape is a field-wise `areXSnapshotsEqual`, and most siblings have one.

Also in this directory: **two entirely dead barrel files** (`search-root-map-
surface-controller-runtime.ts`, `search-root-map-host-publication-runtime.ts`) with
zero importers, re-exporting three dead per-field diff diagnostics (F1060).

#### What the line-by-line read found (pass 3, F1601–F1621)

Pass 2 saw the relay at cluster level and named the comparator bug. Reading every
hop line by line turns that into a rule you can apply without re-deriving it:

**A hop's dedupe is real only if the hop THROWS BITS AWAY.** Every `recompute()` in
this directory is reachable only from a setter that already proved its input's
identity changed. So if the hop merely rewraps or renames that input, its
comparator is testing the very identities the setter just proved unequal — it
returns false every time, forever. That is not a hypothetical: **five** of them are
like that (`route-geometry-frame`, `route-motion-frame`, `route-sheet`,
`sheet-session-host` — F1604 — and `sheet-route-host-visual`'s deep arm, F1605),
plus `sheet-render-visual`, whose entire snapshot is a field-for-field copy of
`sheet-presence`'s (F1603). The hops that DO earn their guard are the ones that
project to fewer bits: `sheet-render-visibility` (object → bool) and the three
`*-selection` controllers (N fields → 2 or 3). Before adding or trusting a
comparator here, ask **"can this test disagree with the setter above it?"** — if
not, you have written decoration and bought an allocation per event.

**The relay's cost, counted (D55 makes performance first-class).** One re-mint of
`routeHostVisualRuntime` — a single field of a single binding — walks
motion-frame → route-visual → route-host-visual → sheet-visual → sheet-host as
**6 object allocations, 5 comparator runs, 5 listener fan-outs, and exactly 1
object that React ever reads** (F1608). The relay is not slow for deduping too
little; it is slow because it dedupes at every hop and most of the dedupes cannot
fire, so it pays the comparison _and_ the allocation. That count is the
before/after metric for F958's collapse (staging map: DESIGNS D45/F958).

**Two controllers in here are DEAD, and one of them was "fixed" while dead.**
`route-frame-state-controller.ts` (157 lines) and
`sheet-visual-host-state-controller.ts` (104 lines) have zero constructors; only
their types escape. F1052f's derived shape-equality comparator — the exemplar D45
told everyone to copy — lives in the first one, in code no runtime path reaches,
while the live neighbour re-inlines the same derivation twice by hand (F1601).
The second is subtler and worth remembering: someone already routed _around_ the
VisualHost hop (the hook of that name builds the **SheetVisual** controller and
returns its authority under the VisualHost name), and TypeScript never objected
because the two snapshot types are the same three fields (F1602). **In this
directory, structural identity means a hop can be deleted in practice and left
standing in the type system.** Grep for constructors, not for imports.

**The identity repacker, and the bug it hides.** Fifteen files here are
`(x: T): T => ({ …every field of T, spelled out })` — parameter type identical to
return type, i.e. a shallow copy (F1610). Every call site wraps one in
`useMemo(() => createXValue({a,b,c}), [a,b,c])`, so each value's field list is
written **four times**: the contract type, the destructure, the return literal,
and the dep array. Three of the four are compiler-checked. The fourth is not — and
it is already wrong: `presentationProps` reads six `mapSurfaceState` fields and
lists four, dropping `mapBearing` and `mapPitch`, so **a bearing- or pitch-only
camera intent never reaches the map** (F1611). Nothing catches it: there is no
eslint react-hooks config in the repo at all (F808's `exhaustive-deps` was
approved-as-staged in D48 and never installed), and the repacker is precisely what
puts the field reads in a different file from the dep array. The abstraction that
looks like harmless ceremony is the one that made a real defect invisible.

### Instruments that cannot show RED (or can only show RED)

The territory's recurring disease, now catalogued in one place. Pass 2 found four
more: the search-chrome scalar surface whose `readyForActivation` is structurally
always `false` (F1068 — the whole stack is DELETED, D59/F1700);
`map-interaction-diagnostics.ts`, every entry point gated
on a module constant hardcoded `false`, with a `0`ms rate window that would break
it if woken (F1070); the FlashList viewability runtime that rate-limits a log that
no longer exists (F1062); and `SearchSurfaceRedrawCoordinator.beginOperation`'s
unreachable no-notify guard (F1061 — the whole coordinator is DELETED, F1735/F1736:
its phase machine could never leave idle). Pass 1 found the inverse — an instrument
stuck permanently RED (F1051). **Before trusting any metric in this territory,
find the code that would make it flip.**

### The camera-origin choreography, as built (D56, 2026-08-03)

"Where does the map go back to when you dismiss a search?" is answered by **ONE ledger** —
the same one that answers it for the sheet. This section used to describe FOUR independent
ledgers (a session slot, the profile `savedCamera`, a stale idle-only tracker, and a
dismiss-time capture); D56 collapsed them into the origin. Read this before touching it.

**THE origin.** `OriginSnapshot` (`overlays/searchRouteSessionTypes.ts`) lives on the PUSHED
route entry (`app-overlay-route-types.ts`), captured at **push commit, before any motion**,
through the total-capture seam `captureRouteEntryOrigin`
(`navigation/runtime/route-entry-origin-capture-delegate.ts`), and applied on pop by the
matching restorer. It carries sceneKey / sceneParams / detent / segment / scroll — **and
`camera`**, the seventh field (`{center, zoom, padding|null} | null`).

- **Capture** happens in ONE place: the capturer registered in
  `app-route-overlay-session-state-controller.ts`. Its value comes from the port in
  `screens/Search/runtime/shared/use-route-entry-origin-camera-port-runtime.ts`:
  `ViewportBoundsService.getCamera()` when the map is settled, the **CameraIntentArbiter's
  in-flight committed target** when a programmatic move is in flight
  (`getInFlightCameraTarget`) — the user perceives the destination of a fly-to as "where I
  am". Never `lastCameraStateRef` (idle-only, lags programmatic moves — the cd59e8a2 class).
- **Restore** happens in ONE place: the origin restorer, beside the detent and scroll lanes,
  committed through the **CameraIntentArbiter** (never a direct camera write). Every pop that
  stages an origin — closeActive / popToEntry / popToRoot — restores the camera, so a pop that
  keeps a world alive is no longer a half-pop.
- **A pan after the trigger does NOT move the target.** Owner law, verbatim.
- **The dismiss-time lane carries no camera by construction**: `buildCurrentOriginSnapshot`
  pins `camera: null`. An origin is captured at DEPARTURE, never at RETURN.
- **The camera is NOT a richness axis**: a camera-bearing home origin still takes the
  degenerate short-circuit and the golden `assertDegenerateHomeEmission` contract (no
  `cameraIntent` on the home switch, ever). Proven both ways in
  `navigation/runtime/route-entry-origin-camera.spec.ts` (14 specs, 4 mutation proofs).
- **Instrumentation:** `[CAMORIGIN-capture|restore|pop]`, gated by `CAMORIGIN_DEBUG_ENABLED`
  in `pageswitch-debug-flag.ts` — DEFAULT ON in `__DEV__` until the sim session signs off on
  capture timing, then flip it off.

Deleted by D56, do not resurrect: `use-search-session-origin-camera-runtime.ts` (the session
slot), `ProfileTransitionState.savedCamera` + `resolveProfileCameraSnapshot` (the profile
ledger and its stale source), and the profile lane's terminal-dismiss camera focus. Full
trace: FINDINGS F1500-F1516, DESIGNS D56.

Two standing traps in this area: (a) the launch of a list world is a **composite** —
`pushRoute` fires synchronously at the tap, the world write lands one `useEffect` later, so
anything "captured at launch" in the effect is a frame behind the push — which is exactly why
the camera capture rides the PUSH, not the launch effect; (b) `tsc` in
apps/mobile has a permanent 2-error baseline, both rnmapbox typing gaps in this exact
territory (F1514) — do not read them as damage you caused.

## Territory: mobile-native (`apps/mobile/ios` + `apps/mobile/android`)

98 tracked files. 72 reviewed in pass 1; the 26 UNREVIEWED are binary assets
(app-icon/splash PNGs, `debug.keystore`, `gradle-wrapper.jar`, `gradlew`).
Findings F1100–F1118 (pass 1) and **F1700–F1710 (pass 2, the PARTIAL residue —
Android source, TrackScrollKit at HEAD, the bridge modules, and the F1068/F1069
both-halves recommendation)**. Executed evidence: `swift test` in `ios/MapLodKit`
(**41/41 green**, and RED-proven — a one-line `LodEngine` mutation turns 15 of
them red), `plutil -lint` on the three plists (all OK),
`scripts/mobile-native-authority-gate.sh` (18/18, RED-proven two ways), and a
repo-wide JS grep for every exported native module name.

**THE ONE LAW OF THIS TERRITORY: `apps/mobile/ios/` IS AUTHORITATIVE. NEVER RUN
`expo prebuild`.** This is a bare workflow: `ios/` is committed, and the files
that actually build are `ios/cravesearch/Info.plist`, `cravesearch.entitlements`,
`PrivacyInfo.xcprivacy` and the `Podfile`. Everything under `expo.ios` in
`app.json` is FOSSIL from before the eject — read by prebuild and by nothing
else, so editing it changes nothing about what ships. Prebuild REGENERATES
`ios/` from `app.json`, and `app.json` describes a project with no
`SearchMapRenderController` (13k owner-locked lines), no MapLodKit/TrackScrollKit
pods, no custom Podfile, no location/photo purpose strings and no privacy
manifest — note its `plugins` array is EMPTY even though expo-camera,
-image-picker, -location and -notifications all ship config plugins whose job is
to inject exactly those keys. Prebuild here is a ~15k-line silent revert to a
template, not a regeneration. Three defences exist as of 2026-08-03 (D44/F1103):
a loud `"//"` note at the top of `app.json`, this paragraph, and
`scripts/mobile-native-authority-gate.sh` — a CI gate (in the macOS
`native-tests` job, because it needs `plutil`) that fails if any of the native
files disappear, if a plist stops linting, if `expo.plugins` becomes non-empty,
if the two purpose strings `app.json` duplicates drift from `Info.plist`, or if
the trap note itself is deleted. Going back to prebuild is a real migration
(express the custom native code as local config plugins FIRST), never a drive-by.

**Shape.** One Xcode target (`cravesearch`), one shared scheme, bare workflow.
~16k lines of native code in three homes:

- `ios/cravesearch/` — the app's own Swift, dominated by
  `SearchMapRenderController.swift` (13,463 lines, **OWNER-LOCKED**, verified
  structurally only). The smaller modules cover the bottom-sheet host, the
  search-chrome hit-target registry, the route-nav mask/silhouette, the frame
  sampler, and the presentation-command executor (sheet half only — its camera
  half died with D61). The scalar-surface registry is GONE (D59/F1700: it
  duplicated the shipped hit-target twin across three languages).
- `ios/MapLodKit/` — the pure LOD kernel (398 lines + 634 lines of tests).
  **The standard the rest of the territory should meet** (F1115): impure half
  injected, podspec consumes the same source the tests cover, headers explain
  the physics and the invariant.
- `ios/TrackScrollKit/` — the ONE TRACK scroll hatch (Obj-C, 3 bridge modules,
  1,568 lines, **no tests**). F1118's in-flight edits LANDED (`13e567ffd`) and
  the re-read at HEAD is clean (F1706): zero dead exports — all 7 `TrackScrollPhysics`
  methods and all 4 of its events have JS call sites, and both view managers are
  mounted. The open item is the one MapLodKit already answered elsewhere: there is
  no pure kernel to test, and `plans/android-parity.md` §5 is its home.
- `android/` — a Java parity port, **frozen 2026-06-17, no build profile, no
  Mapbox download token, never compiled by anything** (F1110); D52 ruled REWRITE,
  not repair (`plans/android-parity.md`). **Corrected counts (re-measured 2026-08-05,
  F1704 phase-3 close): 56 tracked files, of which 15 are `.java` totalling 11,231
  lines** — F1704's own "57 files / 16 `.java` / 11,684 lines" is itself now stale
  (`SearchChromeScalarSurfaceRegistryModule.java`, the third F1068 scalar-surface
  copy F1704 flagged, has since been deleted by another pass), which is itself the
  same lesson one level down from the long-quoted, never-re-measured "34 files /
  ~11,150 lines" F1704 originally corrected. Re-derive this count at the moment it's
  used (`git ls-files apps/mobile/android`), don't quote it forward. F1705
  re-verified the plan's drift table exactly (11 iOS externs vs 8 Java `@ReactMethod`;
  6 shared, 5 iOS-only, 2 Java-only dead names; zero `MapLod`/`TrackScroll` hits; zero
  `android` keys in eas.json; nothing invokes `gradlew`).

**How JS reaches native.** Every Swift module is bridged from ONE file,
`UIFrameSamplerBridge.m`, which is named after one of the nine modules it
declares (F1112). Two cross-module command hatches go through
`NSClassFromString`/`NSSelectorFromString` string reflection — that is why
`BottomSheetHostRegistryBridge` has zero JS references and is nonetheless very
much alive; it is reached only by reflection from
`ProfilePresentationTransactionExecutor` (F1113, banked before any dead claim).
The other reflection target lives inside the patched `@rnmapbox/maps` pod.
**There is a THIRD reflection site** (F1701), in
`SearchChromeScalarSurfaceRegistry.swift:427-473`: `bridge.value(forKey:"uiManager")`

- `NSSelectorFromString("viewForReactTag:")`, i.e. the PAPER-era view lookup, on a
  new-arch app. Compare `TrackScrollPhysics.m`'s `TrackFindScrollView`, which solves
  the same problem architecture-proof and says so — one native surface here already
  knows the Fabric answer. Two of the nine bridged names have no file of their own
  (`PresentationCommandExecutor` is in `ProfilePresentationTransactionExecutor.swift`,
  `SearchRouteNavSilhouetteHostViewManager` in `SearchRouteSheetNavExclusionMaskView.swift`),
  so `UIFrameSamplerBridge.m` is the ONLY place the nine-module roster is written down.

**BEFORE YOU MOVE ANY NATIVE SOURCE, READ `scripts/perf-scenario-parity-contracts.js`
(F1702/F1703).** That 4,882-line gate (`perf:scenario:contracts`, called by
`perf-scenario-contract-gate.js`) does UNCONDITIONAL top-level `readFileSync` on four
hardcoded native paths — `SearchMapRenderController.swift`,
`android/.../SearchMapRenderControllerModule.java`,
`SearchRouteSheetNavExclusionMaskView.swift`, `UIFrameSamplerBridge.m` — and asserts on
their SOURCE TEXT. Two consequences already in flight: the Android plan's Stage 2
(`git rm` the mirror) ENOENT-crashes it, and F1112's approved bridge split turns its
mask assertions RED with a message describing a defect that did not happen. Each of
those refactors is a TWO-file commit, and the second file is this gate.

**The New Architecture is on and nothing here uses it** (F1114). `RCTNewArchEnabled`,
`newArchEnabled` (gradle), and `newArchEnabled` (Podfile.properties.json) are all
true, while 100% of our native surface is legacy-bridge `RCT_EXTERN_MODULE` /
`RCTViewManager` / `RCTEventEmitter` running through the interop layer. Combined
the entire native surface minus MapLodKit's 398 lines has **no compile-time
contract with JS and no test**.

**The test lane, as it actually stands (F1100, settled 2026-08-03).** There is
ONE native test lane and it is `swift test --package-path apps/mobile/ios/MapLodKit`
— 41 tests, ~10ms, no simulator, no Mapbox, no React — and it runs in CI in the
macOS `native-tests` job. It is RED-able: mutating `LodEngine`'s budget break
condition turns 15 of the 41 red. There is NO XCTest target and the shared
scheme no longer pretends otherwise; its `<Testables>` used to name
`cravesearchTests` (BlueprintIdentifier `00E356ED1AD99517003FC87E`), a target the
project has never contained, so `xcodebuild test -scheme cravesearch` failed on a
missing buildable before running anything. The phantom entry is deleted. Adding
an XCTest target is deliberately NOT the next move: every remaining app-target
Swift file is RCT bridge glue that needs a host app and a simulator, which is the
slow, flaky lane. **The blessed pattern is MapLodKit's** — when native logic
becomes worth testing, EXTRACT the pure half into a dependency-free SwiftPM
module that builds for the macOS host, and `swift test` it. That is the shape
that gave the map its only durable coverage.

**Config and ship-readiness was where the real defects were; most are now
fixed.** The map dependency triangle is internally consistent — Podfile pin,
Podfile.lock, and the `@rnmapbox+maps+10.3.1.patch` baseline all agree (F1111, a
watch on the `-rc.1` pin, not a defect). The plists were where it broke down, and
every item was an App-Store-submission-shaped problem rather than a runtime bug.
FIXED 2026-08-03 (D44): `PrivacyInfo.xcprivacy` declared `NSPrivacyCollected
DataTypes = []` — "this app collects nothing" — and now enumerates the ten types
the code actually collects, each verified against a call site, with `CrashData`
the only unlinked one because `src/observability/crash-reporting.ts` enforces
that (F1108); blanket `NSAllowsArbitraryLoads` is replaced by
`NSAllowsLocalNetworking` plus the pre-existing narrow `localhost` exception
(F1105); the two Always-location keys are gone and the When-In-Use string now
names a benefit (F1106); `NSPhotoLibraryUsageDescription` is declared even though
today's PHPicker path does not need it (F1107); `armv7` on an iOS-15.1 app is
deleted (F1109); `eas.json` gained a `staging` profile and `preview` now extends
it, so internal builds rehearse against the staging api per the deploy law
(F1102). STILL OPEN: `aps-environment = development` hardcoded while the app
really does mint push tokens — the entitlement's own comment claims EAS release
signing supplies `production`, an assertion never executed against a real build
(F1101, now a `product/pre-launch.md` gate); the production api URL is still
Railway's GENERATED hostname baked into every binary, which must move to a domain
we own before the first submission (F1102 half two, also in pre-launch.md);
`crave-search` as the home-screen name (F1116); the OTA lane is three-way
incoherent and wholly inert (F1104); and `pod install` is not reproducible
without an undocumented Mapbox credential (F1117).

**The search-chrome scalar surface is scaffolding on BOTH sides — and is now DELETED**
(D59/F1700, EXECUTED 2026-08-04 in commit da628275f: ~2,160 lines across three
languages, three RED-proven delete-gate checks; the live hit-target twin stands
alone and nothing user-visible changed. The autopsy below is kept as the record of
WHY, since the same duplication-vs-activation question will recur.) (F1068/F1069,
read from the Swift end 2026-08-03). The JS half (~1,244 lines) is a write-only
sink whose `readyForActivation` is structurally always false. Reading
`SearchChromeScalarSurfaceRegistry.swift` (529 lines) settles what that means:
the native half is inert in exactly the same way and SAYS SO IN ITS OWN OUTPUT.
`constantsToExport` returns `searchChromeScalarSurfaceActive: false`;
`platformOwnerStatus` returns hardcoded `active:false`, `ownsScalarValues:false`,
`composesNativeRegions:false` and a literal `missingHooks` list naming
`platformReadableScalarTargets`, `nativeRegionCompositionLoop` and
`pressTimeActionResolver`; `snapshotsByKey` is written by `syncSnapshot` and only
ever REMOVED, never read; nothing outside that one file consumes any of its
state. So the owner's choice is NOT "wire up the missing `syncNativeSnapshot`
call" — activation means BUILDING the three hooks the native side itself lists as
missing. Only the measured-frame observers (`registerNativeLayoutObserver` →
KVO on bounds/center/transform) do real work today, and their output is read only
by `measureRegisteredControls`, which the dead JS diagnostics path is the sole
caller of. Both halves live or die together.

**PASS-2 RECOMMENDATION (F1700): DELETE — RULED AND EXECUTED.** The question is not activation-cost vs
deletion-scope, it is duplication. `SearchChromeNativeHitTargetId` is literally
`'shortcut_restaurants' | 'shortcut_dishes' | 'search_this_area'` — the SAME three
ids as the scalar runtime's `REQUIRED_CONTROL_IDS` — and that stack (211 Swift + 168
JS lines) is LIVE, mounted in `SearchOverlayChromeHost`, syncing native regions and
resolving presses in native. The scalar registry's own `missingHooks` list names
`pressTimeActionResolver`, which is exactly what the hit-target surface already does
in production. So "activate" means building a second implementation of a shipped one —
and `active: false` is a TYPE on the runtime, not a value, so it is a public-surface
rewrite, not a wiring change. Deletion scope: **~2,257 lines** = 1,244 JS + 529 Swift

- 452 Java (`SearchChromeScalarSurfaceRegistryModule.java`, a third copy nobody had
  counted) + the 32-line `RCT_EXTERN_MODULE` block at `UIFrameSamplerBridge.m:100-131`,
  plus two live per-render bridge crossings (`SearchShortcutsRow.tsx:41-42`,
  `SearchOverlayHeaderChrome.tsx:105`) that pay into a sink. Nothing user-visible changes.
  If the owner instead wants a native chrome that OWNS scalar values, the honest move is
  still to delete this and grow it from the hit-target surface's working shape.

## Territory: mobile-assets (`apps/mobile/src/assets` — 1,274 binaries)

**1,222 of the 1,274 asset files are machine-generated, and they regenerate
byte-identical.** Two paired scripts own almost the whole tree:
`scripts/generate-pin-bucket-sprites.js` (1,211 map-pin PNGs + `pins/manifest.json`

- `src/generated/pin-badge-images.ts`) and `scripts/generate-dot-sprites.js`
  (11 dot PNGs + `src/generated/dot-images.ts`). Both read ONE colour file,
  `apps/mobile/src/constants/score-bucket-palette.json`, which is why pins, dots and
  rank pills cannot drift apart; both carry `@script-class: operational` headers
  naming the other. Neither runs in CI — they are run by hand when the palette
  changes.

The pin family is a cartesian product, and knowing its shape saves reading 1,200
filenames: ten score buckets (`b0`..`b9`, one decile each) x {a plain pin, ranks
1-99, a shared `99+` overflow, and the one-decimal scores inside that bucket's own
decile}, plus a 100-sprite active-colour rank set (`pin-rank-active-N`) for the
selected pin. The rank number is BAKED INTO the icon deliberately — so
`symbol-z-order: viewport-y` orders pin+number as one unit and text cannot bleed
across stacked pins. The hand-drawn source art is only four files:
`pin.png`, `pin-fill.png` (composited into every sprite AND registered live as
Mapbox style images), `pin-shadow.png`, and `splash.png` — plus their `@2x`/`@3x`
Metro density variants. `screens/Search/components/search-map.tsx` is the SINGLE
consumer of both generated registries.

**The reference-census method, for the next asset pass.** An asset territory is an
orphan check, not a read-every-byte pass, and the honest instrument is
_regenerate-and-diff_: copy the generators to a scratch output dir, run them
against the committed palette, then `comm` the two file lists in both directions
and content-diff the intersection. Only-in-generated proves the committed tree is
stale; only-in-repo proves residue; a content differ proves the generator no longer
produces what is committed. All three came back clean here except one bucket of
residue — 41 `pin-score-*` sprites from a superseded 8-bucket/6.0-10.0 scheme, in
no manifest and no generated module, so Metro never bundled them (F1150). For the
handful of non-generated assets, the census is a basename grep across
`src` + `ios` + `app.json`/`eas.json` + maestro flows, with the banking law applied
to template-literal requires and native bundle references before any orphan claim.

**Two live traps.** The generators do NOT clear their output directory before
writing, which is exactly how F1150's residue survived a scheme change — the
durable fix is one `rmSync` before `mkdirSync`, not a one-time delete.
And `assets/fonts/` contains no font: both `IBMPlexSans-SemiBold.ttf` and `OFL.txt`
are saved GitHub **HTML pages** (594KB of markup, someone curled the blob URL
instead of the raw one), referenced by nothing — the app loads no custom font at
all (F1151). `splash.png` at 1.34MB is the only asset over 1MB and the only real
app-size lever in the tree (F1152).

## plans/ and business/signal/ — which docs are CANON and which are ARCHAEOLOGY (2026-08-03, phase-1 pass 2)

Pass 1 mapped `plans/` as a census (F730) and honestly declared two clusters
swept-not-read. Pass 2 read both end to end — the 23 `plans/` files touched
since 2026-07-28, and all 42 files under `business/signal/{ledger,panels,redteam}`.
Findings F1200–F1248. Corrections were APPENDED IN PLACE and dated; nothing
under `plans/` or `business/` was deleted or rewritten.

**The headline is the same as pass 1's, one level down: the archive is mostly
honest, and the rot is concentrated — but it is concentrated in the FRESHEST
docs, not the oldest.** February–April archaeology announces itself. A doc
written six days ago that says "✅ LANDED" does not, and this pass found six
of those. The failure mode is never a lie; it is a TRUE statement that a later
commit reversed, sitting in a file nobody re-read.

**CANON — build against these.** `data-audit-2026-08.md` (13 red-team rounds;
every implementation symbol spot-checked exists, including `crave_fold()`
genuinely dropped from the DB exactly as claimed), `one-ground-charter.md`
(1,105 lines, dated, self-falsifying, RED-proved — the model for how to write
one of these), `search-from-scratch-derivation.md`, `multilingual.md` (its
corpus counts reproduce EXACTLY on the mirror), `reextract-choreography.md`
§§1–5, `austin-reextract-handoff.md`, `payments-ideal-shape.md` as the
entitlements architecture. All now carry correction notes where a specific
line went stale.

**ARCHAEOLOGY — read as history, do not execute.**
`production-hardening.md` §0.4/§7 (instructs deleting the Stripe rail the
owner just rebuilt — the single most dangerous doc in the repo right now),
`search-calibration-prebuild-handoff.md` (spent; two instructions point at the
reversed answer), `full-reload-charter.md` (three named code paths gone),
`tracksheet-ideal-shape-from-scratch.md` §9 (reversed by an applied patch),
`chrome-in-content-cutover.patch` (ALREADY APPLIED — a double-apply hazard),
the whole `business/signal/` cluster (2026-07-12/14 research artifacts).

**Four traps this pass paid for, worth generalizing:**

1. **A doc's LAST section is not its newest.** `search-from-scratch-derivation.md`
   puts round-4 SPEC AMENDMENTS _below_ the round-5 record that superseded
   them; `transition-derivation.md` has fifteen sections each correcting the
   last with no global banner. A linear reader lands on the stale answer.
   When appending a round, append a pointer at the superseded text too.
2. **A "DONE ✓" header and a "BLOCKER, reverted" paragraph in the same file
   means the header is the lie.** (`lod-ideal-residency-refactor.md`.)
   The reverted-attempt paragraph is written by someone who just ran the code.
3. **A false premise propagates through a synthesis pipeline and comes out the
   far end as a binding amendment.** ledger/09 asserted "onboarding already has
   a rating-ask step" → the compliance lens built an Apple/FTC section on its
   placement → the judge issued "flip the as-built rating-ask→city-pick order
   regardless". There has never been a rating ask (`StoreReview` /
   `requestReview` / `rateApp` = 0 hits). The same pipeline caught two
   FABRICATED quotations by checking its own sources — it just never checked
   the product.
4. **Ops facts rot fastest of all.** `CRONS_ENABLED=false` was stated as
   current in three live docs and in MEMORY; the flag was removed from prod
   on 2026-08-03. Anything that names an env var should name the date it was
   read, and the reader should re-read it.

**One cross-cutting fact every doc should be checked against: CI IS RED ON
MAIN.** `.github/workflows/ci.yml` exists (contradicting
`reextract-choreography.md` §6's "no GitHub Actions") and the six most recent
runs all failed, latest 2026-08-03T21:43. Nothing may treat CI as a passing
gate, and `deploy.sh`'s known-red refusal currently blocks a prod deploy
without `--force`.

**Two items needing owner word, not a doc edit:** prod's
`REVENUECAT_ENTITLEMENT_MAP` points at the entitlement `payments-ideal-shape.md`
records as detached+ARCHIVED (F1203), and onboarding still tells users
"Crave is live in Austin and NYC today" while both P2 panel docs make
collapsing NYC to the waitlist a pre-launch item (F1246).

---

## Execution wave 2026-08-04 (D59–D61, F1700–F1736)

The map above is stamped with these where they contradict it; recorded here as one list.

- **D59/F1700** — the search-chrome scalar surface DELETED (three languages; the shipped hit-target twin was always the real implementation).
- **D60** — the controllers territory is TERMINAL: the local-restaurant relay collapsed 15 hops → 4 authorities, and all 18 repacker sites inlined. Durable guards: the composite transcript spec and `repacker-dep-array-coverage.spec` (which found the memo that had been GATING the hand-landed F1611 fix, and once caught itself lying — a comment inside a dep array parsed as pseudo-entries).
- **D61** — the camera command lane rederived: a committed intent now PARKS when no host is registered and REPLAYS on attach, newest-wins, gesture supersedes; the native fallback lane is deleted; a composite-checked watchdog replaces blind trust in a completion event. The rnmapbox 10.3.1 patch had SEVERED that completion channel and left iOS unbuildable since 08-02 — repaired, with `scripts/ios-camera-symbol-gate.sh` so a silent patch failure can never hide again. Proven on the rig end to end (F1724).
- **F1509/F1508** — one uncollapsed origin-identity resolver returning both facts by name; two patches deleted; the dismiss lane now consults the origin captured at DEPARTURE.
- **F1012 CLOSED** — all four clusters (`*-args`, `*-lane`, `*-ports`, `*-patch-runtime`) collapsed; the readiness read converted from a rescued sample to an honest subscription.
- **F1735/F1736** — the redraw-coordinator subsystem deleted at its honest boundary (−1,036 lines): its phase machine could never leave idle.

**Still open, deliberately:** F1708 (a pending-regions prune inside the KEPT hit-target registry), F1717 (the native ack ledger latches the JS snapshot while native's own revision echo is empty — self-heals in the same enter; reserved for a real map change per the map lock), and the F1112 omnibus bridge split.

## Cross-cutting: the guard-integrity layer (2026-08-06, D62–D69)

**What it is.** This session's discovery, mapped because the next
engineer will otherwise re-learn it expensively: the repo's dominant
defect class is VERIFICATION THAT CANNOT FAIL — guards that report
success on work they never did. Confirmed instances, all fixed with
mutation proofs: the author-identity scanner satisfied by an unused
import, then by a comment (F2040/F2080/F2081 → `scripts/scanner-source.ts`
strips comments for every source-scanning guard); turbo resolving
mobile/shared `type-check` to `<NONEXISTENT>` and counting it success
(F2143 — CI had never compiled the app); the slice-ownership gate
returning green for a slice id that no longer existed (F2510); knip
auditing nothing (F2501); the coverage-staleness guard exempting 112
rows whose review point was prose (F2600); prettier silently rewriting
identifiers inside the audit ledgers (F2160 → ledgers + plans/ are in
`.prettierignore`).

**The enforcement pattern that survives.** An invariant is a
(mechanism, mutation) pair in
`apps/api/src/shared/invariants/registry.ts`; `yarn invariants` (CI)
re-applies every mutation and requires the mechanism to reject it.
`registry.spec.ts` refuses any lint selector not registered there. CI
carries five static guards ahead of type-check (backtick-in-SQL-comment,
railway manifests, migration parallel-worker, coverage staleness,
lint-ban inheritance) — each exists because tsc or the underlying tool
DETECTS the failure but cannot NAME it, or cannot see it at all.

**Rules burned in this session:** no backticks in `git commit -m`
(shell substitution eats them — use `-F -` with a quoted heredoc);
never `--amend` with concurrent lanes; a pathspec on `git commit` takes
the WORKING-TREE version and will absorb another lane's edits to that
file; `git ls-files` from a drifted cwd silently scopes to the subtree
(one near-false-finding); agent briefs name territories, never counts —
COVERAGE.md decays under concurrent writers.
