---
name: profile-screen
description: Profile screen, user activity, followers, and favorites lists
---

# Plan

Design and implement a profile screen that surfaces poll activity, favorites lists, and social signals (followers/following). Tie backend tracking to frontend UI in a scalable, Instagram/Twitter‑style layout with clear counts and segmented sections.

## Goals

- Provide a complete Profile screen with username, settings access, and a stats row.
- Expose poll activity: created polls, contributed polls, and participation details.
- Replace “Bookmarks” with a Favorites system that supports public/private lists.
- Introduce followers/following and “Follow” actions for public profiles.
- Provide a production‑ready username system (availability, moderation, and onboarding).
- Support shareable favorites lists and list management actions (edit/share/delete).
- Keep navigation consistent (profile includes app nav bar).

## UX direction (mobile)

### Profile top area

- **Header**: avatar, display name, @username, settings icon.
- **Stats row** (Instagram‑style): `Polls Created`, `Polls Contributed`, `Followers`, `Following`.
  - Tappable counts to jump to their respective sections.
- **Primary action**: `Edit profile` (self) or `Follow` (others).

### Profile body (segmented selector)

Segmented control with three tabs:

1. **Created**: Polls created by the user.
2. **Contributed**: Polls where user voted or added an option.
3. **Lists**: Public favorites lists.

### Favorites / Lists screen

- Replace “Bookmarks” with **Favorites**.
- **All‑white layout**, grid of two cards per row.
- Each card is a **cutout tile** showing:
  - A heading under the tile (list name).
  - Inside the tile: 3–5 preview rows with dot + name.
  - Dot color = rank color (derived from quality/rank score).
- **Segmented toggle** at top: `Restaurants` | `Dishes`.
  - Restaurant tiles show restaurant name.
  - Dish tiles show dish name + restaurant name.
- Public lists are visible to others; private lists only visible to owner.
- Each tile has an **ellipsis menu** with `Edit`, `Share`, `Make Private/Public`, `Delete`.
- Tapping a tile opens a **List Detail** screen that mirrors Search Results:
  - Uses the shared overlay style + frost background.
  - Same layout, spacing, and meta lines as Search Results.
  - No search toggles; the list type (restaurant/dish) is fixed.
  - Top bar shows list title, with `Share` + `…` actions.
  - Uses the same item rows as Search Results (including meta rows).
  - Edit behavior in List Detail: title/description switch to text inputs with a `Save` button.

### Save flow (new list‑based save)

- Tapping “save” opens **Save Sheet** (bottom sheet).
- The Save Sheet is **locked** to the content type:
  - From restaurant card → Restaurants lists only.
  - From dish result → Dish lists only.
- Sheet shows a list grid like Favorites + a **“New list”** placeholder tile.
  - Tapping “New list” expands into a **4x4 panel** with:
    - List name
    - Description
    - Public/Private toggle
    - Create button
  - On create, panel collapses into the standard tile.
  - Editing a list from the ellipsis in Favorites uses the **same 4x4 expand** panel
    (pre-filled values + Save action).

### Username onboarding

- Add a username step in onboarding (after auth):
  - Input + live validation + availability.
  - Suggestions when taken/invalid.
  - Clear copy + examples.

## Schema changes (required)

### Users

- Add to `users`:
  - `username` (`citext`, unique; case‑insensitive handles @handle clashes).
  - `display_name` (`varchar`, optional).
  - `avatar_url` (`varchar`, optional).
  - `username_updated_at` (`timestamptz`, for cooldown rules).
  - `username_status` (enum: `unset` | `pending` | `active`), optional if we want a staged flow.
- New `reserved_usernames` table:
  - `username` (`citext`, unique), `reason`, `created_at`.
- New `username_history` table (audit + anti‑squatting):
  - `user_id`, `username`, `created_at`.
  - Unique: `(user_id, username)`, index on `username`.

### Followers / Following

- New `user_follows` table:
  - `follower_user_id`, `following_user_id`, `created_at`.
  - Unique constraint: `(follower_user_id, following_user_id)`.
  - Check constraint: `follower_user_id != following_user_id`.
  - Indexes: `follower_user_id`, `following_user_id`.

### Favorites lists

- New enums:
  - `FavoriteListType`: `restaurant` | `dish`.
  - `FavoriteListVisibility`: `public` | `private`.
- New `favorite_lists` table:
  - `list_id`, `owner_user_id`, `name`, `description`.
  - `list_type`, `visibility`.
  - `item_count` (denormalized), `created_at`, `updated_at`.
  - `position` (for reorder), `share_slug` (public URL), `share_enabled`.
  - Indexes: `owner_user_id`, `visibility`, `list_type`, `updated_at`.
  - Optional unique constraint to prevent dupes per user: `(owner_user_id, list_type, name)`.
- New `favorite_list_items` table:
  - `item_id`, `list_id`, `added_by_user_id`, `created_at`.
  - Restaurant list items: `restaurant_id` (FK to `entities`).
  - Dish list items: `connection_id` (FK to `connections`).
  - `position` (order inside list).
  - Unique constraints: `(list_id, restaurant_id)` and `(list_id, connection_id)`.
  - Check constraint: exactly one of `restaurant_id` or `connection_id` is set.

### User stats

- New `user_stats` table (1 row per user):
  - `user_id` (PK), `polls_created_count`, `polls_contributed_count`
  - `followers_count`, `following_count`
  - `favorite_lists_count`, `favorites_total_count`
  - `updated_at`
- Updated by service hooks (polls, votes, list changes, follows).

### Poll tracking (already done)

- `polls.created_by_user_id`, `poll_topics.created_by_user_id`.
- `poll_votes.user_id` index, `poll_options.added_by_user_id` index.
- `user_events` entries: poll created / voted / option added.

### Deprecations / backfill

- Migrate `user_favorites` into default lists:
  - `My Restaurants` (type `restaurant`) + `My Dishes` (type `dish`).
  - Insert list items per favorite and then deprecate or drop `user_favorites`.

## API endpoints (backend)

### Profile / identity

- `GET /users/me` → include username, displayName, avatarUrl, counts.
- `PATCH /users/me` → update username, displayName, avatarUrl.
- `GET /users/username/check?username=...` → availability + reason.
- `POST /users/username/claim` → set username (runs moderation).
- `POST /users/username/suggest` → provide suggestions (optional).
- `GET /users/:userId/profile` → public profile + public lists.
- `GET /users/:userId/followers`, `GET /users/:userId/following`.
- `POST /users/:userId/follow`, `DELETE /users/:userId/follow`.

### Poll activity

- `GET /polls/me?activity=created|voted|option_added|participated`
  - Already implemented; wire to profile tabs.

### Favorites lists

- `GET /favorites/lists?type=restaurant|dish&visibility=public|private`
- `POST /favorites/lists`
- `PATCH /favorites/lists/:listId` (name/description/visibility)
- `PATCH /favorites/lists/:listId/position` (reorder)
- `POST /favorites/lists/:listId/share` (enable or rotate slug)
- `DELETE /favorites/lists/:listId/share` (disable share)
- `DELETE /favorites/lists/:listId`
- `GET /favorites/lists/:listId`
- `POST /favorites/lists/:listId/items`
- `PATCH /favorites/lists/:listId/items/:itemId` (reorder)
- `DELETE /favorites/lists/:listId/items/:itemId`
- `GET /users/:userId/favorites/lists` (public only)
- `GET /favorites/lists/share/:shareSlug` (public share page)

## Rank color mapping (frontend)

- Restaurant lists: use `restaurant_quality_score` or `display_rank_scores` for the entity’s coverage key.
- Dish lists: use `connection.food_quality_score` or `display_rank_scores` (subject_type = connection).
- Map score to 3‑tier color (e.g., emerald / amber / slate).

## Frontend wiring (mobile)

### Profile screen

- Replace placeholder `ProfileScreen` with:
  - Header block
  - Stats row
  - Segmented control (Created, Contributed, Lists)
  - Card list for polls and list grid for favorites
- Add navigation links to Followers/Following screens.

### Polls list in profile

- Reuse poll card styles from `PollsOverlay`, adjusted for full screen.
- Add “Contributed” badge (voted/option added) when applicable.

### Favorites screen

- Replace `BookmarksOverlay` with a dedicated `FavoritesScreen`.
- White background + 2‑column grid layout.
- Implement segmented toggle for Restaurants/Dishes.
- Add ellipsis menu per list: Edit, Share, Delete.
- Add List Detail screen with Search Results UI parity (no toggles).
- Use shared overlay + frost background for Favorites, List Detail, and Save Sheet.

### Username onboarding

- Add a username step in onboarding (after auth).
- Debounced availability check + moderation feedback.
- Show suggestions when taken or invalid.
- Enforce cooldown rule when editing.

### Save sheet

- Replace current “favorite toggle” behavior with “Save to List” sheet.
- Always locked to list type (restaurant vs dish).
- New list creation inline (expandable 4x4 panel).

## Migration + rollout

- Add user profile fields + follower tables.
- Add favorites list tables + list item tables.
- Add reserved usernames + username history.
- Add user stats table and service hooks.
- Backfill: convert existing `user_favorites` to default lists (one per user per type).
  - Example: “My Restaurants” + “My Dishes”
- Update clients:
  - Save action opens list picker instead of toggling a single favorite.
  - Favorites screen becomes list grid.
  - Onboarding adds username step with availability + moderation feedback.
  - Share sheet uses generated share URL (slug) and system share sheet.

## Open questions / decisions

- Do we expose `username` changes to users or lock to auto‑generated?
- Should we require both restaurant + dish for dish list items, or allow dish only?
- When a dish is saved without a connection, do we create a connection or block?
- How do we want to display list privacy in the UI (lock icon vs label)?
- Username moderation provider: Google Perspective, Cloud Content Safety, or internal regex + denylist?
- Should sharing a private list auto-toggle to public, or block with a prompt?
- Should we keep `user_favorites` as a legacy view or fully remove it?

## Username rules + moderation

### Validation rules (client + server)

- Length: 3–20 characters.
- Allowed chars: lowercase letters, numbers, underscore, dot.
- Must start with a letter.
- No trailing dot/underscore.
- No consecutive dots or underscores.
- Disallow numeric-only usernames.
- Normalize: trim, lowercase, collapse whitespace to empty (reject).
- Regex (example): `^[a-z][a-z0-9]*([._]?[a-z0-9]+)*$`

### Reserved / blocked

- Block list (examples; keep in `reserved_usernames`):
  - `admin`, `support`, `help`, `root`, `system`, `staff`, `moderator`, `crave`,
    `cravesearch`, `crave-search`, `api`, `status`, `security`, `billing`.
- Block app routes / keywords:
  - `login`, `signup`, `profile`, `settings`, `favorites`, `lists`, `polls`,
    `search`, `about`, `terms`, `privacy`, `jobs`.
- Block impersonation patterns:
  - `official`, `team`, `real`, `verified`, `staff`.
- Maintain profanity list (library or curated list; stored in DB or config).

### Availability endpoint behavior

- Returns: `available`, `reason`, `suggestions[]`.
- Reasons: `taken`, `reserved`, `invalid_format`, `too_short`, `too_long`,
  `blocked_word`, `profanity`, `rate_limited`.
- Suggestions: 3–5 options (append digits, city, year, or word fragments).

### Moderation pipeline (best practice)

- Step 1: Local validation (format + length + regex).
- Step 2: Reserved/profanity checks (DB + config list).
- Step 3: Uniqueness check (users + username_history).
- Step 4: Optional external moderation:
  - Use a safety API (Google Perspective or Cloud Content Safety) to detect
    toxicity/hate/harassment in the username.
  - If flagged, reject with `blocked_word` or `profanity` reason.
- On success:
  - Set `username`, `username_status=active`, `username_updated_at=now()`.
  - Insert into `username_history`.
- Cooldown:
  - Enforce edit cooldown (e.g., 30–90 days) via `username_updated_at`.
  - Allow one-time initial set without cooldown.

## Share‑link spec (favorites lists)

### Share slug

- `share_slug`: short, URL‑safe token (e.g., NanoID/base62, 10–12 chars).
- Stored on `favorite_lists` with `share_enabled`.
- Uniqueness enforced (unique index on `share_slug`).

### Share URLs / deep links

- App deep link: `crave-search://favorites/lists/{shareSlug}`.
- Universal link (public web landing): `https://<app-domain>/l/{shareSlug}`.
- Mobile handling:
  - If app installed, open list detail.
  - If not, open web landing with CTA.

### Rotation + revoke

- `POST /favorites/lists/:listId/share`:
  - If `share_slug` exists and `share_enabled`, reuse.
  - If `rotate=true`, generate new slug and invalidate old one.
- `DELETE /favorites/lists/:listId/share`:
  - Sets `share_enabled=false` (slug remains for audit but is inactive).

### Tracking

- Track share creation + opens:
  - `favorite_list_share_events` table:
    - `event_id`, `list_id`, `share_slug`, `event_type`, `created_at`.
    - `event_type`: `created`, `opened`, `copied`, `revoked`.
  - Or use `user_events` with `event_type=share_*` (simpler).

## Onboarding flows + copy

### New user onboarding (username step)

- Title: `Pick your username`
- Helper: `This is how people find you. You can change it later.`
- Input placeholder: `@yourname`
- Inline rules: `3–20 characters, letters/numbers/._`
- Actions:
  - Primary: `Continue`
  - Secondary: `Skip for now` (optional if we allow unset usernames)
- Validation copy:
  - Taken: `That username is taken.`
  - Invalid: `Use letters, numbers, dots, or underscores.`
  - Profanity/blocked: `Please choose a different username.`
- Suggestions label: `Try one of these:`

### Username edit (settings)

- Title: `Change username`
- Helper: `You can change this every 30 days.`
- Primary: `Save`
- Secondary: `Cancel`
- Error copy mirrors onboarding.
