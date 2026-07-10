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

## Step-1/2 researched decisions (Cloudinary deep-dive, 2026-07-09 — LOCKED)

- **Signed uploads + SIGNED upload preset.** Ticket = api_key/timestamp/
  signature/public_id/preset (1h validity). Signature covers every param —
  client cannot alter public_id/folder/moderation/notification_url. Server
  mints public_id crave/{env}/photos/{photoId}. Preset pins: folder,
  incoming transformation (w_2560,h_2560,c_limit,q_auto:good — caps stored
  originals), allowed_formats, moderation, notification_url. NEVER unsigned
  presets (preset name = bearer credential).
- **Moderation = pending→live, NOT publish-then-gate** (amends the spec
  wording; UX identical, seconds-scale): `moderation: aws_rek` holds the
  asset pending; async webhook delivers approved/rejected + labels
  (thresholds tunable). Rejected assets CDN-invalidated. is-food is NOT
  Rekognition's job → our own async Gemini flash vision pass (existing LLM
  stack + usage ledger) as part of the confirm/webhook pipeline. Quality
  floor = `quality_analysis: true` focus score (free, sync in upload
  response) + width/height/bytes.
- **EXIF**: `media_metadata: true` on upload → takenAt from
  DateTimeOriginal in the RESPONSE; GPS never persisted anywhere (privacy).
  Stored original is downscaled+metadata-stripped by the incoming
  transform; derived deliveries strip EXIF by default. E2E must verify
  DateTimeOriginal survives the incoming transform (known pitfall);
  fallback = drop incoming transform + strict-only delivery.
- **Delivery**: named transformations t_thumb/t_card/t_gallery/t_full with
  f_auto appended INLINE (f_auto is inert inside named transformations);
  STRICT TRANSFORMATIONS ON with those 4 allowlisted (public URLs +
  open transforms = billing-abuse vector); explicit dpr from the client;
  no signed delivery URLs (overkill for public UGC). ONE server-side URL
  builder — clients never hand-roll URLs; DTOs carry ready URLs.
- **Webhook**: notification_url signed into the ticket → POST
  /photos/webhooks/cloudinary; verify X-Cld-Signature (+timestamp
  staleness); idempotent + 200-fast; retries are only 3/6/9min then give
  up → RECONCILIATION CRON sweeps pending photos via Admin API
  resources_by_moderation (500 req/hr free — never poll per-photo).
- **Free tier = 25 FUNGIBLE credits/mo** (storage GB + bandwidth GB +
  transformations/1000 share it) — fine for launch with the 4-variant
  named-transformation discipline; not "25GB storage".
- **SDK**: `cloudinary` v2 npm, server-side only (signing, admin, URL
  building, webhook verify). No client SDK — the app uploads with plain
  multipart POST using the ticket.
- **FK truth**: dish link = `connectionId` (Connection = restaurant×food),
  matching favorites' {restaurantId?, connectionId?} convention.
- **CLI**: cloudinary-cli installed via pipx (`cld`); needs CLOUDINARY_URL
  (owner keys pending). Used for one-time setup: named transformations,
  strict-transformations flag, upload preset — scripted + committed so
  setup is reproducible.

## Live E2E results (2026-07-10, keys landed)

VERIFIED live: signed ticket → direct multipart upload (incoming transform
applied, 2560 cap) → upload webhook through the tunnel (SDK
verifyNotificationSignature — the hand-rolled SHA-1 scheme was wrong and
got replaced) → width/height/bytes filled → delivery via t_crave_thumb +
f_auto → delivered variant FULLY EXIF-stripped (GPS test image).

TWO design amendments from the run:

1. **takenAt is CLIENT-supplied at ticket time** (picker EXIF, read
   on-device before upload). The research-flagged pitfall is real: the
   incoming transform strips EXIF before Cloudinary can extract it — and
   that's the PRIVACY WIN (GPS never reaches storage), so we keep the
   transform and move capture-time to the ticket. Mobile step 6: read EXIF
   via expo-image-picker and send takenAt.
2. **focus_score unavailable on the free plan** (quality_analysis returned
   nothing) — hero policy degrades to recency-only until paid; column
   stays.

REMAINING for the full moderation flip (owner, Console — no API exists):

1. Add-ons → register "Amazon Rekognition AI Moderation" (free tier)
2. Security → enable STRICT TRANSFORMATIONS; allowlist
   t_crave_thumb/card/gallery/full
   Then rerun: `yarn ts-node scripts/photo-e2e.ts` (full pending→live flip).
   Dev webhook = cloudflared tunnel in CLOUDINARY_NOTIFICATION_URL (per
   session); prod = Railway URL.

## FULL PROBE GREEN (2026-07-10, post Console clicks)

Complete lifecycle verified live: ticket → direct upload → Rekognition
approved → upload webhook AUTHENTICATED + flipped pending→LIVE in-window →
Gemini is-food gate (proven BOTH ways: paywall screenshot REMOVED as
not_food; rice photo passed) → signed t_crave_thumb delivery under STRICT
transformations → delivered variant fully EXIF-stripped (GPS test image).

Three more E2E-earned corrections (all committed):

1. **Notifications are signed with the PRIMARY (root) key's secret**, not
   the named key that uploads → dedicated CLOUDINARY_WEBHOOK_SECRET.
2. **fastify-raw-body was global:false with NO routes opted in** → rawBody
   was undefined app-wide — which means the STRIPE webhook signature check
   had the same latent bug. Fixed with an explicit routes list (stripe +
   cloudinary webhooks).
3. **Strict transformations blocks inline chains** (t_named/f_auto = 401) →
   delivery URLs are now SDK-SIGNED (sign_url), which is strict-exempt and
   keeps f_auto effective. Upload callbacks may omit notification_type →
   upload-shaped payloads are treated as upload notifications.
   allowed_for_strict is set programmatically in cloudinary-setup.ts (the
   Console allowlist click wasn't needed after all).
4. CORRECTION to the earlier note: quality_analysis focus DOES populate on
   the free plan via the webhook path (0.34 measured) — hero quality floor
   works at launch.
