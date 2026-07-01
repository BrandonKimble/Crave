# `product/` — Canonical Feature Vision

One file per area of the Crave app. Each file is the **current, canonical vision** for that area —
what we want it to be — not a backlog, log, or history.

- **`PRD.md` / `BRD.md`** (repo root) = the original v3 spec. Stale — superseded by these files. Don't cite them.
- **`plans/`** = concrete *execution* plans + migrations (technical, sequenced).
- **`product/`** (this folder) = the thin, current vision per area; `business/` holds the gating/monetization rationale.

## The rule (every file states it at the top)

- **Rolling canonical vision, not a changelog.** Keep each file thin and *current*: it describes only
  what we want the area to be today. If you follow it, you know exactly what we want.
- **Edit and delete in place.** When something changes, change the text — never append
  "superseded"/"old"/"previously" notes, status logs, or pointers to past ideas.
- **No provenance/status scaffolding.** Don't tag lines with sources or `shipped/idea/planned`. State
  the vision; if "today vs. wanted" matters, say it in a line of prose.
- **Read the area's file before building in it; update it as the vision changes.** Execution detail goes in `plans/`.

## Files

| File | Area |
|---|---|
| [favorites.md](favorites.md) | Favorites & lists (incl. the auto "All" list + cross-list intelligence) |
| [notifications.md](notifications.md) | Notifications & alerts (incl. quality "movement alerts") |
| [profile.md](profile.md) | User profile & social graph (usernames, followers, activity tabs) |
| [polls.md](polls.md) | Polls (creation, feed, discussion, graduation into the Score) |
| [restaurant-profile.md](restaurant-profile.md) | Restaurant detail page (dish list gate, discussion, score evidence) |
| [search-and-dishes.md](search-and-dishes.md) | Search, dish ranking + dish-level search, result sheet, filters |
| [map.md](map.md) | Map surface (LOD, markers, map-based UX ideas) |
| [scoring/](scoring/) | The Crave Score — what it means + how to tune the ranking when real data exists |

## Anchoring decisions (true across every area)

- **The Crave Score ranking is OBJECTIVE and global — never personalized to user taste.**
  Taste enters Crave only two ways: the user *searches* (e.g. "vegan"), or the user builds
  their own *favorites lists*. There is no preference-based re-ranking, ever.
- **Monetization is freemium.** Free = the objective restaurant ranking + restaurant search +
  map + open-now/price filters + poll voting/discussion. Paid (Crave+) = the **dish**
  intelligence layer (the hero), rising/momentum + trending, and power filter/sort on your
  own lists. See [`../business/monetization-and-gating.md`](../business/monetization-and-gating.md).
- **Gating principle:** gate what Google/Yelp/Beli structurally *can't* do; keep free the
  things they do (we just do them better — the free tier is the "this app is good" taste).
