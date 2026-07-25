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

## Status

Awaiting owner ratification of the launch rungs (2-4 are the build items;
1 exists; 5 is a procedure). The fake-elite fixture remains the scoring-
side floor regardless — it proves stuffing can't mint elite scores even
BEFORE detection catches the ring.
