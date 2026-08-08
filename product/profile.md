# Profile & Social

> **Rolling canonical vision — not a changelog.** Keep this file thin and _current_: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Profile & Social is Crave's identity, trust, and virality layer: usernames, avatars, public profiles, the follow graph, profile activity tabs, and the friend signals that ride alongside the objective Crave Score. It's a growth surface, so under freemium it stays **free forever** — profiles, following, and creating/sharing favorites lists are all on the free side. The Crave Score is objective and global — never personalized to taste. Friends are the _second axis_ next to it: "what people you trust say" laid over "what the crowd says," always as an explicit, visible overlay, never as inferred-taste re-ranking of the Score.

## Identity: usernames, avatars, display name

Every user has an `@handle`: case-insensitive unique, 3–20 chars, lowercase letters/numbers/`_`/`.`, must start with a letter, no trailing or consecutive separators, no numeric-only handles. Claiming runs through a moderation pipeline — local validation → reserved-word and profanity checks → uniqueness (against current handles and history) → an optional external safety API — returning clear reasons (`taken`, `reserved`, `invalid_format`, `blocked_word`, `profanity`, `cooldown`).

Users get one free initial set, then a 30-day edit cooldown. Every handle a user has ever held is kept for anti-squatting and uniqueness. A post-auth onboarding step lets users pick their handle with live debounced availability and suggestions when a name is taken ("Pick your username. This is how people find you. You can change it later.").

Display name and avatar resolve from the session JWT and gap-backfill, never overwriting a user's own edits. The in-app avatar picker/upload rides the SAME Cloudinary machinery as UGC photos (signed ticket, Rekognition safety moderation, CDN delivery) — one asset per user (overwrite), square delivery variants — and renders on the profile page, in poll discussions, and on future friend-presence chips. Entry: Edit Profile → tap the picture → a shared camera/library modal.

> **Correction 2026-08-07 (D149-V):** avatars are no longer moderated by Rekognition. That was a Cloudinary upload-preset add-on (prepaid, un-metered, 50 free images/month) and it is retired; safety now runs as our own Google Cloud Vision SafeSearch call on the delivery URL, metered into `api_usage_ledger` like Places and Gemini. Same posture for the user: a new avatar goes live only once it is approved, the old one stays up until then, and a rejected image is destroyed — with the destroy retried by the photo sweep until the asset is actually gone (F9701).

## Profile screen

The profile is ONE dynamic single page (the Google-Maps-profile pattern), a top-level nav scene with the app nav bar retained. A persistent top shows avatar (or initials fallback), display name, @username, and a four-stat row — Polls created, Polls contributed, Followers, Following — tappable to jump to each section, with counts denormalized per user and kept fresh by service hooks on polls, votes/endorsements, list changes, and follows. Below the top, a segmented control swaps sections in place: Polls / Comments / Lists / Photos (owner wants 3 — merging Polls + Comments into a single "Posts" section is the open idea). Others' Lists section is the Spotify-playlists analog: chronological first, with toggle-strip filters likely.

The primary action is context-dependent: on your own profile the top carries **Edit Profile** plus messages-inbox and settings entries; viewing someone else's it carries a **Follow + Message** pair (Instagram-style). Viewing another user's profile shows their public profile and public lists only. (Messaging is IN — see product/messaging.md.) Avatar change: Edit Profile → tap the picture → a shared 2-option modal (camera / library).

## Friend graph & friends' picks

The friend graph is the trust axis. The Crave Score is crowd consensus; the friend layer answers the different question — _what do the people I trust like?_ — seeded by users' custom-ranked lists (see `favorites.md`), where the order is a person's real opinion. It comes in three consumption modes, from pull to ambient.

**Find & follow.** People are discoverable through the search bar via a dedicated **people lane**. Following is a one-directional graph (followers / following, no self-follows), surfaced with user stats on every profile. "Following" is distinct from the favorites All/Mine/Shared filter — that filter is about lists in your own library (yours vs. shared-with-you); Following powers profiles and the ambient signals below, not a favorites filter.

**Browse (pull mode).** A followed user's profile is the destination for "show me everything this person likes" — their public lists and custom rankings, browsable end to end.

**Ambient friend signals (the headline mode).** You should _not_ have to visit a profile to benefit — friend signals come to you, wherever a restaurant or dish appears. The signal is a shared **FriendCluster** primitive: stacked, overlapping friend avatars (left to right) + a short label. The avatar stack, the "and others" collapse, and the affinity naming are shared; the label _template_ differs by surface:

- **Restaurants / dishes** — "**Saved by** Sarah and others" (verb-first). Appears on the result sheet, on cards inside favorites lists, and on restaurant/dish detail.
- **Polls** — flipped to **subject-first and action-specific**: "**Sarah voted**" if the friend tapped to vote on the poll, or "**Sarah commented**" if they participated in the discussion (+ "and others"). The verb reflects the friend's actual action (see `polls.md`).

**Who gets named:** the single named friend is the highest **friend-affinity** one (a tunable score — profile-view frequency is the v1 input, with room to fold in interaction count and recency); everyone else collapses into "and others." Tapping the cluster expands the full list.

**Friend-presence chips on cards.** A related future signal: small avatar chips on restaurant/dish cards showing friends who've been / tried / photographed the same thing. It needs the follow graph plus tried/been data, and is a card-design decision (card real estate + which signals qualify); noted here so the card design pass accounts for the slot.

**Integrity — this is not the banned personalization.** Friend signals are an explicit, visually-distinct _overlay_. They never silently re-rank the objective Crave Score: the default order stays objective. It's a social signal you read, not inferred-taste re-ranking — which keeps the Score pure. (Restaurant-level clusters are free; dish-level ones ride with the Crave+ dish layer.)

**Friends lens (exploring — not committed).** A possible opt-in toggle that filters results to _only_ what friends have saved/ranked — the active "show me only my friends' sushi picks" view. The ambient cluster above may already cover most of this need, so this is a maybe to validate against real usage, not a decided feature.

**Your-circle's-consensus (later).** Aggregate the rankings of everyone you follow into a private "your people's top X" — a friend-only mini-Crave-Score. It's the natural endpoint of the friend layer, and it stays clearly walled off from the global objective Score.

## Shareable lists (virality)

List-sharing is our primary intended virality surface; a public ranked list is a far more compelling shareable artifact than an unordered pile, and it's the acquisition hook in a no-ad-budget model. Each list carries a short share slug and a share toggle; sharing creates or rotates the slug, revoking disables sharing while retaining the slug as inactive, and a public read endpoint serves the list by slug. Lists open via app deep links (`crave://l/{slug}`, with the invite variant `crave://l/{slug}?join=1`) and web universal links (`https://<domain>/l/{slug}`) with an install CTA when the app isn't present. Share events (created/opened/copied/revoked) are tracked to analytics.

A branded **"Share your bookmarks" infographic** generates a shareable image of a user's top 5–10 saved dish/restaurant pairs ("found through community recommendations using Crave").

## Social sharing & viral loop

A **Share Your Discovery** flow offers a pre-filled, user-editable template ("Just tried [dish] at [restaurant] — found through community recommendations…") with dynamic dish/restaurant insertion from recent saves, built-in gratitude, a location-targeted subreddit, and timing suggestions. Outbound links carry UTM attribution plus content and geo tags; we log share completions and downstream discoveries and track the viral coefficient (target >0.2 new users per active user).

A **referral-unlock escape hatch** lets users invite N friends to unlock as a non-monetary path past the Crave+ gate — tying social growth directly to monetization.

## Recognition (decoupled from ranking)

Light social recognition lives on the profile: discoverer/contributor badges for users who surface trending dishes early or contribute heavily, and a "Track your impact" stat showing a user's influence (polls that graduated, dishes they helped surface). The framing is profile identity as a "local food discoverer" — a retention lever. **None of this may touch the Crave Score ranking**, which is objective and global; recognition is a social flourish only and must never read as pay- or clout-to-rank.

Engagement is recognized, never PAID — there are no monetary rewards for engagement (the reward-days machinery for photos/referrals is gone; days can't stop Apple's billing clock, so they were a non-reward for subscribers anyway). The shape:

- **One universal recognition mechanic** across ALL engagement types (photos, poll posts, comments, votes, and maybe lists — though list-count is trivially gameable): Reddit-style badges or a "verified contributor" mark, not per-feature one-offs.
- **Photo credits are definite** — contributors get visible attribution on the photos they add.
- **No top-contributor leaderboard surface** (a Beli anti-pattern: an aura of unattainability, wrong vibes). If a competitive layer ever ships it is friends-scoped and designed from engagement data (likes, contribution metrics) so it motivates rather than demotivates — a much later, deliberate design pass.
- **Referral incentives, when they come, ride App Store OFFER CODES** (real billing value), not ledger days.
- Launch will likely ship SOME engagement incentive (especially for images); that design belongs to the screens/product thread, and the backend hookups are trivial once the mechanic is chosen (recognition is user-data + UI, not billing).

## The food-log gallery

The profile auto-aggregates every photo the user adds anywhere in the app — grouped by restaurant, dishes within, takenAt (EXIF) kept for a later timeline. The vision is the place people keep ALL their food photos (replacing the camera-roll habit), seeded via the "archaeology" import entry (pick photos → "where is this?" → optional dish link; own lists + recents boosted in that search). Photo credits render here (see Recognition above). Gallery presentation/organization is a parked profile design pass. Photo impressions/taps are tracked from day one and may later drive sorting here.

## Ambient social (considered, deferred)

There is NO user feed (a deliberate ~50-50 call; polls are the engagement center). If ambient social ever ships, it is the Spotify-peek analog ("X added 3 places to Want to Go"), not a posting feed. Do not relitigate without the owner.

## Still to decide

- **Recognition at launch** — do we ship any badges / "track your impact" / leaderboards, and how do we keep them visibly decoupled from the objective ranking?
- **Friends lens default** — is the lens always opt-in per session, or can a user set it sticky? And does the friend chip show on results by default for everyone, or is it itself opt-in?
- **Your-circle's-consensus scope** — what's the minimum follow count before "your people's top X" is meaningful, and how do we present it so it never blurs with the global Score?
- **Stat integrity** — are the user-stats counters guaranteed in lockstep by service hooks, or do we need a periodic reconciler to catch drift?

## Pause/deactivate account (vs delete)

Pause/deactivate account (vs delete) — owner wants a deactivation option at delete-time (keep-everything-come-back-later); legal way to offer resurrection; relates to subscription cancel flow. 2026-08-07.

**Update 2026-08-07 (owner ruling):** Pause/deactivate is RULED OUT — not building it.
Every need it served is covered: break = stop using the app (+ notifications toggle, roadmap);
stop paying = Manage subscription (cancel/resubscribe; non-use deletes nothing); erase =
Delete with its 30-day restore. Full design + recon costing in audit/DESIGNS.md D147 if
real demand ever appears. If ever revisited: standalone Settings row ONLY — never a
cancel/delete-time interstitial (blueprint compliance, Cal AI precedent).
