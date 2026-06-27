# Profile & Social

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Profile & Social is Crave's identity and virality layer: usernames, avatars, public and private profiles, a follow graph, user stats, profile activity tabs, and shareable favorites lists. It's a growth surface, so under the freemium model it stays **free forever** — profiles, following, and creating and sharing favorites lists are all on the free side. The only paid hook here is power sort/filter on your own lists; dish intelligence (the Crave+ hero) lives in its own area.

The canonical design lives in `plans/profile-screen.md`.

## Identity: usernames, avatars, display name

Every user has an `@handle`: case-insensitive unique, 3–20 chars, lowercase letters/numbers/`_`/`.`, must start with a letter, no trailing or consecutive separators, no numeric-only handles. Claiming runs through a moderation pipeline — local validation → reserved-word and profanity checks → uniqueness (against current handles and history) → an optional external safety API — returning clear reasons (`taken`, `reserved`, `invalid_format`, `blocked_word`, `profanity`, `cooldown`, etc.).

Users get one free initial set, then a 30-day edit cooldown. Every handle a user has ever held is kept in a history table for anti-squatting and uniqueness. A post-auth onboarding step lets users pick their handle with live debounced availability and suggestions when a name is taken or invalid ("Pick your username. This is how people find you. You can change it later.").

Display name and avatar are resolved from the session JWT and gap-backfilled, never overwriting a user's own edits. We still owe an in-app avatar picker/upload — custom avatars are a common expectation and there's no upload path today.

## Profile screen (Instagram/Twitter-style)

The profile is a top-level nav scene of its own, with the app nav bar retained. The header shows avatar (or initials fallback), display name, @username, and a settings icon. A four-stat row — Polls created, Polls contributed, Followers, Following — is tappable to jump to each section. A segmented control swaps three activity tabs:

- **Created** — polls the user made.
- **Contributed** — polls they voted/endorsed in or added a candidate to (each shown with a "Contributed" badge).
- **Lists** — the user's public favorites lists.

The primary action is context-dependent: **Edit profile** on your own profile, **Follow / Unfollow** when viewing someone else's. Stat counts are denormalized per user (polls created/contributed, followers/following, list and item counts) and kept fresh by service hooks on polls, votes/endorsements, list changes, and follows.

## Follow graph

Users follow and unfollow each other (one row per directed edge, no self-follows). Paginated Followers and Following lists return avatar, display name, and handle. Viewing another user's **public profile** shows their public profile and public lists only. Building out the other-user profile view, the Follow button, and the Followers/Following screens on mobile is the highest-leverage social work remaining — the APIs already exist.

## Favorites lists

Favorites are list-based (no single-toggle bookmarks). Each list has a name, description, a type (restaurant **or** dish), and visibility (public or private); items are a restaurant or a dish connection. The favorites screen is an all-white, 2-column grid of cutout tiles, each previewing 3–5 rows (dot + name) where the dot color is the continuous, objective Crave Score color from the shared color curve. A segmented toggle switches Restaurants | Dishes.

Opening a list shows a detail screen that mirrors Search Results — same overlay, frost, rows, and meta lines — but with no search toggles, a fixed list type, and a top bar with title, Share, and an ellipsis menu (Edit, Share, Make Private/Public, Delete) plus inline title/description editing.

Saving opens a **Save to List** bottom sheet locked to the content type: a restaurant card offers restaurant lists, a dish result offers dish lists. The sheet is a grid of existing lists plus a "New list" tile that expands into a panel (name, description, public/private, Create); the same expand panel is reused for Edit.

## Shareable lists (virality)

Each list can carry a short share slug and a share toggle. Sharing creates or rotates the slug; revoking disables sharing while retaining the slug as inactive; a public read endpoint serves the list by slug. Lists open via app deep links (`crave-search://favorites/lists/{slug}`) and web universal links (`https://<domain>/l/{slug}`) with an install CTA when the app isn't present. Share events (created/opened/copied/revoked) are tracked and wired to analytics. List-sharing is our primary intended virality surface, so deep-link routing and the web landing are launch-relevant.

A branded **"Share your bookmarks" infographic** generates a shareable image of a user's top 5–10 saved dish/restaurant pairs ("found through community recommendations using Crave").

## Social sharing and viral loop

A **Share Your Discovery** flow offers a pre-filled, user-editable template ("Just tried [dish] at [restaurant] — found through community recommendations…") with dynamic dish/restaurant insertion from recent saves, built-in gratitude, a location-targeted subreddit, and optimal-timing suggestions. Outbound links carry UTM attribution, content tags by entity, and geo tags for expansion insight; we log share completions and downstream discoveries, and track the viral coefficient (target >0.2 new users per active user) via share-completion and referral-signup rates.

A **referral-unlock escape hatch** lets users invite N friends to unlock as a non-monetary path past the Crave+ gate — tying social growth directly to monetization.

## Recognition (keep decoupled from ranking)

Light social recognition lives on the profile: discoverer/contributor badges for users who surface trending dishes early or contribute heavily, optional top-local-contributor leaderboards, and a "Track your impact" stat showing the influence of a user's contributions (polls that graduated, dishes they helped surface). The framing is profile identity as a "local food discoverer" — a retention lever. **None of this may touch the Crave Score ranking**, which is objective and global; recognition is a social flourish only and must never read as pay- or clout-to-rank.

## Open questions

- **Avatars** — do we build an in-app avatar picker/upload, or is the JWT-sourced avatar the permanent answer?
- **Recognition at launch** — do we ship any user-facing badges / "track your impact" / leaderboards for launch, and how do we keep them visibly decoupled from the objective ranking?
- **Private-list sharing** — when a user shares a private list, do we auto-toggle it public or block with a prompt?
- **Dish saves** — do dish list items require a real connection, or can a dish be saved without one?
- **Stat integrity** — are the user-stats counters guaranteed in lockstep by service hooks, or do we need a periodic reconciler to catch drift?
