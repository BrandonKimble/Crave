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
bypasses), gitleaks, knip (runs in the pre-commit `deps-check` lane,
gated on package-file changes), prettier/eslint/editor configs, Railway
deploy manifests (`railway.json` api / `railway.worker.json` worker —
NEVER add a startCommand: it replaces the Dockerfile CMD, exec'd without
a shell), Expo root shims (`App.tsx` re-export + `app.config.js` — Expo
resolves the entry at workspace root; deliberate, minimal, ideal),
`patches/` (patch-package, rnmapbox 10.3.1 — applied via postinstall).

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
