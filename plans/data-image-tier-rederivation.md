# Data / Prewarm-Payload / Image Tier Rederivation

Mandated by the industry-frontier audit (`plans/industry-frontier-audit.md` items 1–4,
§1.2/1.3/1.4) under OA8 ("warm revisits are an OUTCOME engineered via retention").
Line-by-line read of the query layer, the three feed bypass paths, the prewarm signal,
and every image render site, 2026-08-08. All paths under
`/Users/brandonkimble/Crave/Crave/apps/mobile/` unless rooted. READ-ONLY pass; this file
is the ideal shape + gap + ordered plan. Nothing here is implemented.

---

## Part 0 — The census (what actually exists)

### 0.1 QueryClient

`App.tsx:71-88`: `new QueryClient({ mutationCache })` — the mutation failure chokepoint
only. **No `defaultOptions` at all.** Effective app-wide defaults are the library's:
`staleTime: 0`, `gcTime: 5min`, refetchOnMount/reconnect on. No
`persistQueryClient`, no dehydrate/hydrate anywhere (grep: zero hits for
`persistQueryClient|dehydrate|hydrate` outside node_modules). Deps: `@tanstack/react-query
^5.66.11`, `@react-native-async-storage/async-storage 2.2.0`, **no MMKV**, no
`@tanstack/react-query-persist-client`.

### 0.2 useQuery census — 28 read sites, 6 key families, ad-hoc staleTimes

Every `useQuery` in the tree (non-spec), with key shape and overrides:

| Site | Key | staleTime | gcTime |
|---|---|---|---|
| `src/components/ShareModalHost.tsx:155` | share targets | 60s | — |
| `src/components/photos/use-card-photo-strip.ts:61` | `['photoStrip', connectionId\|restaurantId]` | 60s | — |
| `src/hooks/use-favorite-heart.ts:75` | memberships | 20s | — |
| `src/hooks/use-user-lists.ts:16-37` (`createUserListsQueryOptions`) | user lists | 20s | — |
| `src/hooks/useAccess.ts:54` | access summary (user-scoped) | 60s | — |
| `src/hooks/useAccess.ts:78` | same key via `fetchQuery` | 0 (forced fresh) | — |
| `src/overlays/panels/profileSceneQueryOptions.ts:29-34` (`createProfileQueryOptions`) | `['user-profile', userId]` (F9805 user-scoped) | 60s | **10min — the ONLY gcTime override in the app** |
| — consumed at `ChildScenePanels.tsx:287,317`, `PollDetailPanel.tsx:641`, `runtime/use-poll-viewer-identity.ts:25`, `runtime/profile-panel-body-model-runtime.ts:45` | | | |
| `src/overlays/panels/RestaurantProfileViews.tsx:92,195,305,336` | gallery / mentions ×2 / memberships | 60s / 30s / 30s / 30s | — |
| `src/overlays/panels/ChildScenePanels.tsx:202` | blocks | 30s | — |
| `src/overlays/panels/UserProfilePanel.tsx:466` | other-user profile | 60s | — |
| `src/overlays/panels/PostPhotosPanel.tsx:104,177` | suggestions / dishes | 30s / 60s | — |
| `src/overlays/panels/ProfileSectionsBody.tsx:198-219` | profile polls/comments/lists/photos | 60s ×4 | — |
| `src/overlays/panels/ListDetailPanel.tsx:997,1169,1292,1326,1334,1533` | meta/results/collaborators 60s; me + listCities 300s | mixed | — |
| `src/overlays/panels/FollowListPanel.tsx:51` | list | 60s | — |
| `src/overlays/panels/MessagingPanels.tsx:123,130,306,315` | inbox/requests/conversation/messages | **0, deliberate** ("mount-once world: staleTime 0 ⇒ RQ refetches on RESUBSCRIBE", `:120-122`) | — |

Zero `prefetchQuery` calls in the app. Zero `initialData`-from-cache cross-key seeding
except `placeholderData: previous` at `RestaurantProfileViews.tsx:205`.

The staleTime spread (0/20s/30s/60s/300s) is per-author habit, not a policy. Every
entry evicts 5 minutes after its screen unmounts — **shorter than the track's own
retention window**, so a warm-looking revisit refetches behind the frozen body.

### 0.3 The three bypass paths (the app's biggest data — none in react-query)

1. **Polls feed.** `src/overlays/panels/runtime/polls-panel-feed-runtime.ts:57-60` —
   `useState<Poll[]>` + `usePollsFeedRuntimeController`
   (`polls-feed-runtime-controller.ts`, 639 lines: `fetchPolls` at `:319`/`:400`,
   socket.io live updates, §9.4 retry ladder, toggle engine, cursor pagination, bounds
   subscription). Component state, module-scoped orchestration; **dies on unmount and
   on process death**. Plainly: the polls feed never touches the query cache.
2. **Home feed.** `src/overlays/panels/HomePanel.tsx:410-470` — `refreshHomeFeed` →
   `fetchHomeFeed` (`src/services/home.ts:50`) → `useHomeFeedStore` (zustand, memory
   only), seq-guard + retry ladder. Same verdict: bypasses react-query entirely.
3. **Search worlds.** `src/screens/Search/runtime/shared/search-mounted-results-data-store.ts`
   — a bespoke module store holding the mounted world snapshot (results + coverage +
   precomputed marker projections, identity-keyed), written by the direct-search
   controller. This one is *deliberately* not a cache — it is the single mounted world
   (S1: coverage is a field of the world value). No disk tier behind it either.

Persistence in the whole app: zustand `persist` on `src/store/searchStore.ts:100-181`
(filters/tabs, AsyncStorage, versioned migrate) + onboarding. **The query cache and all
three feeds start from zero on every cold launch** — audit item 4 confirmed.

### 0.4 The axios layer and cacheability

`src/services/api.ts` (550 lines). Request interceptor `:341-371`: `Authorization:
Bearer`, `x-device-key`, `Accept-Language` defaulted from `getCurrentLocale()` unless
per-call override (`:363-366` — this is the seam `search-cache-locale.spec.ts` guards).
Consequence for a persistence tier: **cached payloads are (user × locale)-scoped** —
any disk cache buster must include both, exactly as the F9805 key-scoping lesson
already taught in-memory. Timeout 15s release / 120s dev; response interceptor routes
failures into the system-status/entitlement/session stores — a background revalidate
error already has a home (the banner), so silent SWR refresh needs no new failure UX.

### 0.5 Prewarm today

Trigger: nav press-DOWN → `requestTrackScenePrewarm` (SearchBottomNav). Decision:
`track-entry-prewarm.ts:34-38` `planScenePrewarm` — `mountResidentLeg` only for a
**not-yet-visited resident**; everything else `'none'`. It warms structure (chrome,
skeleton renderer, leg mount). It fetches **no data** and touches **no images**.
Child pushes are `'none'` by construction (contract `:371-374`: "no pre-commit window
(entry identity does not exist earlier)"). The same file also owns the honest press
span instrument (`press->first-paint` / `press->real-rows`) — the falsifier hook for
everything below already exists.

### 0.6 Image render census

- **expo-image (5 files):** `components/photos/PhotoStrip.tsx:140-142` (recyclingKey,
  `transition={180}`, `contentFit`), `overlays/panels/ListsPanel.tsx:148-150` (same
  trio), `RestaurantProfileViews.tsx:79` (gallery grid, contentFit only),
  `PostPhotosPanel.tsx:555`, `CameraCaptureHost.tsx`.
- **RN `Image` (legacy, 4+ files):** `ProfileSectionsBody.tsx:2`,
  `NotificationsPanel.tsx:3` (avatars), `PollCandidateBars.tsx:3`,
  `PollDetailPanel.tsx:212,1094` (comment + creator avatars).
- **Zero anywhere:** `priority`, `cachePolicy`, `placeholder`/`blurhash`,
  `Image.prefetch`, decode-ahead, memory budget config.
- Data side is better than the render side: the card strip loader
  (`use-card-photo-strip.ts:11-67`) coalesces every visible row into one
  `POST /photos/strips` per 16ms window and caches per entity for 60s. The URLs of the
  first screenful are therefore *known in one place at one moment* — the natural
  prefetch hook nobody uses yet.

**Census totals: 28 useQuery read sites (6 shared-key families), 3 react-query bypass
feeds, 0 prefetchQuery, 0 persisted query state, 5 expo-image files vs 4+ RN-Image
files, 0 image priority/cache/prefetch props.**

---

## Part 1 — DATA tier rederivation

### The norm
Three tiers: memory query cache paints instantly (SWR: stale render + silent
revalidate), disk hydration so cold launch paints last-known content, network behind
both. TanStack's own mobile guidance: raise staleTime/gcTime, add persistQueryClient.

### The ideal shape for THIS app (stated once)

**One policy module** — `src/services/query-cache-policy.ts` (law-stated-once, like
`profileSceneQueryOptions`): exported per-class constants + a typed `defaultOptions`
object App.tsx spreads in. Classes derived from the census, not invented:

| Class | Members (from census) | staleTime | gcTime | Why |
|---|---|---|---|---|
| ENTITY | profile, restaurant gallery/mentions, list meta/detail, photo strips | 60s | **24h** | Content changes slowly; the user-felt win is "back within the session never refetches visibly". |
| VIEWER-STATE | access, memberships, user lists, blocks | 20–60s (keep current) | 1h | Correctness-sensitive (gating, hearts); short stale is right, but eviction at 5min is pointless. |
| LIVE | messaging inbox/conversation | 0 (deliberate, keep) | 1h | The `:120-122` refetch-on-resubscribe contract is correct; don't break it — the policy module *names* this class so staleTime 0 reads as a decision, not an omission. |
| FEED | polls, home, (search excluded — see below) | 30s | 24h | Feeds ride their controllers (below); the cache is their retention + persistence substrate, not their orchestrator. |

Default = ENTITY values; VIEWER-STATE/LIVE opt down explicitly. This deletes ~20
scattered ad-hoc staleTimes into named imports.

**SWR vs OA8's frozen bodies — the layering rule, so the two never double-solve:**
the frozen last-good body (`lastGoodListRef`, `use-track-leg-resolver.tsx`) is the
*pixel* SWR: it owns what paints and when (the flip frame, the reveal law). react-query
is the *data* SWR: it owns what the parts hooks read and when the network runs. The
contract stays one-directional: **the track never waits on the query cache to paint,
and the query cache never drives paint timing** — fresher data arriving is just a
normal parts-hook re-render landing under already-warm chrome. Raising gcTime makes the
two layers *agree* (data stays warm as long as the entry does) instead of the current
lie (warm pixels over an evicted cache). No new mechanism needed; this is pure tuning.

**Persistence:** `@tanstack/react-query-persist-client` + async-storage persister
(AsyncStorage is already a dep; MMKV is an optional later upgrade, not a prerequisite —
the persister API is identical). Buster = `appVersion + locale + userId` (the §0.4
cacheability fact; PurchasesProvider already clears the cache on account switch — the
buster is the disk-side belt to that suspender). `maxAge: 24h`, throttled writes,
`shouldDehydrateQuery` allowlist: ENTITY + FEED keys only — never LIVE (messaging),
never access/entitlement state (must be re-proven each boot). What the user feels:
cold launch paints last-session profile/lists/strips content behind the splash instead
of skeletons everywhere.

**Feeds through the cache — the honest hybrid.** Rewriting the 639-line polls
controller (sockets, toggle engine, retry ladder, §9.4 single-ownership) as useQuery
would be a regression disguised as hygiene: react-query has no native story for
socket-pushed partial updates or the toggle seam choreography, and the controller IS
the single fetch owner by contract. The ideal shape keeps the controllers as
orchestrators and makes the cache their *storage*: the controller's fetch goes through
`queryClient.fetchQuery({ queryKey: pollsFeedKey(slice), queryFn })` (dedupe + cache
write for free) and publishes via the same setPolls path; on mount, the controller
seeds `setPolls` from `queryClient.getQueryData(pollsFeedKey)` before the first fetch
resolves. Home identically (`homeFeedKey(cityId)` — note home already keeps a stale
feed standing on failure, `HomePanel.tsx:462-464`; this extends that instinct across
launches). Search worlds stay OUT: the mounted-world store is an identity-committed
snapshot, not a cache, and persisting a stale world would fight the world-identity
commit rules for near-zero user value (search is always a fresh intent).

**The normalized-entity question (the Reddit rabbit-hole), answered from the census:
NO.** The evidence: only ONE payload is read under multiple keys today (getMe — and
F9805 already unified it into one shared key family), poll objects appear in exactly
two shapes (feed slice, detail) whose overlap is handled by the detail fetch anyway,
and restaurants/lists are read per-resource with no fan-out duplication. A normalized
id-keyed layer buys consistency across duplicated reads; this app has almost no
duplicated reads. The two real cross-shape consistency needs (vote counts feed↔detail,
list membership heart↔detail) are point fixes via `setQueryData`/invalidation in the
existing mutation sites — the app already has the mutation chokepoint to hang audits
on. Per-query caching + the policy module is enough; revisit only if a future social
layer multiplies entity fan-out.

### Gap summary
Largest structural gap of the audit, confirmed at line level: no defaults, 5-minute
eviction under an indefinite-retention UI, zero disk tier, and the three biggest
payloads never enter the cache at all.

---

## Part 2 — PREWARM PAYLOAD rederivation

### The norm
Press-intent prefetch fetches DATA (instant.page / Next Link / Instagram's press-down
profile prefetch), and images above the fold, not just view structure.

### The ideal shape

**A prewarm payload registry** beside the residency data the host already owns:
`sceneKey → prefetch(queryClient)` (one module, host-owned + data-driven — the same
two laws `track-entry-prewarm.ts:10-19` already states). The drain at the host calls
`planScenePrewarm` as today AND fires the registry entry via
`queryClient.prefetchQuery` (fire-and-forget; prefetchQuery never throws to the
caller, and a dedupe hit is free). Payloads: polls scene → current-slice feed key;
home → home feed key; profile → `createProfileQueryOptions(userId)`; favorites →
user-lists options. Because prewarm work is its own commit strictly before the flip
(law 2), and prefetchQuery is off-thread network, this cannot touch the one-frame
switch. Second consumer of the same registry: **idle warm** (audit 1.8) — one
InteractionManager-idle pass after boot touches each resident's entry so even FIRST
visits land data-warm.

**Image half of the payload:** when a prefetched feed/strip response is already in
cache, `Image.prefetch`/`ExpoImage.prefetch` the first-screenful URLs (the strip
loader's response shape gives them directly). No response cached yet → skip; never
fetch images speculatively over the network before the data tier has committed to the
list order.

**The G-PREWARM child-push challenge, resolved honestly.** The contract's "no
pre-commit window — entry identity does not exist earlier" (`:374`) is TRUE for
entries and IRRELEVANT for data: the tap target knows its id at press-down (a poll
card knows pollId, a list row knows listId), and a QUERY key needs no entry. So
child-push prewarm becomes `onPressIn → queryClient.prefetchQuery(detailKey(id))` on
the card row — cache-warming, not entry-warming. The entry still mints at push, still
mounts through the normal leg path, and finds its query fresh. The contract's ruling
stands as written (nothing entry-keyed to warm) while the user-felt gap it left
closes. The one discipline: press-in prefetch lives in the shared card-press hook per
surface, not scattered per call site (law 1's "no per-scene special case" extended
down one level).

### Gap summary
Trigger is frontier-grade, payload is empty. Everything above is additive wiring into
existing seams; zero choreography risk by the audit's own leverage argument (prewarm
touches a memo and now a cache — never the live list).

---

## Part 3 — IMAGE tier rederivation

### The norm
One library, explicit `cachePolicy` (memory+disk), `priority` per surface,
placeholder (blurhash/thumbhash) in the payload, prefetch tied to the same intent
signals as data, and reveal choreography owned by the app not the loader.

### The ideal shape

1. **One library.** expo-image everywhere (`~3.0.11` installed). Migrate the 4 RN
   `Image` files (`ProfileSectionsBody`, `NotificationsPanel`, `PollCandidateBars`,
   `PollDetailPanel:212,1094`) — avatars are exactly the recycled-small-image case
   expo-image's disk cache is for. Mechanical change.
2. **Policy stated once**, mirroring the data tier: a `CraveImage` wrapper (or a
   props-preset module) that bakes `cachePolicy="memory-disk"` + per-surface
   `priority`: list thumbnails/strips `normal`, offscreen/below-fold `low`, hero/
   detail `high`, avatars `low`. Today every site hand-rolls the same three props or
   none — same disease as the staleTime spread.
3. **Prefetch from the data tier.** Two hooks: (a) when a strip/feed response commits
   (the dataloader's `runBatch` resolution, `use-card-photo-strip.ts:31-47`, and the
   feed controllers' publish), prefetch the first-screenful card URLs; (b) the Part 2
   press-in/press-down payloads. Both go through one small `prefetchImages(urls,
   priority)` seam so the budget below has one throat.
4. **OA11 fade law implementation point.** "Images may fade only from the moment the
   skeleton drops" — the `transition={180}` sites currently fade whenever the bytes
   land, which is compliant *after* reveal but wrong if bytes land while the entry is
   still pre-reveal (frozen/skeleton phase). The correct implementation point is the
   reveal boundary the track already owns: the body components receive (or derive from
   the activity context) `isRevealed`; pre-reveal, render with `transition={0}` (paint
   complete images instantly into the hidden/frozen body), from reveal onward
   `transition={180}` covers late arrivals. One rule, applied in the wrapper from
   point 2, not per site.
5. **Blurhash: later, backend-gated.** Needs a column computed at upload in the images
   pipeline (`product/images.md` coordination). Until then expo-image's
   `placeholder` with a solid-tone fallback derived server-side is not worth a
   half-measure; the strip's existing quiet placeholder pane (`PhotoStrip.tsx:54,108`)
   is an acceptable interim and already matches the skeleton language.
6. **Memory budget realities.** Current scale (strips of card-sized variants, ~a
   screenful × K=3 retained entries worth of URLs) is well inside expo-image's default
   memory cache; the risk is only the prefetch seam — cap prefetch to the first
   screenful (≤ ~12 URLs per event) and always `low`/`normal` priority so visible
   loads win. No custom budget config until a measured problem exists.

### Gap summary
MISSING tier confirmed: the app has a good image *data* layer (batched strips) and no
image *pipeline* — no cache policy, no priority, no prefetch, split libraries.

---

## Part 4 — Ordered implementation plan

Each item: falsifier (how it can show RED) + user-felt delta. Order = leverage/risk.

**1. Cache policy module + QueryClient defaults** (S — hours).
`query-cache-policy.ts`, `defaultOptions` in App.tsx, replace the ~20 ad-hoc
staleTimes with named class imports; messaging keeps staleTime 0 via the named LIVE
class. *Falsifier:* instrument a revisit inside the retention window — before: network
request fires (proxy log / RQ devtools fetchStatus); after: zero requests within
staleTime, cache entry alive at +30min. If no request count changes, the change did
nothing — RED. *User-felt:* returning to profile/lists/restaurant within a session
stops flashing refreshed content and stops burning radio; frozen bodies are backed by
live data instead of an evicted cache.

**2. Prewarm payload registry + idle warm** (S/M — a day).
Registry + drain wiring + InteractionManager idle pass. *Falsifier:* the existing
`[PERF] press` span — `press->real-rows` on a FIRST visit to a resident must drop
measurably when the press was held (prewarm window used) vs a fast tap; and the
registry test: with prefetch disabled, span reverts. An unchanged span = RED.
*User-felt:* the owner's exact ask — first visit to a tab shows content, not skeleton,
when the finger lingered even ~100ms.

**3. Press-in child prefetch (polls first)** (S — half day per surface).
`onPressIn → prefetchQuery(pollDetailKey(id))` in the shared card press path.
*Falsifier:* poll-detail's time-to-content with press-in prefetch on vs off (the
detail panel logs its query settle); no delta = RED. *User-felt:* poll detail opens
populated instead of loading.

**4. Image policy wrapper + RN Image migration + reveal-gated transition** (M — a day).
CraveImage preset (cachePolicy/priority/OA11 transition rule), migrate 4 RN-Image
files. *Falsifier:* relaunch the app offline after browsing — avatars/thumbnails that
were seen must paint from disk (today: blank). Blank = RED. Reveal law: a screen
recording of a revisit must show zero mid-frozen-body fades. *User-felt:* avatars stop
popping in on every scroll; second sessions show photos instantly.

**5. Feed-response image prefetch** (S — half day). Hook `prefetchImages` to strip
batch resolution + feed publishes. *Falsifier:* scroll a fresh feed — first-screenful
images must be cache hits (expo-image emits load-source; assert `disk|memory` not
`network` for row 0–5). *User-felt:* cards arrive with photos, not photo-pop.

**6. Query persistence (disk tier)** (M — a day incl. verification).
persist-client + AsyncStorage persister, buster `appVersion+locale+userId`, dehydrate
allowlist (ENTITY+FEED, never LIVE/access). *Falsifier:* kill the process, relaunch in
airplane mode — allowlisted surfaces paint last-known content; access/messaging do
NOT. Blank allowlisted surface = RED; painted access state = RED the other way.
*User-felt:* cold launch resumes where the app left off instead of skeleton city.

**7. Feeds through the cache (fetchQuery hybrid)** (M — a day each for polls/home).
Controller fetches via `fetchQuery`, seeds from `getQueryData` at mount; prerequisite
for their persistence (item 6's FEED class only pays off after this). *Falsifier:*
toggle away/back across a remount — feed paints from cache before network settles
(controller logs seed-hit); and the §9.4 ladder tests still pass unchanged (the
controller remains the single fetch owner — any second fetch owner appearing = RED).
*User-felt:* polls/home tab return and cold launch paint the last feed instantly.

**8. Blurhash column + placeholder** (L — backend + pipeline; sequence with
`product/images.md`). *Falsifier:* cold-cache feed scroll shows shaped color
placeholders, never white rectangles. *User-felt:* Instagram-grade image arrival.

Explicitly NOT planned: normalized entity cache (Part 1 verdict — census doesn't
justify it), search-world persistence (fights world identity), rewriting feed
controllers as useQuery (regression risk for zero user delta).

---

## Part 5 — The recommended first slice

**Item 1 alone: the policy module + QueryClient defaults.** Highest leverage-to-risk
in the whole plan: it is configuration on a layer the track deliberately never waits
on (the audit's own leverage argument — frozen bodies + skeleton are total, so tuning
react-query has zero choreography surface), it touches no controller, no image, no
native code, and it converts the app's single largest structural gap (retention-length
UI over a 5-minute cache) into agreement between the two layers. Honest size: ~3–5
hours including the falsifier run (request-count instrumentation on two revisit
paths) and the messaging LIVE-class regression check. Items 2+3 are the natural second
slice (they reuse the registry) once 1's falsifier is green.
