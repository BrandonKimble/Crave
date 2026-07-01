# Notifications & Alerts

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Notifications are Crave's re-engagement and retention engine: they pull people back when something they care about changes — a poll they're in closes, a place they saved gets a new #1 dish, a spot they bookmarked starts surging. The pipe is real end-to-end: Expo push as the transport, a device registry (`NotificationDevice`, keyed by `expoPushToken`, optional `userId` + `city`), a queued/scheduled `Notification` table, a per-minute dispatcher cron, and a mobile deep-link listener. Today only `poll_release` flows through it; everything below is the vision for what rides on top.

The `NotificationType` enum is the extension point: every new alert is a new enum value + a `buildMessage` branch + a deep-link handler + a producer that enqueues. The rails are laid.

## Gating frame

Objective ranking, search, map, open-now/price, and polls/discussion are free; dish intelligence is the Crave+ hero. So restaurant-level alerts (a saved restaurant is surging) lean free and acquisition-friendly, while dish-level alerts (a new #1 dish at a saved place) are a natural Crave+ hook — and a free user's tap-through into a dish ranking is a paywall moment. All ranking in these alerts is the global, objective Crave Score; nothing is personalized to a user's taste.

A locked-value alert is framed as a gift — *the good thing just happened at a place you care about* — leading to a contextual unlock at the moment of intent, never a taunt about what a free user can't see. And the free stream stays majority-actionable: free users always get alerts they *can* act on (a poll they're in closed, a saved place is open late, a shared list got saved), so paywall teasers are rate-limited and never the whole stream. The notification channel is the only no-ad-budget re-engagement lever there is, so protecting trust in it outranks any single upsell.

## Movement alerts (the headline)

The differentiated loop: notify when something the user has a relationship with — saved, bookmarked, follows, voted on — materially changes. Momentum is the continuous heat-surge signal: mentions arriving faster lately than a place's own baseline. That `movementState` (surging / cooling / steady) is scope-free, which is what makes these alerts trustworthy. These alerts want that true baseline-relative surge — a place genuinely gaining momentum — not the coarse 7-day percentile-snapshot delta the result list sorts "Rising" by today, which can move just because the field reshuffled around a place that didn't change. Building the continuous heat-surge signal is a prerequisite for movement pushes worth sending.

- **"A new #1 dish appeared at a place you saved."** When the top-ranked dish at a bookmarked restaurant changes or a new dish takes its top slot. Highest-signal, very Crave-specific, dish-level → Crave+.
- **"Somewhere you bookmarked is surging."** Fire when a saved restaurant's momentum flips to surging. Restaurant-level → free.
- **"That {dish} you saved is trending again."** Re-surface a previously-saved dish when it catches a fresh wave of praise.
- **"New contender near you in {category}."** A newly-discovered or fast-surging place in a category the user saves or searches a lot.

Movement alerts are debounced, not realtime spam: per-entity per-user cooldown, a minimum momentum threshold, and digest batching — a nightly or weekly "what moved among your saves" rollup is the default shape over one push per flip. Deltas are computed during the score run and enqueued against `userId`-scoped devices.

Rank-movement alerts ("#3 in Austin burgers moved to #1") are meaningful only for a stable named chart scope, never for arbitrary viewport/search results where the cohort changes on pan/zoom/filter. They wait until named charts exist; momentum alerts carry the loop in the meantime.

## Poll lifecycle

Polls are the most mature notification surface.

- **Weekly polls are live.** The `poll_release` blast is the editorial spine — city-scoped, deep-links into the polls scene at the right poll, handling foreground tap and cold-start.
- **Results are in.** Per-poll close is a mini-event. The in-app "results are in" state carries it now; a push-on-close is the next promotion.
- **"A poll you created or voted in closed."** User-scoped close notice to the creator and participants, distinct from the city-wide release.
- **New activity on your poll.** Notify a creator when discussion arrives or a vote milestone is crossed.
- **Reply / @mention.** When someone replies to your comment or @mentions you in a poll thread.

## Follower & social activity

These ride on the followers/following social graph (`user_follows`, public profiles) once it lands, and are a fast-follow to it rather than a launch item.

- **"{user} started following you."**
- **"Someone you follow created a poll or shared a list."** Turns follows into a re-engagement channel.
- **"A list you follow was updated."** When a followed public favorites list gets new items.

## Crave+ trial & lifecycle

The user model carries `trialEndsAt`, `subscriptionStatus`, and a `Subscription` table, so trial nudges have backing data.

- **Trial-ending reminder.** "Your Crave+ trial ends in 3 days," scheduled off `trialEndsAt` via the queue's `scheduledFor` support — drive conversion before the dish layer locks.
- **Subscription lifecycle.** Welcome-to-Crave+, payment-failed, renewed.
- **Upsell on movement.** A free user's restaurant-level movement alert taps through to a dish detail that's a Crave+ paywall moment — movement alerts double as conversion triggers.

## Smart / custom alerts (longer horizon)

A user-configurable alert engine, post-MVP.

- **Custom keyword/category alerts.** User-defined triggers on category + quality threshold ("notify me when anyone raves about new pizza spots").
- **Alert management UI.** Per-category mute, digest vs realtime, quiet hours — the companion to any expansion beyond poll-release.
- **Trending-in-your-area alerts.** City-scoped pushes when dishes or spots trend in the user's market; area-wide rather than saved-entity-scoped.
- **Discovery recognition.** "You found it first" — recognize a user who saved or voted on something before it trended, tied to discoverer badges and leaderboards.

## Cross-cutting prerequisites

Build these alongside any expansion beyond poll-release:

- **Per-user targeting.** Dispatch is city-scoped today; movement, poll-participant, and follower alerts need a `userId`-scoped device lookup. The device table already stores `userId`.
- **Notification preferences / opt-in.** A per-type preference store, required before fanning out beyond poll-release.
- **Frequency caps & digest batching.** Per-user rate limits and digest rollups so movement and social alerts can't spam.
- **Generalized deep-link routing.** Each type routes to the right scene — restaurant detail, dish detail, profile, paywall.
- **Delivery observability.** Enqueue/send/fail rates per type as metrics, with alerting on dispatch failures.
- **Email channel (optional fallback).** Email could carry trial reminders and digests where push is off.

---

## Open questions

- **Movement-alert gating:** restaurant-level "a place you saved is surging" free while dish-level "new #1 dish at a saved place" is Crave+, or all movement alerts free with the dish-detail tap-through as the paywall? This sets the conversion-funnel design.
- **Realtime vs digest:** default to a nightly/weekly "what moved among your saves" digest, or realtime with strict per-entity cooldowns? Need a frequency-cap policy before build.
- **Poll-close push:** when does it graduate from the in-app state, and does it go city-wide or only to the poll's creator + voters (which needs per-user targeting)?
- **Sequencing:** per-user device targeting and the preferences store are prerequisites for nearly every alert beyond poll-release — do these come first?
- **Movement-alert readiness:** what momentum threshold or `movementState` transition actually warrants a push, and how thin is the signal until the historical corpus deepens?
