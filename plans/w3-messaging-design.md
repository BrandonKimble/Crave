# W3 Messaging — ideal-shape design (DESIGN ONLY; no code in this pass)

Sources of truth read for this doc: plans/page-registry.md §7.9 + §9a rows
(dmSession / messagesInbox), §8.6 (block ties to messaging), §8.2 (universal
share modal — Crave DMs are a destination), plans/registry-implementation-plan.md
W3 item 6 + item 7 (blocking), product/messaging.md, product/notifications.md,
product/profile.md, the nav substrate
(apps/mobile/src/navigation/runtime/app-route-scene-entry-mounts.ts — RT-19
entry-keyed child mounts), ListDetailPanel/PollDetailPanel/PostPhotosPanel as
UI precedents, and apps/api existing infra (identity: UserFollow +
ClosenessService; notifications: NotificationDevice + Notification + cron
NotificationDispatcherService with Expo push).

Ethos constraints honored throughout: no tactical patches; every state is an
honest, loud contract (a frozen conversation SAYS it is frozen — no silent
drops); the realtime upgrade is a named seam, not a guard; nothing is built
"defensively" for features we deferred.

---

## 1. Product scope v1

### 1.1 Who can DM whom: ANY user → any user, with a REQUEST lane (recommend)

Adjudication. The three candidate policies:

- **Mutuals only** — cleanest abuse posture, but kills the share modal's whole
  point at launch scale: a brand-new app has almost no mutual pairs, and the
  registry says Crave DMs are a _primary_ share destination (§8.2). A share
  target list that is empty for every early user is a dead feature.
- **Any follower** — asymmetric and confusing ("I can message you but you
  can't reply"? no — replying creates the reverse edge implicitly, so it
  degenerates to "anyone" with extra steps).
- **Anyone, request-gated (Instagram model)** — RECOMMENDED. Anyone can start
  a conversation; if the recipient does not follow the sender, the
  conversation lands in the recipient's **Requests** section of the inbox
  (a filter of the same list, not a separate surface) and the recipient's
  first reply — or an explicit Accept — promotes it to the main inbox.
  product/messaging.md explicitly parks "message requests from non-friends"
  for this design pass; this is the resolution. It preserves the share-first
  growth loop (share a dish to anyone) while giving recipients the standard
  consent gate the App Store review (1.2 UGC) expects alongside block/report.

Concrete v1 rule (loud, single-place):
`conversation.isRequestFor(userId)` ⇔ userId has never sent a message in it
AND userId does not follow the other participant AND userId has not accepted
it. One boolean per participant row (`acceptedAt`), computed nowhere else.

**Push/notification consequence:** request conversations generate NO push and
do NOT count toward the unread badge until accepted. Honest state: the inbox
shows "Requests (n)".

### 1.2 Message kinds v1: `text` and `entity_share` — that's it

- `text` — plain text, 1–2000 chars, server-trimmed, no markdown.
- `entity_share` — THE reason messaging is in W3: the universal share modal's
  "send in Crave" target. One message = one shared object + optional caption
  text. Object types = exactly the share-modal set (§8.2): `list`,
  `restaurant`, `dish`, `poll`, `comment`, `user_profile`. The message stores
  a typed entity reference (kind + id, §2), NEVER a denormalized snapshot —
  the bubble renders the same share-package preview component the share modal
  and /l/{slug} landing use (one renderer, three consumers; the preview
  hydrates from the live entity by id). If the entity is since-deleted/hidden,
  the bubble renders an honest "no longer available" card — not a crash, not
  a silent blank.
- **NO media v1.** Photos ride entity shares (a dish/restaurant share IS a
  photo-forward card). A raw-photo message kind means moderation surface,
  Cloudinary plumbing, and report-pipeline extension for zero launch value.
  The `kind` enum is the extension point; adding `photo` later is one enum
  value + one bubble renderer + upload plumbing — no schema rework.

### 1.3 Deferred, with justification

- **Read receipts (shown to the SENDER)** — deferred. We still track per-
  participant read cursors (we need them for unread badges, §2.4), we just
  don't expose the other side's cursor in v1. Exposing it later is a DTO
  field, zero schema work. Deferring the social-pressure feature, not the data.
- **Typing indicators** — deferred; they are meaningless over 15s polling
  (§3) and are precisely the feature the websocket seam exists for. Building
  a fake polled typing signal would be a lie about latency — the named
  failure mode.
- **Group conversations** — out. Schema is pair-unique by construction (§2.1)
  and does NOT pre-build group shape (no speculative "participants" fan-out
  beyond the two rows we need — see §2.1 note on why we still use a
  participant table).
- **Message editing/deletion** — out v1. Report + block are the safety tools
  (§8.6); unsend is polish.

### 1.4 Blocking interaction (spec'd here per registry §8.6 / W3 item 7)

Block is a separate W3 slice (`user_blocks`), but messaging defines its
contract now:

- A block in EITHER direction **freezes** the conversation: sends from both
  sides are rejected server-side with a typed error (`CONVERSATION_FROZEN`),
  and the client renders the honest state — composer replaced by a static
  "You can't reply to this conversation" row. No silent drop, no fake
  delivery, no hiding the thread history (blocker can still read; Instagram
  semantics). Unblock thaws it — no data mutation needed, because frozen is
  a _derived_ read-time state (EXISTS on user_blocks for the pair), not a
  column. Delete-not-guard: there is no `isFrozen` flag to drift stale.
- Blocked pairs: existing conversation stays listed for the blocker (frozen);
  for the blocked user it also stays listed and frozen (they learn nothing
  extra — the same UI as any frozen state). Starting a NEW conversation with
  a user who blocked you fails with the same typed error.
- Push: frozen conversations never notify.

---

## 2. Data model (Prisma-shaped)

Follows house conventions: snake_case `@@map`, uuid PKs via
`gen_random_uuid()`, explicit named indexes, per-column `@map`.

### 2.1 `conversations` + `conversation_participants`

Pair-unique 1:1 conversations. We still model participants as rows (not
`userAId`/`userBId` columns) because every per-user attribute — read cursor,
acceptedAt, lastReadAt — is participant-scoped; two typed columns would force
`if (viewer === userA)` branching at every read path (the disease the
entry-keyed mounts work just killed on mobile). Pair-uniqueness is enforced
by a canonical pair key, not by counting rows.

```prisma
model Conversation {
  conversationId String   @id @default(dbgenerated("gen_random_uuid()")) @map("conversation_id") @db.Uuid
  /// CANONICAL PAIR KEY: `${min(userIdA,userIdB)}:${max(...)}` (uuid string order).
  /// THE uniqueness contract for 1:1 — computed in exactly one service function.
  pairKey        String   @unique(map: "uq_conversations_pair_key") @map("pair_key")
  /// Denormalized hot-path columns for inbox sort/preview (single-writer:
  /// only MessageService.send updates them, same transaction as the insert).
  lastMessageAt  DateTime @map("last_message_at")
  lastMessageId  String?  @map("last_message_id") @db.Uuid
  createdAt      DateTime @default(now()) @map("created_at")

  participants ConversationParticipant[]
  messages     Message[]

  @@index([lastMessageAt(sort: Desc)], map: "idx_conversations_last_message_at")
  @@map("conversations")
}

model ConversationParticipant {
  conversationId    String    @map("conversation_id") @db.Uuid
  userId            String    @map("user_id") @db.Uuid
  /// Read cursor: createdAt of the newest message this user has seen.
  /// Monotonic (server rejects moves backward). Source of truth for unread.
  lastReadMessageAt DateTime? @map("last_read_message_at")
  /// Request-lane resolution (§1.1). NULL = still a request IF the derived
  /// rule says so; set on first reply or explicit accept.
  acceptedAt        DateTime? @map("accepted_at")
  createdAt         DateTime  @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [conversationId], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@id([conversationId, userId])
  @@index([userId, conversationId], map: "idx_conversation_participants_user")
  @@map("conversation_participants")
}
```

### 2.2 `messages`

```prisma
enum MessageKind {
  text
  entity_share
}

enum SharedEntityKind {
  list
  restaurant
  dish
  poll
  comment
  user_profile
}

model Message {
  messageId      String            @id @default(dbgenerated("gen_random_uuid()")) @map("message_id") @db.Uuid
  conversationId String            @map("conversation_id") @db.Uuid
  senderUserId   String            @map("sender_user_id") @db.Uuid
  kind           MessageKind
  /// text kind: the message. entity_share kind: optional caption.
  body           String?           @db.VarChar(2000)
  /// entity_share only — typed ref, NO snapshot (bubble hydrates live, §1.2).
  /// LOUD CONTRACT (DB CHECK constraint in the migration, not app-only):
  ///   kind = entity_share ⇔ (sharedEntityKind AND sharedEntityId NOT NULL)
  ///   kind = text          ⇔ both NULL
  sharedEntityKind SharedEntityKind? @map("shared_entity_kind")
  sharedEntityId   String?           @map("shared_entity_id")
  createdAt      DateTime          @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [conversationId], onDelete: Cascade)
  sender       User         @relation(fields: [senderUserId], references: [userId], onDelete: Cascade)

  /// Cursor pagination: (conversationId, createdAt DESC, messageId DESC) —
  /// messageId tiebreak makes the cursor total-ordered.
  @@index([conversationId, createdAt(sort: Desc), messageId(sort: Desc)], map: "idx_messages_conversation_cursor")
  @@map("messages")
}
```

`sharedEntityId` is a plain string (not FK): the six entity kinds live in six
tables; a polymorphic FK would be a lie and six nullable FKs would be the
type-list disease in column form. Integrity = the share-package resolver
(§3.3) already handles missing/hidden entities honestly ("no longer
available" card), which we need anyway for deletions — so a dangling id is a
_designed_ state, not corruption.

### 2.3 Blocking table (W3 item 7 — schema stated here for the freeze read)

```prisma
model UserBlock {
  blockerUserId String   @map("blocker_user_id") @db.Uuid
  blockedUserId String   @map("blocked_user_id") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at")
  @@id([blockerUserId, blockedUserId])
  @@index([blockedUserId], map: "idx_user_blocks_blocked")
  @@map("user_blocks")
}
```

Frozen check = one EXISTS over the pair in both directions, evaluated inside
MessageService.send and folded into the conversation DTO as `frozen: boolean`.

### 2.4 Unread derivation (no counter columns — delete-not-guard)

Unread-per-conversation = `EXISTS messages WHERE conversationId = ? AND
createdAt > participant.lastReadMessageAt AND senderUserId != viewer` (and a
COUNT variant capped at 100 for display). Total badge = COUNT of accepted,
non-request conversations with that EXISTS true. No `unreadCount` column to
drift; the cursor index makes the diff cheap at this scale. If profiling ever
demands a counter, it becomes a single-writer denormalization then — not a
speculative one now.

---

## 3. API (NestJS module `apps/api/src/modules/messaging/`)

### 3.1 Transport adjudication: REST + polling v1 — RECOMMENDED, honestly

For a solo-dev launch app with (a) a 1-minute-cron push dispatcher already
built, (b) zero existing websocket infra, (c) launch-scale concurrency of
tens of users: websockets buy sub-second delivery at the cost of a whole new
operational surface (connection lifecycle, auth-on-upgrade, reconnect state,
a second deploy artifact to reason about). Polling costs one cheap indexed
query per client per interval. The honest read: **DM latency of ~seconds is
fine when push notifications (the real attention channel) ride the existing
dispatcher**, and typing indicators — the only feature that truly needs a
socket — are deferred (§1.3).

v1 cadence:

- **Inbox**: poll `GET /messaging/conversations` every **15s** while the
  inbox or any profile header (badge) is on screen; also on app-foreground.
- **Open session**: poll `GET .../messages?after=<cursor>` every **5s** while
  the dmSession scene is topmost, plus an immediate fetch on scene focus and
  after every send (the send response returns the message, so the sender's
  own bubble is optimistic-confirmed without waiting a tick).

**The websocket upgrade seam (named, not built):** all client reads flow
through ONE hook, `useConversationSync(conversationId | 'inbox')`, which owns
the timer and writes into the React-Query cache. The realtime upgrade
replaces that hook's timer with a socket subscription pushing the _same_
message DTOs into the _same_ cache keys — zero schema change, zero endpoint
change, zero component change. Server-side the seam is
`MessagingEventsPort` — an interface with one v1 implementation, `NoopPort`
(polling needs no push), later `SocketGatewayPort`. MessageService.send calls
the port; nothing else changes.

### 3.2 Endpoints + DTOs

All under Clerk auth (existing guard). `viewer` = authenticated user.

| Method | Path                                                                                                          | Purpose                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/messaging/conversations?filter=inbox\|requests&cursor=&limit=20`                                            | Inbox list, `lastMessageAt DESC` cursor                                 |
| POST   | `/messaging/conversations` `{ otherUserId }`                                                                  | Get-or-create by pairKey (idempotent); returns full ConversationDto     |
| GET    | `/messaging/conversations/:id`                                                                                | One conversation (dmSession header hydrate)                             |
| GET    | `/messaging/conversations/:id/messages?cursor=&after=&limit=30`                                               | `cursor` pages older (history), `after` fetches newer (the poll)        |
| POST   | `/messaging/conversations/:id/messages` `{ kind, body?, sharedEntityKind?, sharedEntityId?, clientDedupeId }` | Send; 409-safe via clientDedupeId; typed `CONVERSATION_FROZEN` error    |
| PUT    | `/messaging/conversations/:id/read` `{ lastReadMessageAt }`                                                   | Advance read cursor (monotonic; server clamps backward moves)           |
| POST   | `/messaging/conversations/:id/accept`                                                                         | Promote request → inbox (sets acceptedAt)                               |
| GET    | `/messaging/unread-count`                                                                                     | `{ total }` for the profile-header badge (cheap poll)                   |
| POST   | `/messaging/share` `{ recipientUserIds[], sharedEntityKind, sharedEntityId, body? }`                          | Share-modal fan-out: get-or-create each conversation + send in one call |

```ts
type ConversationDto = {
  conversationId: string;
  otherUser: { userId; username; displayName; avatarUrl };
  lastMessage: MessagePreviewDto | null;
  lastMessageAt: string;
  unreadCount: number; // capped 100
  isRequest: boolean; // §1.1 derived rule, computed server-side ONLY
  frozen: boolean; // §2.3 derived, computed server-side ONLY
};

type MessageDto = {
  messageId: string;
  senderUserId: string;
  kind: 'text' | 'entity_share';
  body: string | null;
  sharedEntity: SharePackagePreviewDto | null; // resolved server-side (§3.3)
  createdAt: string;
  clientDedupeId: string | null; // echoes back so optimistic rows reconcile
};
```

`isRequest`/`frozen` are computed in exactly one server function each and
shipped on the DTO — the client NEVER re-derives them (the
resolveIsPersistentPollLane lesson: one authority, not four consumers with
copies).

### 3.3 Share-package resolution

`SharePackageResolverService` (messaging module consumes; share modal + the
/l/{slug} landing are the other consumers per §8.2): takes
`(kind, id, viewerUserId)` → `SharePackagePreviewDto | { unavailable: true }`.
Applies visibility (private list, hidden photo, blocked author) at resolve
time, so the DM bubble can never leak content the viewer shouldn't see —
enforcement lives at the read path, which is exactly where W3 item 7 puts
blocking enforcement generally.

### 3.4 Push + badge hookup

Rides the EXISTING notifications module untouched in shape:

- New `NotificationType` value `dm_message` — per product/notifications.md
  this is the designed extension point (enum value + buildMessage branch +
  deep-link + producer).
- Producer: MessageService.send enqueues a Notification row (recipient's
  devices) UNLESS the conversation is a request for the recipient, is frozen,
  or the recipient's read cursor shows the session currently open (client
  sends `PUT /read` on focus, which is a good-enough presence proxy for v1).
- Deep link: `crave://dm/{conversationId}` → pushes dmSession (the
  from-anywhere machinery is proven — W0.3).
- The W4 push-permission moment ("after first DM" trigger,
  registry-implementation-plan W4 item 4) hooks the FIRST send client-side.
- v1 ships this producer behind the existing 1-minute dispatcher cron —
  meaning push latency ≤ ~60s. Acceptable at launch; the dispatcher cadence
  is a notifications-module knob, not messaging's problem.

---

## 4. Mobile

### 4.1 Scenes (registry §9a rows)

- **messagesInbox** — `role: 'child'`, SINGLETON semantics (it is entry-keyed
  by construction like every child, but it takes no params and there is never
  a reason to stack two; pushing it while in-stack = pop-to-existing, the
  standard child re-push behavior). Entry: own-profile header button (§7.9).
  Body: FlashList of ConversationDto rows (avatar, name, preview,
  relative time, unread dot), a Requests section header when
  `requests.length > 0`, row tap → push dmSession. Plain re-orderable list →
  **MVCP DISABLED** via `flashListProps` (CLAUDE.md: re-sortable feeds
  disable it; inbox rows re-sort on every new message).
- **dmSession** — `role: 'child'`, **ENTRY-KEYED per conversation** — exactly
  the RT-19 mount shape: the mounted unit is `dmSession#entryId`, params
  `{ conversationId, otherUserId? }` flow FROM THE ENTRY as props (the C2
  contract in app-route-scene-entry-mounts.ts: child bodies never read
  useTopMostRouteEntryForScene). This is what makes profile → DM → shared
  profile → DM-with-them a legal drill loop with byte-exact pop returns; the
  depth-K (=3) eviction handles memory. `pairKey` uniqueness is a SERVER
  concern; the client may briefly mount two entries for the same conversation
  in a deep drill loop — they share one React-Query cache key, so they cannot
  disagree.
- Snap: §7.9 — tapping Message fully extends the sheet first if not extended;
  back returns to the prior snap. That is the existing captureOrigin/
  return-to-origin foundation + the pollDetail snapPointsOverride precedent —
  no new snap machinery.

### 4.2 Message list = FlashList KEEPING MVCP

The dmSession thread is an append/chat list — per CLAUDE.md, chat lists KEEP
`maintainVisibleContentPosition` (default on). Inverted-list pattern like the
poll-detail thread: newest at the visual bottom, history pages load upward via
the `cursor` param, new polled messages append without yanking scroll. Bubble
renderers: `text` and the shared share-package preview component (§3.3) — one
component per kind, kind switch in exactly one place.

### 4.3 Composer + keyboard

Pattern already proven in PollDetailPanel (the comment composer): a bottom-
pinned composer using Reanimated `useAnimatedKeyboard` to ride above the
keyboard (PollDetailPanel.tsx ~line 1093 — height measured from screen
bottom, works with the sheet), plus the sheet scroll containers' existing
`keyboardShouldPersistTaps='handled'` transport default
(BottomSheetWithFlashList → searchOverlayRouteHostContract
`keyboardShouldPersistTaps` transport field — the same channel PostPhotosPanel
rides). dmSession reuses this composer shape: TextInput + send button,
optimistic append with `clientDedupeId`, honest per-row failed state with
tap-to-retry (no silent retry loops). When `frozen`, the composer is replaced
by the static frozen row (§1.4); when `isRequest` for the viewer, an
Accept/Block bar renders above it.

### 4.4 Entry points

1. Other user's profile → **Message** button (Follow's pair, §7.3):
   `POST /conversations {otherUserId}` (idempotent) → push
   `dmSession {conversationId}` as a child of that profile.
2. Own profile header → **messagesInbox**; rows push dmSession.
3. **Universal share modal → "Send to…"**: friends list (ClosenessService
   order — the stable interface built in W0 for exactly this consumer),
   multi-select → `POST /messaging/share` fan-out → toast confirm; the modal
   does NOT navigate into a session.
4. Push deep link `crave://dm/{id}` → dmSession from anywhere (W0.3 proven).

---

## 5. Build slices (each one agent, each gate-able)

**Slice M1 — backend core.** Migration (3 tables + 2 enums + the entity_share
CHECK constraint), MessagingModule: pairKey get-or-create, send (dedupe,
frozen check stubbed to `false` until W3-blocking lands, participant-row
denorm write), cursor + `after` message reads, read-cursor PUT, inbox list
with derived isRequest/unread, unread-count endpoint, share fan-out,
SharePackageResolver v1 (all six kinds, honest `unavailable`).
GATE: jest RED→GREEN suite — pair uniqueness under concurrent create, cursor
pagination total order, unread derivation, request-lane rule table, dedupe
replay, CHECK-constraint violation is loud.

**Slice M2 — scenes + nav.** Registry entries for messagesInbox + dmSession
(child role ⇒ entry-keyed mounts for free), profile Message button +
own-profile inbox button wiring, inbox list (MVCP disabled), dmSession thread
(MVCP kept, inverted, history paging), composer with useAnimatedKeyboard +
optimistic send/failed-retry, frozen/request states rendered from DTO flags,
snap extend/restore.
GATE: sim finger-pass — profile→Message→send→back-to-profile-at-prior-snap;
inbox→session drill loop with a nested profile→dmSession push (two dmSession
entries live, pop byte-exact — the RT-19 proof); [ENTRYMOUNT] probe log.

**Slice M3 — share integration + polling loop.** `useConversationSync` hook
(15s inbox / 5s open-session / foreground refetch; the ONE seam), share-modal
"Send to…" destination (closeness-sorted multi-select → fan-out), entity_share
bubbles rendering the shared preview component, unread badge on own-profile
header.
GATE: sim — share a list from listDetail to a friend, second sim account sees
it arrive within one poll tick and taps the bubble → listDetail opens; badge
increments and clears on read.

**Slice M4 — requests, block-freeze, push stub.** Requests filter UI +
accept/first-reply promotion; consume W3-blocking's user_blocks in the frozen
derivation + composer swap (if blocking hasn't landed, this slice builds
user_blocks itself — it owns the dependency); `dm_message` NotificationType
producer + deep link + suppression rules (request/frozen/session-open).
GATE: jest on freeze/request transitions + sim — block from profile ellipsis
mid-conversation → both composers freeze with honest copy; unblock thaws;
push row enqueued on send (dispatcher log), suppressed for requests.

Sequencing: M1 → M2 → (M3 ∥ M4).

---

## Open items routed OUT of this design

- Realtime upgrade (socket port implementation) — post-launch, seam named §3.1.
- Read-receipt exposure, typing, media messages, groups — §1.3, all additive.
- Share-package BEAUTY pass — owner-in-loop per §8.2; M3 ships the crude-real
  preview component.
- Dispatcher cadence (60s push latency) — notifications-module knob if launch
  feedback demands faster.
