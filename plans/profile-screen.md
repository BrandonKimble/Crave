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

## Data model (backend)

### User profile

- Add to `users`:
  - `username` (unique, required for public profile)
  - `display_name` (optional)
  - `avatar_url` (optional; can mirror Clerk)

### Followers / Following

- New `user_follows` table:
  - `follower_user_id`, `following_user_id`, `created_at`
  - Unique constraint: `(follower_user_id, following_user_id)`
  - Indexes: `follower_user_id`, `following_user_id`

### Favorites lists

- New `favorite_lists`:
  - `list_id`, `owner_user_id`, `name`, `description`
  - `list_type` enum: `restaurant` | `dish`
  - `visibility` enum: `public` | `private`
  - `item_count`, `updated_at`
  - Indexes: `owner_user_id`, `visibility`, `list_type`
- New `favorite_list_items`:
  - `item_id`, `list_id`, `added_by_user_id`
  - For **restaurant lists**: `restaurant_id`
  - For **dish lists**: `connection_id`, `restaurant_id`, `food_id`
  - `created_at`
  - Unique constraints to prevent duplicate items in a list.

### Poll tracking (already done)

- `polls.created_by_user_id`, `poll_topics.created_by_user_id`
- `poll_votes.user_id` index, `poll_options.added_by_user_id` index
- `user_events` entries: poll created / voted / option added

## API endpoints (backend)

### Profile / identity

- `GET /users/me` → include username, displayName, avatarUrl, counts.
- `PATCH /users/me` → update username, displayName, avatarUrl.
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
- `DELETE /favorites/lists/:listId`
- `GET /favorites/lists/:listId`
- `POST /favorites/lists/:listId/items`
- `DELETE /favorites/lists/:listId/items/:itemId`
- `GET /users/:userId/favorites/lists` (public only)

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

### Save sheet

- Replace current “favorite toggle” behavior with “Save to List” sheet.
- Always locked to list type (restaurant vs dish).
- New list creation inline (expandable 4x4 panel).

## Migration + rollout

- Add user profile fields + follower tables.
- Add favorites list tables + list item tables.
- Backfill: convert existing `user_favorites` to default lists (one per user per type).
  - Example: “My Restaurants” + “My Dishes”
- Update clients:
  - Save action opens list picker instead of toggling a single favorite.
  - Favorites screen becomes list grid.

## Open questions / decisions

- Do we expose `username` changes to users or lock to auto‑generated?
- Should we require both restaurant + dish for dish list items, or allow dish only?
- When a dish is saved without a connection, do we create a connection or block?
- How do we want to display list privacy in the UI (lock icon vs label)?
