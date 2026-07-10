# Images — audit verdict + ideal-shape build plan

Product design of record: product/images.md. Pages/funnels:
plans/page-registry.md §6. Audit run 2026-07-09 (two sweeps: backend +
mobile). This file = ground truth + the sequenced build.

## Audit verdict: GREENFIELD with good anchors

The entire image footprint of the codebase is `User.avatarUrl` — a
passthrough URL string seeded from Clerk (no byte path, no storage, no CDN,
no upload endpoint, no picker deps, no permission strings, zero entity-image
rendering, no Places photos anywhere). Nothing to migrate, nothing to fight.

**Anchors that exist and are right:**

- `saveList` scene / SaveListPanel = the save funnel's first page already
  (list-pick tile grid + inline create form) — it needs the TOOLKIT, not a
  rebuild.
- RestaurantPanel already renders the RANKED dish list — the gallery
  selector row and the addPhotos dish-link picker both feed off it.
- `UsageLedgerService` (fire-and-forget createMany, pending-flush on
  destroy) = the exact pattern for photo_events.
- On-demand request service = the "Other…" free-text demand-signal hook
  (needs a new reason + caption linkage).
- Cutout-skeleton preset framework is extensible → image-shaped
  placeholder row type.
- ModerationModule exists but is TEXT-only (LLM moderateText) — photo
  moderation is new, but has a home.

**Gaps with zero footprint** (the build list): Photo table; Cloudinary
(config/env/signed-ticket endpoint/delivery URLs); image moderation
pipeline + status lifecycle + report/auto-hide; photo fields on every
result/profile DTO; photo_events; FavoriteListItem note/tags columns;
collaborator model (favorites has share links but NO collaborator table —
the "+ tile for collaborators" needs it; dependency flagged to the
lists/screens effort); photo-origin on-demand reason; EXIF takenAt capture;
picker deps + Info.plist strings; the addPhotos funnel; gallery pages; card
strips.

**Two stale-doc fixes to ride along:** schema.prisma:319 comment still
names reward_photo (deleted); avatarUrl can LATER ride the same Cloudinary
path (noted, not built).

## Build sequence (backend-first, same discipline as payments)

1. **Foundation** — `photos` table (photoId, userId, restaurantId REQUIRED,
   dishId?, publicId, mediaType='photo', caption?, takenAt?, uploadedAt,
   status pending|live|hidden|removed, qualityScore?, width, height,
   reportCount) + indexes (restaurantId+status, dishId+status,
   userId+status, uploadedAt). PhotosModule: POST /photos/upload-ticket
   (signed Cloudinary params; public IDs crave/{env}/photos/{photoId}),
   POST /photos/:id/confirm (client → after direct upload; verifies
   asset exists, captures width/height/EXIF takenAt from Cloudinary's
   response), DELETE own photo. Env: CLOUDINARY_CLOUD_NAME/API_KEY/
   API_SECRET. Delivery: named transformations thumb/card/gallery/full,
   f_auto+q_auto; a shared URL-builder so clients never hand-roll URLs.
2. **Moderation lifecycle** — on confirm: auto-gate (Cloudinary AI
   moderation add-on for safety; quality score from resolution/blur
   metadata) → live | removed. POST /photos/:id/report → reportCount++
   → threshold auto-hide (status hidden) → admin CLI to list/audit the
   hidden pile (access-grant.ts pattern). Fail posture: moderation
   infra error = stay pending + retry cron, never publish unmoderated,
   never block the user's UI (optimistic "uploading" client-side).
3. **Read paths / propagation** — restaurant gallery endpoint (sections:
   all + per-dish ranked, selector-row shaped), dish photos, user food
   log (grouped by restaurant), hero selection (recent-above-quality-
   floor) folded into existing DTOs: FoodResult + RestaurantResult get
   heroPhoto? + photoCount; RestaurantProfile gets gallery preview;
   favorites list items get photo strips; PublicUserProfile gets the
   food-log block.
4. **photo_events** — impression|tap, UsageLedger pattern, batched
   client→API endpoint; feeds hero v2 later.
5. **Toolkit schema + demand signal** — FavoriteListItem.note +
   FavoriteListItem.tags (schema now, UI fast-follow per spec);
   OnDemandReason + 'photo_tag' + photo linkage so "Other…" free text
   feeds collection and photos re-link when the dish materializes.
   (Collaborator model = separate favorites feature, owned by the
   lists effort; the + tile ships owner-only until it lands.)
6. **Mobile plumbing + functional skeletons** — expo-image-picker (+
   NSPhotoLibraryAddUsageDescription/NSCameraUsageDescription), expo-image
   for rendering, photos service (ticket → direct upload → confirm),
   the ONE addPhotos screen (context-parameterized, PaywallScreen-style
   functional skeleton the screens thread re-skins), save-funnel toolkit
   button on SaveListPanel, image-shaped cutout-skeleton row type.
   Gallery pages + card strips = screens thread against the §6 registry
   entries, consuming the step-3 endpoints.

Each step: build → red-team → E2E on the sim (upload a real photo through
the funnel, watch it propagate) → commit. Sandbox needs nothing external
except a Cloudinary account (owner: create one, drop the three env keys).
