# W4 research — the share package (rich share cards / story exports)

Status: RESEARCH ONLY (registry run W4.5, 2026-07-11). No code. Follows the
W3 universal ShareModal ship (98a4f134) and registry §8.2's "research pass
owed on each platform API." Honesty rule: platform-API claims below are from
training knowledge (cutoff ~Jan 2026) and are flagged where they must be
re-verified against current docs before build — these APIs churn.

## 1. What a "share package" is for Crave

The share package is the rendered artifact a recipient sees — today it's the
crude-real v1 (title + subtitle + best-effort image) resolved by
`apps/api/src/modules/messaging/share-package-resolver.service.ts`. The
target shapes, per object kind:

- **Dish card** — dish name + restaurant, the Crave Score (colored by the
  shared score-bucket palette), the lead photo from its strip, "on Crave"
  branding + get-the-app CTA. The hero artifact: "this specific dish is a 9.4."
- **Restaurant card** — name, city, Crave Score, top-3 dishes as mini rows,
  a photo. The "is this place good" answer as an image.
- **List card** — list name, owner @handle, item count, top ~5 ranked rows
  (rank number + name + score dot). The ranked-list infographic is the
  virality artifact the product docs have wanted all along
  (product/favorites.md "Share your bookmarks" infographic).
- **Poll result card** — question + top-3 leaderboard bars w/ counts;
  "results are in" framing. Live polls share as "vote now" instead.
- **Comment / profile** — lower priority; comment stays DM-only (no public
  link, by design in share-modal-store), profile card = avatar + @handle +
  stats.

Each package needs THREE renderings from one design: (a) an in-app preview /
DM bubble (React components — exists crudely), (b) a static image export
(square-ish for feeds/messages + 9:16 for stories), (c) an OG/link-preview
image for the web landing.

## 2. What the backend already has

- `SharePackageResolverService` (messaging module): `(kind, id, viewer) →
{title, subtitle, imageUrl} | unavailable`, with visibility enforced at
  resolve time (private lists, deleted comments, blocked pairs). Three
  consumers by design: DM bubbles, the share modal preview, the /l/{slug}
  landing. This is the correct single seam to grow: extend the DTO with the
  package fields (score, ranked rows, photo set) rather than adding a second
  resolver.
- Link vocabulary (desire-url-codec, ONE codec): `/l/<shareSlug>` (lists,
  `?join=1` collaborator invite), `/r/<restaurantId>` (restaurant),
  `/p/<pollId>?market=…` (poll), plus entity-action links for dishes and
  `userProfile` pushes. `SHARE_BASE_URL` defaults to `https://crave-search.app`.
- Universal ShareModal (W3): send-in-app fan-out over closeness-ranked
  targets, copy-link, OS share sheet. The package preview is where the
  beauty pass lands.
- Photos: Cloudinary-backed UGC with ready CDN URLs on strip DTOs — the
  image inputs for cards exist. (Focus/quality scoring unavailable on the
  free Cloudinary plan; lead-photo pick degrades to recency.)

## 3. How the platform share APIs work (verify before build)

- **iOS share sheet (`UIActivityViewController` via Expo/RN Share API)** —
  already used by the W3 modal. Sharing an IMAGE + URL together: the sheet
  passes both; many targets prefer one. Low risk, already proven.
- **Instagram Stories (the one that matters)** — no SDK needed: write the
  sticker/background image to `UIPasteboard` under the
  `com.instagram.sharedSticker.*` keys (`backgroundImage`, `stickerImage`,
  `backgroundTopColor`, `backgroundBottomColor`) with a short pasteboard
  expiration, then open `instagram-stories://share?source_application=
{meta-app-id}`. **Requires a registered Meta/Facebook App ID** (since
  2023-ish Instagram rejects shares without `source_application`), and
  `instagram-stories` must be in `LSApplicationQueriesSchemes`.
  ⚠️ UNCERTAIN/verify: exact key names + whether `contentURL` (tappable
  link attribution) is still honored — historically it was removed/limited;
  assume the story is a dumb image and the "get the app" path is the
  sticker's visible URL text, not a tap target. Verify against current Meta
  "Sharing to Stories" docs + whether app review is needed for the app ID.
- **Instagram DMs / feed** — no direct compose API; falls to the OS share
  sheet (Instagram's share extension accepts images). Fine.
- **iMessage / WhatsApp / Telegram / X / etc.** — all via the OS share
  sheet; the differentiator is the ATTACHED IMAGE (the package) + the link.
  WhatsApp/Telegram/iMessage render OG previews from the link — which is
  why the OG pages matter (below).
- **Snapchat Creative Kit / TikTok Share Kit** — exist but require SDK
  integration + app registration + review. Park unless the owner names
  them; the OS sheet reaches both apps' basic image share.
- **iOS Share EXTENSION (receiving shares INTO Crave)** — a different
  feature (native extension target, app-group storage); out of scope for
  the share package; note only.

## 4. Rendering options

- **Client-side: `react-native-view-shot`** (NOT yet a dependency —
  requires a pod install + native build). Render the package as an
  off-screen RN component, capture to PNG, hand to pasteboard/share sheet.
  Pros: one design system (the React card IS the export), fonts/score
  palette free, works offline-ish, no server load. Cons: device-dependent
  rendering, needs an off-screen mount pattern, 9:16 story variant = a
  second layout.
- **Server-side OG-image generation** — render the same package as an image
  URL (e.g. a headless renderer or a canvas/Satori-style HTML→PNG service)
  for LINK previews. Required regardless for OG meta: the `/l` `/r` `/p`
  links currently point at `crave-search.app`, which has **no OG meta pages
  today — there is no web app in the repo at all**. Every external share is
  a bare URL until the marketing site exists (named dependency: the W4 "web
  landing upgrade" / marketing-site effort). The landing page IS the
  package rendered at the URL (registry §8.2), fed by the same resolver via
  a public (viewerless) resolve variant + `og:image`.
- **Recommendation shape:** view-shot for in-hand exports (stories,
  image-into-share-sheet) + a thin server OG endpoint for link previews;
  both consume ONE package DTO from the resolver so the design pass styles
  one card.

## 5. Build-slice sketch (post-owner design pass)

1. Extend `SharePackageResolverService` DTO to the full package fields
   (score, ranked rows[≤5], photo URLs, kind-specific bits) + a public
   resolve for landings. No new resolver.
2. `SharePackageCard` RN component family (one per kind, one visual system)
   — replaces the crude modal preview AND the DM bubble body.
3. `react-native-view-shot` capture lane: off-screen mount → PNG →
   share-sheet image attachment (this alone upgrades every external target).
4. Instagram Stories lane: 9:16 background + sticker variant, pasteboard +
   `instagram-stories://` + Meta app ID registration (verify §3 unknowns
   first).
5. Marketing-site OG pages for `/l` `/r` `/p` (+ dish/profile paths):
   resolver-fed meta + og:image + get-the-app CTA. Blocked on the
   marketing-site effort existing.
6. Share-event analytics (created/opened/copied) — product docs already
   spec this; ride the existing events pattern.

Owner-in-loop: the card design itself (registry §8.2 explicitly defers the
beauty pass), and whether Snapchat/TikTok SDK lanes are worth their review
overhead at launch.
