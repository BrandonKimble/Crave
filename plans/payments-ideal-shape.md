# Payments / Entitlements — Ideal Long-Term Shape

**Date:** 2026-07-08. Owner mandate: uncompromising, right-first-time, must
accommodate everything we may ever do (earned trial extensions, comps, promos,
referrals, future B2B). Companion to business/monetization docs (eater-pays,
freemium + reverse trial, $7.99/mo · $39.99/yr, push annual).

## Audit verdict (2026-07-08, full inventory in session log)

The plumbing skeleton is real and better than expected; the product layer is
absent. Working today: Stripe checkout/portal/webhooks (signed, idempotent,
event-logged), RevenueCat webhook → entitlement upsert, solid Prisma models
(Subscription, UserEntitlement, BillingEventLog w/ unique(source,eventId),
CheckoutSession), Clerk↔user↔RC/Stripe identity linkage. Absent: ANY feature
gating (0 checks in the app), mobile purchase SDK/paywall, trial logic
(coded but disabled), refund/invoice-failure webhook handlers, cancellation
endpoint, tests. Notable bugs/risks: RC webhook accepts anything if secret
unset; RC entitlementMap read but unused; user-lookup failures silently drop
events; User.subscriptionStatus can diverge from entitlements.

## The three-layer architecture

**Layer 1 — Money (providers).** Stripe (web), RevenueCat (App Store; Play
later), `manual` (us). Provider records stay provider-shaped (existing
Subscription table). Webhooks translate provider events into Layer-2 grants.
Nothing outside this layer ever talks to a provider.

**Layer 2 — Access (the heart): the ACCESS-GRANT LEDGER.** One append-style
table, `access_grants`:

```
access_grants:
  grantId, userId, entitlementCode ('premium'),
  source: subscription | trial_base | reward_photo | reward_referral |
          comp | promo | winback | gift | ...
  startsAt, expiresAt (NULL = lifetime),
  revokedAt (NULL = live), sourceRef (subscriptionId / photoId / referral
  userId / admin note), metadata, createdAt
```

Access truth = `EXISTS(grant WHERE code, revokedAt IS NULL, startsAt <= now
< COALESCE(expiresAt, ∞))`. Everything the owner listed — and everything he
hasn't thought of yet — is just a `source` value:

- **Reverse trial** = a `trial_base` grant (N days) written at signup.
- **Earned extensions** (photos, invites) = small `reward_*` grants, cap
  enforced per source (`SUM(days) WHERE source=X <= cap`).
- **Friends & family / press** = `comp` grant, `expiresAt NULL`, revocable
  with one update. Admin script + (later) admin endpoint.
- **Paid subscription** = a `subscription` grant kept in sync by the Layer-1
  webhooks (extend on renewal, revoke/expire on cancellation/refund).
- **Future promos, win-backs, gifts, founding-member lifetime deals,
  ambassador comps, B2B seats** — new source values, zero schema change.

The existing `UserEntitlement` table becomes the **materialized cache** of
the ledger (current status + max expiry per code), recomputed on every grant
write — kept because gating reads it hot; the ledger is the truth.

**Why the trial must be app-owned (not the App Store free trial):** Apple's
subscription-extension API cannot extend a subscription _during its free
period_ and allows max 2 extensions/customer/year — earned-extension
mechanics are impossible on a store trial. So: users get access from OUR
ledger from day one; the store subscription starts only at conversion. This
also means the trial works identically for users who never open a store
sheet, and web/Stripe converts the same way.

**Layer 3 — Gating.** One `EntitlementService.hasAccess(userId, code)`
(Redis-cached, invalidated on grant writes) + a `@RequireEntitlement('premium')`
guard for hard-gated endpoints + an `access` block on the session/user
payload (codes + expiry + source) so mobile renders paywalls/trial-countdown
from SERVER truth, never local inference. Gate placement per
business/monetization-and-gating.md (dish-level = premium, restaurant-level
= free) — flag-gated rollout so dev/dogfood stays open.

## Purchase flows (how the pieces talk)

- **iOS:** mobile `react-native-purchases` SDK (app_user_id = Clerk id) →
  StoreKit purchase → RevenueCat validates receipt → RC webhook → Layer-1
  record + Layer-2 `subscription` grant. RC is receipt-validation + store
  truth ONLY — never the access truth (our ledger is, because RC can't see
  comps/rewards).
- **Web (and the future Epic-ruling external-link paywall):** Stripe
  checkout → webhook → same grant path. The external-payment play later is
  ONLY a new way to open this existing flow — no architectural change.
- **Restore/cross-device:** access rides the ledger keyed to the Crave user,
  so login = access; store restore just reconciles Layer 1.

## Build plan (strangler order, each step shippable)

1. **Ledger + EntitlementService + guard** (schema, cache, `hasAccess`,
   `@RequireEntitlement`, session `access` block; migrate UserEntitlement to
   cache role). Trial-base grant at signup (`BILLING_TRIAL_DAYS` finally on).
2. **Webhook hardening:** RC secret REQUIRED (fail closed), entitlementMap
   actually applied, user-lookup failure → event status `failed` + retry (not
   silent drop), refund/chargeback + invoice-failure handlers, cancellation
   endpoint, `markCheckoutSessionCompleted` race fix.
3. **Grant writers:** comp admin script; reward-grant service with per-source
   caps (photos/invites hook in later with one call).
4. **Gating rollout:** guard on dish-tier endpoints behind
   `ENTITLEMENT_GATING=off|log|enforce` (log mode first = observe who WOULD
   be blocked, then enforce).
5. **Mobile:** react-native-purchases + paywall screen (screens thread
   collaboration) + sandbox purchase E2E against staging.
6. **Tests:** webhook replay/idempotency suite, grant-cap property tests,
   gate matrix (trial/paid/comp/expired × endpoints).

## Owner Q&A (settled this session)

- **Trial-extension precedent:** real but underused in consumer mobile —
  Dropbox's referral storage is the canonical ancestor; UpdateAI stacks
  2-week extensions per qualifying action; monday.com exposes trial
  extensions as an app-platform primitive; RevenueCat documents promotional
  extensions/entitlements for exactly referral-reward flows. Verdict: sound
  mechanic, differentiating in this category, and cheap under the ledger.
- **Comps:** `comp` lifetime grants, revocable, with `sourceRef` naming who
  and why.
- **Future mechanics the ledger already accommodates:** App Store offer
  codes (arrive as RC webhooks → grants), win-back offers, founding-member
  lifetime purchase at launch, gift subs, student/creator tiers, regional
  pricing (Layer-1 config), paused subscriptions (grant gap), ambassador/
  influencer comps, B2B restaurant accounts (new entitlementCode, phase 2),
  double-sided referral rewards (grant to both users).

## Step 5 — mobile integration (built 2026-07-08)

Shipped:

- `apps/mobile/src/services/purchases.ts` — RC wrapper; app_user_id = Clerk
  user id; guarded `require` so the JS bundle survives until the native
  module is in the dev-client binary; `isPurchasesAvailable()` tells the UI.
- `apps/mobile/src/providers/PurchasesProvider.tsx` — mounted in App.tsx,
  keeps RC identity in lockstep with Clerk (configure/logIn/logOut).
- `apps/mobile/src/hooks/useAccess.ts` — THE access hook: server-truth
  `access` block from GET /users/me (react-query). Never gates on
  CustomerInfo.
- `apps/mobile/src/screens/PaywallScreen.tsx` — functional skeleton
  (offerings → purchase → poll server truth → restore). Screens thread
  re-skins + mounts it.
- `UserProfile.access` (AccessSummary) in services/users.ts;
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in .env/.env.example (empty = no-op).

Owner setup required before sandbox E2E (not executable by Claude):

1. App Store Connect: create the auto-renewing subscription group +
   products (monthly $7.99, annual $39.99), fill paid-apps agreement.
2. RevenueCat: create project + iOS app, paste the App Store Connect
   API key, define entitlement (map to our `premium` via
   REVENUECAT_ENTITLEMENT_MAP), attach products to a "default" offering,
   copy the public iOS SDK key into EXPO_PUBLIC_REVENUECAT_IOS_KEY.
3. RC webhook: point at POST /billing/webhooks/revenuecat with the bearer
   secret in REVENUECAT_WEBHOOK_SECRET (endpoint fails closed without it).
4. Rebuild the dev client (react-native-purchases is native):
   `npx expo prebuild` not needed — just a new xcodebuild of the workspace
   after pod install; until then all purchase calls no-op by design.
5. Sandbox test: App Store sandbox tester account → purchase in PaywallScreen
   → RC webhook → `access_grants` row (source `subscription`,
   sourceRef `revenuecat:<txn>`) → /users/me access flips.

## Business-model DECISION (2026-07-08)

**Launch = soft paywall at onboarding end.** Options: monthly (paid
immediately) or annual with an **App Store introductory free trial** (card
upfront, store-managed; Apple reminds before it converts, cancel anytime).
Dismissible — declining lands on the free tier (restaurants/map/polls);
dish layer stays gated. Rationale: fastest capital return + simplest.

What this changes vs the doc above:

- The launch trial is the STORE'S intro offer on the annual product, not
  the app-owned `trial_base` grant. `BILLING_TRIAL_DAYS` stays **0**.
- App-owned trial + earned-extension mechanics = the future **freemium
  pivot** (everything is built and env-gated; flipping = set
  BILLING_TRIAL_DAYS>0 + copy changes). Nothing gets deleted.
- Reward grants (photo/invite days) still work at launch for FREE users —
  they grant real dish-layer days through the ledger without a
  subscription. Marketing framing: "earn Crave+ days."
- Apple's no-extension limit doesn't bite: we never extend the store
  trial; earned days ride the ledger on top.
- Gate flip to `enforce` is now unblocked (was waiting on this decision) —
  do it as part of launch checklist, after paywall screens exist.
- App Store Connect setup gains one item: attach the introductory offer
  (free trial, e.g. 7 days) to the ANNUAL product only.

## RevenueCat setup — EXECUTED via API (2026-07-08)

Project `proj2c08e0c4` ("crave"). Done programmatically:

- App Store app `app2a9f58f2f5` "Crave iOS" (bundle
  com.brandonkimble.cravesearch); public SDK key
  `appl_yCAqmZfLvXlzLbvGpWVLvcnlGKs` (use for TestFlight/App Store builds).
- Entitlement `premium` (entldc08408f8e, display "Crave+") — lookup key now
  MATCHES the backend code, so REVENUECAT_ENTITLEMENT_MAP=premium:premium
  (identity). Old `crave Pro` (entl60198dffff) detached + ARCHIVED.
- Both Test Store products (monthly/yearly) attached to `premium`; default
  offering already had $rc_monthly/$rc_annual packages (Nov 2025 scaffold).
- Deleted the dead ngrok sandbox webhook. Recreate at sandbox-E2E time
  (ngrok URL + Authorization header = REVENUECAT_WEBHOOK_SECRET), and a
  production one at the Railway URL before launch.
- Dev .env: EXPO_PUBLIC_REVENUECAT_IOS_KEY = the Test Store public key →
  the purchase flow is testable in the dev client BEFORE Apple enrollment
  (RC Test Store simulates the store).

Still waiting on Apple (owner): Developer Program enrollment → paid-apps
agreement → create ASC subscription products ($7.99 monthly / $39.99 annual

- intro free trial on annual) → connect ASC API key in RC app settings
  (app_store_connect_api_key_configured=false) → real products in RC
  referencing ASC product IDs + attach to `premium` and packages.

## Test Store E2E — PASSED (2026-07-08)

Full loop verified on the sim (user kimble.brandonm+clerk_test@gmail.com):
paywall (dev harness `crave://paywall-preview?show=1`) → RC Test Store
purchase → webhook (cloudflared tunnel) → `access_grants` row
(source subscription, sourceRef revenuecat:<txn>, expiry = expiration_at_ms)
→ UserEntitlement cache → /users/me access block → cold-started app renders
"You have Crave+ / Access until <date>". RC's 5xx retry loop recovered our
earlier failures — fail-loud design validated for real.

FOUR real bugs found by the E2E (all fixed + regression-tested):

1. lookupUserByAuthIdentifier: non-UUID app_user_id (Clerk id) against the
   UUID userId column → Prisma P2023 crash. Guard: userId arm only if UUID.
2. RC subscription upsert set currentPeriodEnd without currentPeriodStart →
   check_subscription_period_consistency violation → grant never written.
3. Modern RC events send entitlement_ids[] (entitlement_id null) → code fell
   back to product_id as the entitlement code.
4. Handler logged events 'processed' BEFORE processing; failures were
   invisible. Now: TEST events log-and-return; processing failure marks the
   event row failed AND rethrows (5xx → RC retries).

Notes: Test Store prices are placeholders ($9.99/$79.99) — real prices live
in ASC products ($7.99/$39.99). nest build does NOT copy prompt .md assets
to dist (rsync'd manually; the dev watcher handles it in watch mode).

## Red team #2 — full-surface (2026-07-08, 4 independent reviewers + verify pass)

All findings verified against code before fixing. Everything below is FIXED,
tested (35 backend tests incl. new regression suite; 113 repo-wide green),
and the dev API restarted on the fixed build.

**Ledger representation change (the big one):** day grants (trial_base,
rewards, winback, gift) no longer store absolute expiries. They store
metadata.grantedDays; summarize() DERIVES coverage as a chain anchored at
the latest absolute-grant effective end (expiry, clamped to revocation).
Pure function of ledger rows. Kills: the refund-tail exploit (annual sub +
1 photo + refund left a ~366-day reward tail; now the chain re-anchors to
the refund → 1 day), incoherent revocation arithmetic, and reward days
burning invisibly under lifetime comps.

**Ledger concurrency:** every write path runs in a transaction holding a
per-(user,code) pg advisory lock (cap clamps, reward idempotency,
subscription sync, signup trial are single-writer now); partial unique
index on live (user_id, source, source_ref) rows is the RED backstop
(P2002 = idempotent no-op). Redis is single-writer: recomputeCache SETs the
computed value; hasAccess only SET-NXes cold misses (no stale-clobber
window). Guard reads ENTITLEMENT_GATING per call (no construction latch).

**RC webhook lifecycle (was badly broken):** explicit event-type map
replaces substring matching — previously UNCANCELLATION matched
includes('cancel') and REVOKED re-subscribers; CANCELLATION revoked paid
access immediately (should ride to expiry — EXPIRATION ends access);
unknown/expiration-less events minted LIFETIME grants (TRANSFER!). Now:
CANCELLATION/SUBSCRIPTION_PAUSED keep the grant to expiry; EXPIRATION ends
it; period_type=TRIAL → trialing status (grant still active); unknown types
log-and-skip; subscription grants REFUSE to be lifetime; TRANSFER revokes
the losing account's revenuecat-ref grants and resyncs the gaining account
from RC's v1 subscriber API; PRODUCT_CHANGE revokes the old entitlement
code's grant inside the same lock. Replay guard (processed event id = ack)

- monotonic event_timestamp_ms check (stale retries can't overwrite newer
  state). Timing-safe bearer compare.

**Stripe parity:** events logged processed only AFTER processing (failed +
rethrow → Stripe retries); charge.refunded scoped to FULL refunds of the
refunded charge's own subscription (partial refunds and one-off charges
never touch access; a Stripe refund can never revoke an RC grant);
'incomplete' no longer maps to active (free-access-without-paying);
trialing Stripe subs grant access; cancel endpoint detects RC subscribers
→ {code:'MANAGE_IN_APP_STORE'}; user.subscriptionStatus mirrored on the RC
path too.

**Mobile:** react-query cache cleared on ANY account switch
(PurchasesProvider watches identity; access query key also user-scoped —
belt + suspenders against serving user A's premium state to user B); RC
identity transitions serialized through a promise queue; purchases REFUSED
unless RC is confirmed configured as the purchasing Clerk user (no
anonymous-purchase window); configure wrapped (unlinked native module →
availability false, not a crash); post-purchase poll early-exits on access
flip and after a store-confirmed purchase the buy buttons NEVER re-arm
("Activating…" state — no double-charge path); restore uses the same poll;
client-side expiry override (cached active + past expiresAt reads
inactive); RELEASE builds with a test\_ key disable purchases loudly
(Test-Store-in-prod = App Review rejection).

**Deferred/owner items from the model-fit review:** see the decision list
in the session summary — gate scope (gate-everything vs thin free shell),
in-app account deletion (Apple 5.1.1(v), REQUIRED before submission),
3.1.2 disclosure block + manage-subscription link (screens thread),
App Review demo account via comp grant, reward-days = win-back framing at
launch.

## Model decisions FINAL (owner, 2026-07-09)

1. **Gate scope: EVERYTHING.** After the trial/subscription lapses, the whole
   app is behind the wall (restaurants/map/polls included). The thin-free-
   shell alternative is shelved completely. Implementation: app-wide
   `EntitlementEnforcementInterceptor` (global APP_INTERCEPTOR — an
   interceptor, not a guard, because global guards run before controller
   auth attaches request.user). Every authenticated route requires access
   unless `@AllowUnentitled()`. Exempt surface: auth, users/me (profile,
   onboarding, deletion), public users, billing + webhooks, health, legal,
   markets (onboarding support), favorites share/public links, metrics.
   Rollout rides ENTITLEMENT_GATING (currently log) — log mode records every
   WOULD-block with route+user, so the exempt set gets validated against
   real dogfood traffic before enforce. FREEMIUM PIVOT = add
   @AllowUnentitled to the free-surface controllers (one line each) + set
   BILLING_TRIAL_DAYS>0.
2. **Intro free trial on ANNUAL ONLY** (card upfront, store-managed).
   Monthly = pay immediately. ASC setup: attach the introductory offer to
   the annual product only.
3. **Reward days are DORMANT at launch** (REWARD_PHOTO_DAYS /
   REWARD_REFERRAL_DAYS default 0). Under a hard paywall every in-app user
   already pays, and ledger days don't stop Apple's billing clock — they
   only matter to a LAPSED user. Honest framing: win-back cushion, not an
   incentive. Launch incentives should be non-access rewards or App Store
   offer codes instead; the machinery stays for the freemium pivot.

## Ideal-shape red team #3 — EXECUTED (2026-07-09)

Three reviewers (truth-duplication, ledger semantics, hard-paywall UX flow);
all verdicts implemented same-day:

**Ledger:** derivation math BLESSED on every adversarial timeline. Upgrades:
GRANT_POLICY single source declaration; granted_days real column with
day-XOR-absolute CHECK; cap counts days EVER granted; AccessSummary splits
paidUntil/coverageUntil (subscriber's source never reports a banked reward).
BLESSED SEMANTIC ON RECORD: banked days are banked forever and re-payable
across lapse cycles (economically self-limiting; consumption accounting
deliberately not built unless abuse appears).

**Deletions:** billing_entitlements, billing_checkout_sessions, user
subscription/trial/referral columns, Stripe checkout/portal client rail,
per-route gates (see refactor commit). End state: one truth (access_grants),
one derivation (summarize), one cache (Redis), one mirror
(billing_subscriptions), one wall (interceptor).

**Hard-paywall UX (mobile, all three launch-blockers built):**

1. LAPSE CHOKEPOINT: api.ts catches 403 ENTITLEMENT_REQUIRED once →
   entitlementLapseStore → EntitlementLapseHost full-screen paywall takeover
   (inside the auth tree; self-dismisses if a refresh proves access, clears
   only when access flips active). Generic mutation-failure modal suppressed
   for this error class — one story.
2. PAYWALL ROUTING AXIS: AppRouteCoordinator gains the third axis — signed
   in + onboarded + !access.active → destination 'paywall' (non-dismissible
   PaywallScreen in RootNavigator). Keyed on access.enforced, a NEW
   server-owned flag in the profile access block (true only when
   ENTITLEMENT_GATING=enforce) so the rollout stays one server switch and
   dev/log-mode dogfooding is never walled. Coordinator seeds the shared
   access query from its own profile fetch (no double request, no flash).
3. 3.1.2 DISCLOSURE FLOOR on PaywallScreen: per-package terms line rendered
   from StoreKit introPrice (trial timeline on annual, billed-now on
   monthly), auto-renew sentence, Terms/Privacy/Manage-subscription links.
   PRIVACY_URL is a placeholder (cravesearch.com/privacy) — must go live
   with the landing site before submission. Screens thread re-skins.

Multi-session note: the sim binary currently installed was rebuilt by the
nav session WITHOUT the RC pod — purchases layer no-ops gracefully (the
exact degradation path the red team demanded). Rebuild with pod install
before the next purchase test.
