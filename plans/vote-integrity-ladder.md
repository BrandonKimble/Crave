# Vote integrity — the sybil-protection ladder (research verdict, 2026-07-24)

Owner's spec (ratified stance): a legitimate vote ALWAYS counts as exactly
one full vote — no fractional discounting of real people, no karma system;
the sole enemy is one human operating multiple accounts (direct commercial
incentive: scores send customers to restaurants; small-N town polls make
per-vote leverage high). Full sourced report: task output
a0ce9ce9a66e78cbb (session 895cda47).

## The industry's universal shape

Nobody uses a single hard gate. Everyone stacks: cheap friction +
behavioral signals + RETROACTIVE cluster cleanup — and reserves identity
friction (phone/payment/ID) for high-stakes actions. Google/Yelp publish
immediately and pull fraudulent clusters after the fact; Reddit's vote
fuzzing only blinds attackers to whether their bots work. Behavioral
signals (account age, burst timing, no-history accounts) beat content
analysis in practice.

## Verdicts on the owner's ideas

- **One-account-per-device hard block**: technically possible on iOS
  (DeviceCheck's per-device 2-bit fuse persists across reinstalls and is
  designed for exactly "has this device made an account") — but WRONG as
  a gate: family/shared devices are the modal false positive, Android has
  no equivalent durable primitive, and an attacker prices around it with
  a cheap second device. Industry consensus: device identity is a SIGNAL
  fed to clustering, never a boolean gate.
- **Split a vote across confirmed same-device accounts**: DON'T BUILD —
  it violates the owner's own bright line the moment two real people
  share an iPad, and quadratic-voting literature documents weight-split
  formulas being gamed once attackers learn them.
- **The middle path that fits the bright line exactly** (BrightID/Gitcoin
  pattern): trust signals NEVER touch vote weight — they only route
  between "count immediately" and "hold for review"; confirmed sybil
  rings are invalidated WHOLESALE (all-or-nothing), never discounted.

## The ladder

AT LAUNCH (cheap, invisible to honest users):

1. One-vote-per-account-per-poll server enforcement — EXISTS (standing
   ballot; N votes = one changed choice).
2. DeviceCheck 2-bit device signal on iOS: flag (never block) "device has
   created N accounts" → review signal. Near-zero cost.
3. Velocity limits on account creation + voting per device/IP window
   (throttler exists for API; extend to the vote path).
4. Silent vote-time metadata (device signal, IP, timestamp) + a periodic
   clustering report (shared device ∪ shared IP ∪ burst-timing on one
   poll) for MANUAL owner review — tractable by hand at launch volume.
5. Enforcement on confirmed rings: bulk invalidation of the whole
   cluster's votes. Never fractional.
   NOT at launch: phone verification, payment/ID, hard device blocks,
   weight-splitting — disproportionate or harmful.

AT SCALE (build only when abuse is OBSERVED — act-then-measure, not
pre-pay for an unseen threat):

1. Formalize signals into a trust score routing an automatic review queue.
2. Phone verification (~$0.05/check) gating HIGH-LEVERAGE actions only
   (poll creation, not every vote).
3. SybilRank-style graph clustering over device/IP/target correlations,
   still feeding retroactive bulk invalidation.
4. Payment/ID only if a monetized high-stakes context ever exists.
   NEVER: karma, weight-splitting, hard per-device blocks.

## RED-TEAMED + CORRECTED (2026-07-24; full report: task a66d76c9f3fa73899)

The first-principles red team corrected four things:

1. **DeviceCheck → keychain device key.** DeviceCheck's 2 bits can't count
   accounts, and Clerk owns signup (no webhook exists; none needed) — the
   server's observation moment is EVERY authenticated request via
   ClerkAuthGuard's sync seam. Primitive: a keychain-persisted install
   UUID sent as x-device-key on every request → user_devices join table.
   "Device has N accounts" becomes a GROUP BY, cross-platform, no vendor
   API. DeviceCheck/App Attest move to at-scale durability hardening.
2. **Velocity rung mostly dissolves.** Vote path already carries the
   'sensitive' throttler tier; account-creation velocity is Clerk's (CAPTCHA
   config); and velocity is structurally blind to the real enemy (4
   accounts voting minutes apart). Day-scale counts are report EVIDENCE,
   not gates. One real gap: the native-Apple auth endpoint lacked a
   throttler tier.
3. **"Invalidate the ring's votes" — the outcome survives, the implied
   mechanism doesn't.** The ledger is append-only BY LAW; no redaction
   seam exists or should. The honest primitive is BAN-THE-ACTOR via three
   existing seams: delete poll_endorsements + rebuild leaderboard (open
   polls); re-mint the ballot extraction run minus ring userIds and swap
   the active-run pointer (closed polls — visibility pointer already
   governs projection/score reads); signal_actors.excluded_at filtered at
   read + dropped at aggregate rebuild (fake demand dies with the ring).
   Plus Clerk banUser. Wholesale, never fractional — unchanged.
4. **Irreversibility audit:** the ONLY skip-forever-lose-forever item is
   vote-time metadata capture (deviceKey + HMAC'd IP/subnet in the vote
   signal meta — raw IP never enters the forever-ledger; HMACs are
   equality-joinable, never reversible). Everything else builds later at
   zero history cost. Cheapest rungs of all were missed: Clerk config
   toggles (block email subaddresses + disposable domains; CAPTCHA).

## Owner consumption (fits the standard ops machinery — no new channels)

Detection runs at poll close (the harm moment) + weekly sweep, emits
ops_alerts with dedupeKey 'sybil:<clusterKey>:<pollsHash>' (a persistent
cluster nags once PER POLL SET — ops_alerts dedupe is forever, so a ring's
next poll mints a fresh key instead of collapsing into an acked alert;
no-poll heavy-device alerts use 'sybil:device:<deviceKey>'). Dashboard Alerts card = the review surface; ack = "reviewed,
legit" (the family-iPad answer). The review artifact carries everything a
2-minute decision needs: members (age at first vote), choices +
timestamps + spacing, the lockstep fact, and the decision line — leader
margin WITH vs WITHOUT the cluster. Severity IS the medium:

**K1 escalation sentence (RATIFIED 2026-07-24, owner-delegated):** "A
cluster earns a silent WARN row when ≥2 same-device accounts vote the
same choice on one poll, or one device carries ≥3 accounts; it earns the
CRITICAL email only when un-counting the cluster would change that
poll's leader. Shared-IP alone never triggers anything — an IP is
corroborating evidence, not a cluster."

## Launch build (implemented 2026-07-24)

Device-key capture (mobile keychain UUID + header; guard-seam
user_devices upsert), vote-time meta (deviceKey + ipHmac + ipSubnetHmac),
signal_actors.excluded_at pre-built as a flag (filtering lands with the
first confirmed ring), the sybil clustering report → ops_alerts, the
auth-endpoint throttler tier. Enforcement = documented procedure (the
three seams above); remintForPoll built on first confirmed ring.
OWNER PROCESS ITEMS: Clerk dashboard toggles (subaddress + disposable
blocks, CAPTCHA check); App Store privacy label (Device ID, App
Functionality, linked, no ATT).

## Red-team fixes (2026-07-25) — documented limitations & conventions

- **deviceKey is client-asserted — a cluster proves co-occurrence of
  CLAIMS, not of hardware; never enforce on deviceKey membership alone.**
- **deviceKeyHmac convention:** the append-only signals ledger holds NO
  redactable identifier — vote meta stores HMAC-SHA256(deviceKey) under
  SIGNAL_AUDIT_HMAC_KEY (equality joins preserved); the RAW device key
  lives only in the retention-manageable user_devices table.
- **trustProxy: 1** (main.ts): trust exactly ONE proxy hop — Railway's LB
  appends the real client IP as the last X-Forwarded-For entry. `true`
  trusts the client-writable XFF chain, letting an attacker set
  request.ip: spoof-evading IP capture AND framing honest subnets.
- IP hmacs hash the CANONICAL address (IPv6 fully expanded + lowercased;
  v4-mapped unwrapped) so every spelling of one address equality-joins.

The fake-elite fixture remains the scoring-side floor — stuffing can't
mint elite scores even BEFORE detection catches the ring; polls'
leaderboards (raw counts, small N) are exactly what this ladder protects.

---

> **Correction 2026-08-03 (truth audit):** none — verified accurate against code as of today.
> `signal_actors.excluded_at` (schema.prisma:2559), `user_devices` (schema.prisma:2570) with
> the deviceKey index, the sybil clustering report
> (`apps/api/src/modules/integrity/sybil-cluster-report.service.ts` → ops_alerts), the
> auth-endpoint throttler tier, `trustProxy: 1` (`apps/api/src/main.ts:94`), and the
> HMAC'd vote meta (`modules/signals/audit-hmac.ts` under `SIGNAL_AUDIT_HMAC_KEY`) are all
> present as described. Accurate archaeology.
