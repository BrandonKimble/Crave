# Favorites & Lists

> **Rolling canonical vision — not a changelog.** Keep this file thin and _current_: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

Favorites is the user's personal save layer: restaurant and dish lists, public/private visibility with shareable slugs, the save flow, and the list-detail view (which reuses the Search Results renderer). It is the primary "this is mine" surface in Crave. The Crave Score is objective and global — never personalized to taste — so lists carry no algorithmic personalization, just the user's own curation. Taste enters Crave three ways, all user-authored (never algorithmically inferred, so the objective Score stays pure): what the user searches, what they save here, and how they rank what they save (custom sort).

## The two-sided list model

A parent toggle splits **Restaurants | Dishes**, mirroring the result-sheet split. A list is one type or the other — no mixed lists.

- **Restaurant lists (free):** lists that contain only restaurants — the normal saved-list behavior every app has.
- **Dish lists (Crave+):** lists of dishes, where a dish is always saved as a restaurant+dish pairing. This is "save your favorite dishes." The entire dish-list-creation side is gated behind Crave+ — free users make restaurant lists like a normal app. This is consistent with dishes being the paid hero across Crave (see `business/monetization-and-gating.md`).

The save flow is locked to content type: a restaurant card saves only into restaurant lists, a dish result only into dish lists. Every entity surface — search results, restaurant detail, dish rows — has a save/unsave affordance with a clear saved indicator.

## Favorites screen & list detail

The Favorites screen is all-white, a 2-column grid of cutout tiles. Each tile is a list-name heading plus 3–5 preview rows, and each preview row carries a Crave Score dot colored by the shared continuous score curve (restaurant lists color by restaurant score, dish lists by connection/dish score) — never a 3-tier threshold or local rank.

Tapping a list opens a detail screen that reuses the Search Results renderer (same rows, meta lines, frost background). List detail runs the list's items through the search query executor, so it inherits open-now and price filtering plumbing for free, and produces map-ready entities. Item rows carry the shared **FriendCluster** (stacked avatars + "Saved by {name} and others") when people you follow have also saved that spot/dish — same overlay as the result sheet (see `profile.md`).

Lists, items, reordering, sharing, and list detail are built; the high-value frontier is the auto-"All" list, cross-list intelligence, custom ranking, and the Crave+ filter layer (sort, including custom ranking, stays free).

## Save flow & list management

- **Save Sheet** — a bottom sheet showing a list grid plus a "New list" placeholder tile that expands into a name / description / public-private / create panel. The same panel is reused for editing a list from the per-list ellipsis menu (Edit, Share, Make Private/Public, Delete).
- **List configuration (the ⋯ ellipsis, Spotify-playlist-like)** — inside a list, an ellipsis opens the list's configuration surface: make public/private, edit name/details, share, and (future) download for offline. Modeled on Spotify's playlist config, including possibly its two distinct knobs: _private_ (only you and invitees can see it) vs _remove from profile_ (public by link but not displayed on your profile) — whether we keep that distinction or collapse to one toggle is still to decide. Expect this cluster to grow; the list page is the app's most involved surface.
- **Add places from inside a list** — an "add places" button opens search mode in **pick mode**: selecting a result adds it to the list and returns you to the list — no search flow, no page switch. Same search UI, different selection consequence.
- **Offline lists (future)** — download a list (and its map region — see `map.md`) for offline use, e.g. travel.
- **Reordering** — both lists and items within a list are manually reorderable by position.
- **Per-item personal notes** — users can attach a note to a saved dish or restaurant ("get the spicy version", "great for groups").
- **Search within a list / across all saved** — find a spot inside a long list or across everything saved.
- **Quick actions on list rows** — order link, maps link, share — mirroring the result Quick Actions, so a list is actionable, not just a memory.
- **"Also worth trying" inside a list** — adjacency suggestions off saved items, kept objective and non-personalized (e.g. higher-scored nearby alternatives), never taste-modeled.

## Home controls (the list of lists)

The home favorites page is built on the shared toggle-strip primitive (the same frost/cutout/scroll strip as the result sheet), with three orthogonal controls:

- **Restaurants | Dishes** — the structural parent toggle; switches which kind of lists you see.
- **Sort** — a dropdown: **Recently updated** (default) and **Custom** (your hand-dragged order).
- **All / Mine / Shared** — a one-tap, mutually-exclusive _filter_ over who made the list. Shared lists from friends land in your favorites, so this separates yours from theirs. It hides to a subset (a filter), which is why it's its own control and not a sort.

**Custom (drag) ordering works on the home too**, identical to within a list — you drag your lists into the order you want, and that becomes the **sticky default** once set, so the home stops reshuffling. "Recently updated" is just the churn-y starting default for someone who hasn't ordered yet: a list jumps to the top each time you save into it, so the home reshuffles under you until you impose a custom order.

## The "All" list + cross-list intelligence

These are the prominent directions on top of the core.

- **Auto-"All" list pinned to the top** — a synthetic union view, always first on the Favorites page, that combines every list on the current axis (All-Restaurants and All-Dishes, following the Restaurants/Dishes toggle). It isn't a stored list; it's a union over the user's items.
- **Include/exclude (which-lists) toggle** — the "All" list is the _only_ list with this toggle, because it's a meta-list (a list of lists). Opening it exposes a toggle to include/exclude specific source lists, with a sensible default set applied on open. Every other list gets the filter strip below but not this toggle.
- **Your best saved spot** — surface the single highest-Crave-Score saved restaurant (and top dish) spanning every list.
- **Compare lists** — side-by-side or overlay comparison of two lists (e.g. "Date Night" vs "Business Lunch") by score, overlap, neighborhood.
- **Map all saved at once** — plot every saved restaurant (across all lists, or the All view) on the map in one pass. This is the personal food map, grounded in real lists. Since list detail already produces map-ready entities, this is mostly aggregation.

## Per-list controls: sort (free) vs filters (Crave+)

Every list has a **sort dropdown** (a dropdown toggle, like the result-sheet price control) plus **filter toggles**. The line is: **sort your list however you want, free; filter/slice it, paid.**

**Sort — free.** Reordering the same set is free, partly because one of the options is the user's own shareable ranking.

- **Best** (default) — Crave Score order.
- **Rising** — the continuous heat-surge axis: mentions arriving faster lately than a place's own baseline. ("Rising" is the working word; open to a better one.)
- **Recently added** — by save date.
- **Custom** — the user's hand-ranking (see _Custom ranking_ below).

**Filters — Crave+.** Slicing the set down is the paid power layer:

- **Open now**
- **Price**
- **Cuisine** — a maybe; leaning against it.
- Best-near-me-now over a saved set lives here too.

Filtering a _saved set_ is gated even though open-now and price are free on the main search — that's intentional: we match Google on search (free), and the part Google can't do (filter your saved lists) is the Crave+ layer. Dish-list depth (dish-level scores/evidence inside a list) is also Crave+, since dishes are the paid hero. A plain saved list — its creation, sorting, and sharing — stays free.

**Custom ranking (the reorder).** Picking _Custom_ turns on an edit mode that orders items into the user's own order, persisted (the `position` column already backs it). Reorder is **drag-and-drop**, made safe against the movable sheet by the mode itself: entering edit **locks the sheet to full height** (its pan is disabled) and a drag _handle_ is the sole activator, so the sheet and list-scroll yield to the drag. The home's 2-column grid **linearizes to a single column in edit mode**, so it's the same simple 1-D drag as a list. The identical mechanism powers both within-a-list (rank your spots/dishes) and the home (order your lists). A non-drag path (move up/down · move-to-top) ships alongside — an accessibility requirement (WCAG 2.2 §2.5.7), not optional. Custom stays free — it's the personalization/shareability engine (below), not a power filter.

## Sharing, virality & social

Lists are a primary growth surface. A public list with a slug is a shareable artifact that pulls new users in — the acquisition hook in a no-ad-budget freemium model. List creation and sharing stay free forever to protect this loop.

**Custom ranking is the social/personalization axis.** The Crave Score is crowd consensus; a user's _custom-ranked_ list is their personal opinion laid over it — the second axis the app otherwise lacks, and the seed of the friend graph. A ranked "my top 10 tacos in Austin" is a far more shareable artifact than an unordered save pile, and following a friend means browsing their ranked lists for trusted, taste-curated picks rather than only the crowd. When viewing anyone's custom-ranked list, the _order_ is their opinion while each row still shows the objective Crave Score dot — "their take vs. the canonical truth," side by side — and personal rank is always visually distinct from the Crave Score so the two never blur. (Friend-graph features — following, friends' picks on a place, your-circle's-consensus — live in `profile.md`.)

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
- Final wording for the recency sorts ("Recently added" for items, "Recently updated" for lists) — working labels, not locked.
- Should sharing a private list auto-flip it to public, prompt, or block?
- For dish-list items saved without an existing connection: create a connection or block the save?
- Do per-item notes get shared when a public list is shared?
- Are collaborative/multi-contributor lists in scope, and what's the invite/permission model?
- Is "map all saved" its own entry point or a mode of the All list?
- List privacy semantics: keep Spotify's _private_ vs _remove-from-profile_ as two separate knobs, or collapse to one public/private toggle?
- The "post to profile" analog: how do lists (the poll-posting analog) land on the profile — auto via public visibility (the Spotify model, current lean) or an explicit publish step?

## Save funnel toolkit + tried/haven't-tried (owner, 2026-07-09)

- Saving = CURATING: the save sheet + create-list page carry the toolkit —
  add photo (opt-in button, never a prompt), a note field (notes make shared
  lists feel authored — lists are a virality surface), and tags (schema now,
  UI fast-follow; tags become toggle-strip filters on lists). See
  product/images.md + plans/page-registry.md §6 for the funnel shape.
- List-card photo strips: scrollable L-R; owner/COLLABORATORS see a "+" add
  tile prepended to the strip; plain viewers never do.
- Dish-side status axis: **tried / haven't tried** (copy TBD) — the analog
  of the restaurant side's been/want-to-go.

## CORRECTION (owner, 2026-07-10 — registry §7.5/§7.6 is the authority)

- Save-sheet toolkit = NOTE + TAGS inline (Google-copy). NO add-photo
  button on the save sheet (superseding the 2026-07-09 note above).
  Photos enter via the card "+" tile on own-list cards only.
- listDetail: "Add places" (restaurant lists) / "Add dish" (dish lists,
  copy TBD) → search mode → immediate add, no toolkit detour. Dish-add
  search shape (dish-scoped vs restaurant-first) = A/B at build.
