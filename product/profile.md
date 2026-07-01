# Profile & Social

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Profile & Social is Crave's identity, trust, and virality layer: usernames, avatars, public profiles, the follow graph, profile activity tabs, and the friend signals that ride alongside the objective Crave Score. It's a growth surface, so under freemium it stays **free forever** — profiles, following, and creating/sharing favorites lists are all on the free side. The Crave Score is objective and global — never personalized to taste. Friends are the *second axis* next to it: "what people you trust say" laid over "what the crowd says," always as an explicit, visible overlay, never as inferred-taste re-ranking of the Score.

## Identity: usernames, avatars, display name

Every user has an `@handle`: case-insensitive unique, 3–20 chars, lowercase letters/numbers/`_`/`.`, must start with a letter, no trailing or consecutive separators, no numeric-only handles. Claiming runs through a moderation pipeline — local validation → reserved-word and profanity checks → uniqueness (against current handles and history) → an optional external safety API — returning clear reasons (`taken`, `reserved`, `invalid_format`, `blocked_word`, `profanity`, `cooldown`).

Users get one free initial set, then a 30-day edit cooldown. Every handle a user has ever held is kept for anti-squatting and uniqueness. A post-auth onboarding step lets users pick their handle with live debounced availability and suggestions when a name is taken ("Pick your username. This is how people find you. You can change it later.").

Display name and avatar resolve from the session JWT and gap-backfill, never overwriting a user's own edits. We still owe an in-app avatar picker/upload — there's no upload path today.

## Profile screen

The profile is a top-level nav scene with the app nav bar retained. The header shows avatar (or initials fallback), display name, @username, and settings. A four-stat row — Polls created, Polls contributed, Followers, Following — is tappable to jump to each section, with counts denormalized per user and kept fresh by service hooks on polls, votes/endorsements, list changes, and follows. A segmented control swaps three activity tabs:

- **Created** — polls the user made.
- **Contributed** — polls they voted/endorsed in or added a candidate to.
- **Lists** — the user's public favorites lists and their custom rankings.

The primary action is context-dependent: **Edit profile** on your own profile, **Follow / Unfollow** when viewing someone else's. Viewing another user's profile shows their public profile and public lists only.

## Friend graph & friends' picks

The friend graph is the trust axis. The Crave Score is crowd consensus; the friend layer answers the different question — *what do the people I trust like?* — seeded by users' custom-ranked lists (see `favorites.md`), where the order is a person's real opinion. It comes in three consumption modes, from pull to ambient.

**Find & follow.** People are discoverable through the search bar via a dedicated **people lane**. Following is a one-directional graph (followers / following, no self-follows), surfaced with user stats on every profile. "Following" is distinct from the favorites All/Mine/Shared filter — that filter is about lists in your own library (yours vs. shared-with-you); Following powers profiles and the ambient signals below, not a favorites filter.

**Browse (pull mode).** A followed user's profile is the destination for "show me everything this person likes" — their public lists and custom rankings, browsable end to end.

**Ambient friend signals (the headline mode).** You should *not* have to visit a profile to benefit — friend signals come to you, wherever a restaurant or dish appears. The signal is a shared **FriendCluster** primitive: stacked, overlapping friend avatars (left to right) + a short label. The avatar stack, the "and others" collapse, and the affinity naming are shared; the label *template* differs by surface:

- **Restaurants / dishes** — "**Saved by** Sarah and others" (verb-first). Appears on the result sheet, on cards inside favorites lists, and on restaurant/dish detail.
- **Polls** — flipped to **subject-first and action-specific**: "**Sarah voted**" if the friend tapped to vote on the poll, or "**Sarah commented**" if they participated in the discussion (+ "and others"). The verb reflects the friend's actual action (see `polls.md`).

**Who gets named:** the single named friend is the highest **friend-affinity** one (a tunable score — profile-view frequency is the v1 input, with room to fold in interaction count and recency); everyone else collapses into "and others." Tapping the cluster expands the full list.

**Integrity — this is not the banned personalization.** Friend signals are an explicit, visually-distinct *overlay*. They never silently re-rank the objective Crave Score: the default order stays objective. It's a social signal you read, not inferred-taste re-ranking — which keeps the Score pure. (Restaurant-level clusters are free; dish-level ones ride with the Crave+ dish layer.)

**Friends lens (exploring — not committed).** A possible opt-in toggle that filters results to *only* what friends have saved/ranked — the active "show me only my friends' sushi picks" view. The ambient cluster above may already cover most of this need, so this is a maybe to validate against real usage, not a decided feature.

**Your-circle's-consensus (later).** Aggregate the rankings of everyone you follow into a private "your people's top X" — a friend-only mini-Crave-Score. It's the natural endpoint of the friend layer, and it stays clearly walled off from the global objective Score.

## Shareable lists (virality)

List-sharing is our primary intended virality surface; a public ranked list is a far more compelling shareable artifact than an unordered pile, and it's the acquisition hook in a no-ad-budget model. Each list carries a short share slug and a share toggle; sharing creates or rotates the slug, revoking disables sharing while retaining the slug as inactive, and a public read endpoint serves the list by slug. Lists open via app deep links (`crave-search://favorites/lists/{slug}`) and web universal links (`https://<domain>/l/{slug}`) with an install CTA when the app isn't present. Share events (created/opened/copied/revoked) are tracked to analytics.

A branded **"Share your bookmarks" infographic** generates a shareable image of a user's top 5–10 saved dish/restaurant pairs ("found through community recommendations using Crave").

## Social sharing & viral loop

A **Share Your Discovery** flow offers a pre-filled, user-editable template ("Just tried [dish] at [restaurant] — found through community recommendations…") with dynamic dish/restaurant insertion from recent saves, built-in gratitude, a location-targeted subreddit, and timing suggestions. Outbound links carry UTM attribution plus content and geo tags; we log share completions and downstream discoveries and track the viral coefficient (target >0.2 new users per active user).

A **referral-unlock escape hatch** lets users invite N friends to unlock as a non-monetary path past the Crave+ gate — tying social growth directly to monetization.

## Recognition (decoupled from ranking)

Light social recognition lives on the profile: discoverer/contributor badges for users who surface trending dishes early or contribute heavily, optional top-local-contributor leaderboards, and a "Track your impact" stat showing a user's influence (polls that graduated, dishes they helped surface). The framing is profile identity as a "local food discoverer" — a retention lever. **None of this may touch the Crave Score ranking**, which is objective and global; recognition is a social flourish only and must never read as pay- or clout-to-rank.

## Still to decide

- **Avatars** — build an in-app avatar picker/upload, or keep the JWT-sourced avatar as the permanent answer?
- **Recognition at launch** — do we ship any badges / "track your impact" / leaderboards, and how do we keep them visibly decoupled from the objective ranking?
- **Friends lens default** — is the lens always opt-in per session, or can a user set it sticky? And does the friend chip show on results by default for everyone, or is it itself opt-in?
- **Your-circle's-consensus scope** — what's the minimum follow count before "your people's top X" is meaningful, and how do we present it so it never blurs with the global Score?
- **Stat integrity** — are the user-stats counters guaranteed in lockstep by service hooks, or do we need a periodic reconciler to catch drift?
