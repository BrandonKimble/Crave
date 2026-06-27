# Favorites & Lists

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Favorites is the user's personal save layer: restaurant and dish lists, public/private visibility with shareable slugs, the save flow, and the list-detail view (which reuses the Search Results renderer). It is the primary "this is mine" surface in Crave. The Crave Score is objective and global — never personalized to taste — so lists carry no algorithmic personalization, just the user's own curation. Taste enters Crave only two ways: what the user searches, and what they save here.

## The two-sided list model

A parent toggle splits **Restaurants | Dishes**, mirroring the result-sheet split. A list is one type or the other — no mixed lists.

- **Restaurant lists (free):** lists that contain only restaurants — the normal saved-list behavior every app has.
- **Dish lists (Crave+):** lists of dishes, where a dish is always saved as a restaurant+dish pairing. This is "save your favorite dishes." The entire dish-list-creation side is gated behind Crave+ — free users make restaurant lists like a normal app. This is consistent with dishes being the paid hero across Crave (see `business/monetization-and-gating.md`).

The save flow is locked to content type: a restaurant card saves only into restaurant lists, a dish result only into dish lists. Every entity surface — search results, restaurant detail, dish rows — has a save/unsave affordance with a clear saved indicator.

## Favorites screen & list detail

The Favorites screen is all-white, a 2-column grid of cutout tiles. Each tile is a list-name heading plus 3–5 preview rows, and each preview row carries a Crave Score dot colored by the shared continuous score curve (restaurant lists color by restaurant score, dish lists by connection/dish score) — never a 3-tier threshold or local rank.

Tapping a list opens a detail screen that reuses the Search Results renderer (same rows, meta lines, frost background). List detail runs the list's items through the search query executor, so it inherits open-now and price filtering plumbing for free, and produces map-ready entities.

Lists, items, reordering, sharing, and list detail are built; the high-value frontier is the auto-"All" list, cross-list intelligence, and the Crave+ power filter/sort layer.

## Save flow & list management

- **Save Sheet** — a bottom sheet showing a list grid plus a "New list" placeholder tile that expands into a name / description / public-private / create panel. The same panel is reused for editing a list from the per-list ellipsis menu (Edit, Share, Make Private/Public, Delete).
- **Reordering** — both lists and items within a list are manually reorderable by position.
- **Per-item personal notes** — users can attach a note to a saved dish or restaurant ("get the spicy version", "great for groups").
- **Search within a list / across all saved** — find a spot inside a long list or across everything saved.
- **Quick actions on list rows** — order link, maps link, share — mirroring the result Quick Actions, so a list is actionable, not just a memory.
- **"Also worth trying" inside a list** — adjacency suggestions off saved items, kept objective and non-personalized (e.g. higher-scored nearby alternatives), never taste-modeled.

## The "All" list + cross-list intelligence

These are the prominent directions on top of the core.

- **Auto-"All" list pinned to the top** — a synthetic union view, always first on the Favorites page, that combines every list on the current axis (All-Restaurants and All-Dishes, following the Restaurants/Dishes toggle). It isn't a stored list; it's a union over the user's items.
- **Include/exclude (which-lists) toggle** — the "All" list is the *only* list with this toggle, because it's a meta-list (a list of lists). Opening it exposes a toggle to include/exclude specific source lists, with a sensible default set applied on open. Every other list gets the filter strip below but not this toggle.
- **Your best saved spot** — surface the single highest-Crave-Score saved restaurant (and top dish) spanning every list.
- **Compare lists** — side-by-side or overlay comparison of two lists (e.g. "Date Night" vs "Business Lunch") by score, overlap, neighborhood.
- **Map all saved at once** — plot every saved restaurant (across all lists, or the All view) on the map in one pass. This is the personal food map, grounded in real lists. Since list detail already produces map-ready entities, this is mostly aggregation.

## The per-list filter strip (Crave+ power layer)

Every list gets a filter/sort strip. The plain list stays free; the *power* of slicing and ranking a saved set is the Crave+ gate:

- **Sort by rank** (default)
- **Sort by rising** — the continuous heat-surge momentum axis: mentions arriving faster lately than a place's own baseline. ("Rising" is the working word; open to a better one.) This floats "what I saved that's heating up right now" to the top.
- **Open now**
- **Price**
- **Cuisine** — a maybe; leaning against it.

Best-near-me-now over a saved set lives here too. Restaurant lists stay broadly free; dish-list depth (dish-level momentum sort, dish score evidence inside list detail) leans paid, since dishes are the paid hero.

**Gating principle:** gate what Google/Yelp/Beli structurally can't do — cross-list intelligence, momentum sort over a personal set, dish-level depth. Keep free what they already do: a plain saved list, its creation, and its sharing.

## Sharing, virality & social

Lists are a primary growth surface. A public list with a slug is a shareable artifact that pulls new users in — the acquisition hook in a no-ad-budget freemium model. List creation and sharing stay free forever to protect this loop.

- **Public / private visibility** — public lists show on the owner's profile "Lists" tab and are reachable by share slug; private lists are owner-only. Lists are the user's curatorial identity.
- **Shareable via slug** — a short URL-safe slug per list with a share toggle and rotate/revoke. App deep link plus universal link; if the app isn't installed, a web landing with a CTA.
- **Share-event tracking** — created/opened/copied/revoked events to measure list virality.
- **"Share your bookmarks" infographic** — a branded infographic of a user's top 5–10 saved dish/restaurant pairs for social posting.
- **Share to community** — a pre-filled post template referencing the saved item and community.
- **Collaborative lists** — multiple contributors to one list (group trip planning, "our date-night list"). The item schema already carries `added_by_user_id`, which hints at this.

## Alerts on saved items

- **Trending-again alert for a saved dish** — "a dish you saved is getting a fresh wave of praise in your city," tying saves to the momentum axis.
- **New spot for a saved category** — "a highly-rated {category} just popped up near you," kept list-derived rather than taste-modeled.

## Copy & naming

The area is "Favorites," not "Bookmarks." Screen title leans on the list framing ("Saved dishes & spots"). Empty states: "Save dishes and restaurants you don't want to forget." App Store positioning uses the per-city angle: "Save your must-try dishes and build a personal list for every city" / "build a foodie hit list before a trip."

## Still to decide

- Is there a free cap on number of lists (with unlimited as a Crave+ unlock), or are lists uncapped for everyone?
- What is the default filter set for the auto-"All" list on open (e.g. open-now off, all source lists included, sorted by Crave Score desc)?
- Exactly which filter/sort controls are free vs Crave+ on a list — e.g. is open-now free since list detail already supports it, while rising/momentum sort is paid?
- Should sharing a private list auto-flip it to public, prompt, or block?
- For dish-list items saved without an existing connection: create a connection or block the save?
- Do per-item notes get shared when a public list is shared?
- Are collaborative/multi-contributor lists in scope, and what's the invite/permission model?
- Is "map all saved" its own entry point or a mode of the All list?
