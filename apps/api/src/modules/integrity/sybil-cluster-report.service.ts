import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { hmacDeviceKey } from '../signals/audit-hmac';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';

/**
 * Sybil clustering report (plans/vote-integrity-ladder.md, launch rung 4).
 *
 * Detection ONLY — trust signals never touch vote weight, and nothing here
 * blocks anyone. The report emits ops_alerts carrying the 2-minute review
 * artifact; the owner's ack on the dashboard Alerts card = "reviewed, legit"
 * (the family-iPad answer). Enforcement on a CONFIRMED ring is the documented
 * three-seam procedure (delete endorsements + rebuild; re-mint the ballot
 * run; signal_actors.excluded_at), wholesale, never fractional.
 *
 * K1 escalation sentence (RATIFIED 2026-07-24, owner-delegated): "A cluster
 * earns a silent WARN row when ≥2 same-device accounts vote the same choice
 * on one poll, or one device carries ≥3 accounts; it earns the CRITICAL
 * email only when un-counting the cluster would change that poll's leader.
 * Shared-IP alone never triggers anything — an IP is corroborating evidence,
 * not a cluster."
 */

// §16 class: K1 owner sentences — the ratified escalation sentence's literal
// thresholds. Never measured, never tuned; changing them means re-ratifying
// the sentence.
const SAME_DEVICE_SAME_CHOICE_MIN_ACCOUNTS = 2;
const HEAVY_DEVICE_MIN_ACCOUNTS = 3;

// §16 class: K1-delegated review-trigger parameters (the sentence says
// "corroborating" without numbers; the owner's ack loop re-ratifies them).
// An IP-subnet group only becomes a reportable cluster when the SAME choice
// lands within this window — lockstep timing is the corroboration.
const IP_TIMING_WINDOW_MS = 30 * 60 * 1000;
// §16 class: K7 plumbing — sweep lookback. Bounds the daily scan; the dedupe
// key makes re-seen clusters no-ops, so overlap between sweeps is free.
const SWEEP_LOOKBACK_DAYS = 30;
// §16 class: K7 plumbing — sha256-hex prefix length for the sorted-userid
// cluster key (dedupe_key is varchar(128); 40 hex chars ≫ collision-safe at
// any realistic cluster count).
const CLUSTER_KEY_HASH_LENGTH = 40;
// §16 class: K7 plumbing — sha256-hex prefix for the sorted-pollid hash in
// the dedupe key. Without it, a ring's SECOND poll collapses into the first
// acked alert (ops_alerts dedupe is a FOREVER unique column, not a window),
// so each new poll a cluster touches must mint a new dedupe key. 12 hex
// chars keeps `sybil:<40>:<12>` well under dedupe_key's varchar(128).
const POLLS_HASH_LENGTH = 12;

interface DeviceVoteClusterRow {
  device_key: string;
  poll_id: string;
  subject_type: string;
  subject_id: string;
  user_ids: string[];
  voted_ats: Date[];
}

interface HeavyDeviceRow {
  device_key: string;
  user_ids: string[];
}

interface IpVoteRow {
  ip_subnet_hmac: string;
  poll_id: string;
  endorsed_subject_id: string;
  endorsed_subject_type: string | null;
  user_id: string;
  occurred_at: Date;
}

export interface SybilClusterFinding {
  clusterKey: string;
  /** Full ops_alerts dedupe key — per-poll-set for vote clusters so a
   *  ring's next poll re-alerts instead of collapsing into an acked row. */
  dedupeKey: string;
  kind: 'device' | 'device_heavy' | 'ip_timing';
  severity: 'warn' | 'critical';
  title: string;
  body: string;
}

interface PollVoteSet {
  subjectKey: string;
  userId: string;
}

@Injectable()
export class SybilClusterReportService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SybilClusterReportService');
  }

  /** Daily, 03:45 — offset from the 02:00 lifecycle, 02:35 trace, 03:10
   *  partition and 04:00 sibling-edge crons. Runs only in the scheduler
   *  runtime by construction: app.module loads ScheduleModule.forRoot()
   *  solely when isSchedulerRuntime(), so this decorator is inert elsewhere. */
  @Cron('45 3 * * *')
  async runDailySweep(): Promise<void> {
    try {
      const findings = await this.runSweep();
      if (findings.length) {
        this.logger.info('sybil sweep produced findings', {
          count: findings.length,
        });
      }
    } catch (error) {
      this.logger.warn('sybil sweep failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * One sweep pass: device clusters (the K1 triggers) + timing-corroborated
   * IP clusters. Emits one ops_alert per cluster (dedupe-collapsed by
   * `sybil:<clusterKey>`, so a persistent cluster nags once). Returns the
   * findings for tests/manual runs.
   */
  async runSweep(): Promise<SybilClusterFinding[]> {
    const deviceVoteRows = await this.fetchDeviceVoteClusters();
    const heavyDevices = await this.fetchHeavyDevices();
    const ipVoteRows = await this.fetchIpVoteRows();

    const findings: SybilClusterFinding[] = [];

    // --- (a) DEVICE clusters: ≥2 same-device accounts, same choice, same poll.
    const byDevice = new Map<string, DeviceVoteClusterRow[]>();
    for (const row of deviceVoteRows) {
      const users = [...new Set(row.user_ids)];
      // Defensive restatement of the SQL HAVING — a row that can't satisfy
      // the K1 sentence must never alert (RED-able in the spec).
      if (users.length < SAME_DEVICE_SAME_CHOICE_MIN_ACCOUNTS) {
        continue;
      }
      const list = byDevice.get(row.device_key) ?? [];
      list.push(row);
      byDevice.set(row.device_key, list);
    }
    for (const [deviceKey, rows] of byDevice) {
      const memberIds = [...new Set(rows.flatMap((r) => r.user_ids))];
      const pollIds = [...new Set(rows.map((r) => r.poll_id))];
      // Artifact honesty: sharing a device (user_devices co-registration)
      // does NOT prove the votes were cast FROM it — say which claim the
      // evidence supports, and compare per-vote deviceKeyHmac when captured.
      const provenance = await this.describeVoteProvenance(
        deviceKey,
        memberIds,
        pollIds,
      );
      findings.push(
        await this.buildVoteClusterFinding({
          clusterKey: deviceKey,
          kind: 'device',
          lockstepFact: `accounts share device ${deviceKey} (co-registration in user_devices — this alone proves shared-device CLAIMS, not where the votes were cast). ${provenance}`,
          memberIds,
          votes: rows.map((r) => ({
            pollId: r.poll_id,
            subjectKey: `${r.subject_type}:${r.subject_id}`,
            userIds: [...new Set(r.user_ids)],
            votedAts: r.voted_ats,
          })),
        }),
      );
    }

    // --- Heavy devices: ≥3 accounts on one device, votes or not (K1 WARN).
    for (const device of heavyDevices) {
      const users = [...new Set(device.user_ids)];
      if (users.length < HEAVY_DEVICE_MIN_ACCOUNTS) {
        continue;
      }
      if (byDevice.has(device.device_key)) {
        continue; // already reported above with its votes attached
      }
      const members = await this.describeMembers(users);
      findings.push({
        clusterKey: device.device_key,
        // No poll set → the plain forever-key is right: one nag per device.
        dedupeKey: `sybil:device:${device.device_key}`,
        kind: 'device_heavy',
        severity: 'warn',
        title: `Sybil signal: one device carries ${users.length} accounts`,
        body: [
          `Device ${device.device_key} carries ${users.length} accounts (no same-choice poll votes observed yet).`,
          `Members:`,
          ...members,
          `Decision: watch — the K1 sentence flags ≥${HEAVY_DEVICE_MIN_ACCOUNTS} accounts per device regardless of votes.`,
        ].join('\n'),
      });
    }

    // --- (b) TIMING-corroborated IP clusters. Shared IP alone NEVER
    // triggers (K1 sentence): a group only reports when ≥2 accounts on one
    // subnet cast the SAME choice on the SAME poll within the timing window.
    // The ballot is STANDING (un-endorse deletes the endorsement while the
    // append-only signal stays), so retracted/changed votes must not
    // cluster: keep only rows whose (user, poll, subject) endorsement still
    // exists.
    const liveRows = await this.filterToLiveEndorsements(ipVoteRows);
    const ipGroups = new Map<string, IpVoteRow[]>();
    for (const row of liveRows) {
      const key = `${row.ip_subnet_hmac}|${row.poll_id}|${row.endorsed_subject_id}`;
      const list = ipGroups.get(key) ?? [];
      list.push(row);
      ipGroups.set(key, list);
    }
    for (const rows of ipGroups.values()) {
      const users = [...new Set(rows.map((r) => r.user_id))];
      if (users.length < SAME_DEVICE_SAME_CHOICE_MIN_ACCOUNTS) {
        continue;
      }
      // Inner-window scan, NOT total span: a single delayed honest vote in
      // the group must not suppress a tight bot burst inside it. Report if
      // ANY subset of ≥2 distinct users falls within the window; cluster
      // members = the users inside the tightest qualifying window.
      const window = this.tightestQualifyingWindow(rows);
      if (!window) {
        continue; // IP-only, no timing corroboration → nothing, by law.
      }
      const { windowRows, windowUsers, spanMs, outsideCount } = window;
      const first = rows[0];
      const clusterKey = createHash('sha256')
        .update([...windowUsers].sort().join(','))
        .digest('hex')
        .slice(0, CLUSTER_KEY_HASH_LENGTH);
      const outsideNote =
        outsideCount > 0
          ? ` (${outsideCount} additional same-choice vote${outsideCount === 1 ? '' : 's'} on this subnet fall OUTSIDE the window — listed users are the in-window cluster only)`
          : '';
      findings.push(
        await this.buildVoteClusterFinding({
          clusterKey,
          kind: 'ip_timing',
          lockstepFact: `same /24-/48 subnet (hmac ${first.ip_subnet_hmac.slice(0, 12)}…), same choice, within ${Math.round(spanMs / 60000)} min${outsideNote}`,
          memberIds: windowUsers,
          votes: [
            {
              pollId: first.poll_id,
              subjectKey: first.endorsed_subject_type
                ? `${first.endorsed_subject_type}:${first.endorsed_subject_id}`
                : first.endorsed_subject_id,
              userIds: windowUsers,
              votedAts: windowRows.map((r) => r.occurred_at),
            },
          ],
        }),
      );
    }

    for (const finding of findings) {
      this.opsAlerts.emit({
        severity: finding.severity,
        kind: 'sybil_cluster',
        title: finding.title,
        body: finding.body,
        dedupeKey: finding.dedupeKey,
      });
    }
    return findings;
  }

  /** Severity per the K1 sentence: CRITICAL iff un-counting the cluster
   *  flips some poll's current leader; else WARN. Builds the 2-minute
   *  review artifact body. */
  private async buildVoteClusterFinding(cluster: {
    clusterKey: string;
    kind: 'device' | 'ip_timing';
    lockstepFact: string;
    memberIds: string[];
    votes: Array<{
      pollId: string;
      subjectKey: string;
      userIds: string[];
      votedAts: Date[];
    }>;
  }): Promise<SybilClusterFinding> {
    const memberSet = new Set(cluster.memberIds);
    const pollIds = [...new Set(cluster.votes.map((v) => v.pollId))];
    // Per-poll-set dedupe: ops_alerts dedupe is a FOREVER unique column, so
    // a ring hitting a SECOND poll must mint a fresh key or it silently
    // collapses into the first (possibly acked) alert.
    const pollsHash = createHash('sha256')
      .update([...pollIds].sort().join(','))
      .digest('hex')
      .slice(0, POLLS_HASH_LENGTH);
    const dedupeKey = `sybil:${cluster.clusterKey}:${pollsHash}`;
    let flipped = false;
    const marginLines: string[] = [];
    for (const pollId of pollIds) {
      const { leaderWith, leaderWithout, withCounts, withoutCounts } =
        await this.leaderWithAndWithout(pollId, memberSet);
      const pollFlipped = leaderWith !== null && leaderWithout !== leaderWith;
      flipped = flipped || pollFlipped;
      marginLines.push(
        `Poll ${pollId}: leader WITH cluster = ${leaderWith ?? '(tie/none)'} [${withCounts}], WITHOUT = ${leaderWithout ?? '(tie/none)'} [${withoutCounts}]${pollFlipped ? ' → LEADER FLIPS' : ''}`,
      );
    }
    const members = await this.describeMembers(cluster.memberIds);
    const voteLines = cluster.votes.map((v) => {
      const times = v.votedAts.map((d) => d.toISOString());
      const spacing =
        v.votedAts.length > 1
          ? `${Math.round((Math.max(...v.votedAts.map((d) => d.getTime())) - Math.min(...v.votedAts.map((d) => d.getTime()))) / 60000)} min span`
          : 'single timestamp';
      return `Poll ${v.pollId} · choice ${v.subjectKey} · ${v.userIds.length} accounts · [${times.join(', ')}] (${spacing})`;
    });
    const severity: 'warn' | 'critical' = flipped ? 'critical' : 'warn';
    return {
      clusterKey: cluster.clusterKey,
      dedupeKey,
      kind: cluster.kind,
      severity,
      title: flipped
        ? `Sybil cluster FLIPS a poll leader (${cluster.memberIds.length} accounts)`
        : `Sybil cluster: ${cluster.memberIds.length} accounts, same choice (${cluster.kind})`,
      body: [
        `Lockstep: ${cluster.lockstepFact}`,
        `Members (account created-at):`,
        ...members,
        `Choices:`,
        ...voteLines,
        `Decision line:`,
        ...marginLines,
        `Ack = reviewed-legit (family-iPad answer). Confirmed ring → three-seam procedure (plans/vote-integrity-ladder.md).`,
      ].join('\n'),
    };
  }

  /** Leaderboard counts grouped by subject, with vs without the cluster's
   *  members — distinct-endorser counts over poll_endorsements (the vote
   *  channel this ladder protects; comment-derived endorsers unaffected by
   *  un-counting votes are out of scope for the flip test). */
  private async leaderWithAndWithout(
    pollId: string,
    memberIds: Set<string>,
  ): Promise<{
    leaderWith: string | null;
    leaderWithout: string | null;
    withCounts: string;
    withoutCounts: string;
  }> {
    const rows = await this.prisma.pollEndorsement.findMany({
      where: { pollId },
      select: { subjectType: true, subjectId: true, userId: true },
    });
    const votes: PollVoteSet[] = rows.map((r) => ({
      subjectKey: `${r.subjectType}:${r.subjectId}`,
      userId: r.userId,
    }));
    const count = (filtered: PollVoteSet[]): Map<string, number> => {
      const bySubject = new Map<string, Set<string>>();
      for (const v of filtered) {
        const set = bySubject.get(v.subjectKey) ?? new Set<string>();
        set.add(v.userId);
        bySubject.set(v.subjectKey, set);
      }
      return new Map(
        [...bySubject.entries()].map(([k, users]) => [k, users.size]),
      );
    };
    const leaderOf = (counts: Map<string, number>): string | null => {
      let best: string | null = null;
      let bestCount = -1;
      let tie = false;
      for (const [subject, n] of counts) {
        if (n > bestCount) {
          best = subject;
          bestCount = n;
          tie = false;
        } else if (n === bestCount) {
          tie = true;
        }
      }
      return tie ? null : best;
    };
    const fmt = (counts: Map<string, number>): string =>
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}=${n}`)
        .join(', ') || 'no votes';
    const withCounts = count(votes);
    const withoutCounts = count(votes.filter((v) => !memberIds.has(v.userId)));
    return {
      leaderWith: leaderOf(withCounts),
      leaderWithout: leaderOf(withoutCounts),
      withCounts: fmt(withCounts),
      withoutCounts: fmt(withoutCounts),
    };
  }

  /** Inner-window scan (two-pointer over time-sorted rows): find whether
   *  ANY subset of ≥2 DISTINCT users falls within IP_TIMING_WINDOW_MS, and
   *  return the tightest qualifying window — most distinct users, then
   *  smallest span. Total-span logic was wrong: one delayed honest vote on
   *  the subnet stretched the span and suppressed the bot burst inside it. */
  private tightestQualifyingWindow(rows: IpVoteRow[]): {
    windowRows: IpVoteRow[];
    windowUsers: string[];
    spanMs: number;
    outsideCount: number;
  } | null {
    const sorted = [...rows].sort(
      (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime(),
    );
    let best: {
      start: number;
      end: number;
      users: number;
      span: number;
    } | null = null;
    let j = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (j < i) {
        j = i;
      }
      while (
        j + 1 < sorted.length &&
        sorted[j + 1].occurred_at.getTime() - sorted[i].occurred_at.getTime() <=
          IP_TIMING_WINDOW_MS
      ) {
        j++;
      }
      const slice = sorted.slice(i, j + 1);
      const users = new Set(slice.map((r) => r.user_id)).size;
      if (users < SAME_DEVICE_SAME_CHOICE_MIN_ACCOUNTS) {
        continue;
      }
      const span =
        slice[slice.length - 1].occurred_at.getTime() -
        slice[0].occurred_at.getTime();
      if (
        !best ||
        users > best.users ||
        (users === best.users && span < best.span)
      ) {
        best = { start: i, end: j, users, span };
      }
    }
    if (!best) {
      return null;
    }
    const windowRows = sorted.slice(best.start, best.end + 1);
    return {
      windowRows,
      windowUsers: [...new Set(windowRows.map((r) => r.user_id))],
      spanMs: best.span,
      outsideCount: sorted.length - windowRows.length,
    };
  }

  /** Stale-vote filter: the signals ledger is append-only while the ballot
   *  is standing — un-endorsing (or switching choice) deletes the
   *  poll_endorsements row but never the signal. Keep only rows whose
   *  (user, poll, subject) endorsement STILL exists, so retracted votes
   *  can't cluster under their old choice. */
  private async filterToLiveEndorsements(
    rows: IpVoteRow[],
  ): Promise<IpVoteRow[]> {
    const pollIds = [...new Set(rows.map((r) => r.poll_id))];
    const live = new Set<string>();
    for (const pollId of pollIds) {
      const endorsements = await this.prisma.pollEndorsement.findMany({
        where: { pollId },
        select: { subjectType: true, subjectId: true, userId: true },
      });
      for (const e of endorsements) {
        live.add(`${pollId}|${e.subjectType}|${e.subjectId}|${e.userId}`);
      }
    }
    return rows.filter((r) => {
      // Older captures without endorsedSubjectType can't be matched by type;
      // fall back to matching any subjectType with that id.
      if (r.endorsed_subject_type) {
        return live.has(
          `${r.poll_id}|${r.endorsed_subject_type}|${r.endorsed_subject_id}|${r.user_id}`,
        );
      }
      return [...live].some((k) => {
        const [pollId, , subjectId, userId] = k.split('|');
        return (
          pollId === r.poll_id &&
          subjectId === r.endorsed_subject_id &&
          userId === r.user_id
        );
      });
    });
  }

  /** Artifact-honesty helper: does the per-vote deviceKeyHmac (captured in
   *  signals meta) match the shared device from user_devices? Compares
   *  hmacDeviceKey(user_devices.device_key) against the votes' meta hmacs.
   *  Absence of captures (or of the hmac key) is stated, never guessed. */
  private async describeVoteProvenance(
    deviceKey: string,
    userIds: string[],
    pollIds: string[],
  ): Promise<string> {
    const expected = hmacDeviceKey(deviceKey);
    if (!expected) {
      return 'Vote provenance: unknown (SIGNAL_AUDIT_HMAC_KEY unset — cannot compare per-vote device hmacs).';
    }
    let hmacRows: Array<{ user_id: string; device_key_hmac: string }>;
    try {
      hmacRows = await this.prisma.$queryRaw<
        Array<{ user_id: string; device_key_hmac: string }>
      >`
        SELECT DISTINCT sa.user_id::text AS user_id,
               s.meta->>'deviceKeyHmac' AS device_key_hmac
        FROM signals s
        JOIN signal_actors sa ON sa.actor_id = s.actor_id
        WHERE s.kind = 'poll_vote'
          AND s.meta ? 'deviceKeyHmac'
          AND s.meta->>'pollId' = ANY(${pollIds})
          AND sa.user_id::text = ANY(${userIds})
      `;
    } catch {
      return 'Vote provenance: unknown (per-vote device-hmac lookup failed).';
    }
    if (!hmacRows?.length) {
      return 'Vote provenance: no per-vote deviceKeyHmac captured for these votes — the shared device is proven by user_devices co-registration only, not by where the votes were cast.';
    }
    const matching = new Set(
      hmacRows
        .filter((r) => r.device_key_hmac === expected)
        .map((r) => r.user_id),
    );
    const captured = new Set(hmacRows.map((r) => r.user_id));
    return `Vote provenance: ${matching.size}/${captured.size} accounts with captured vote device-hmacs match the shared device${matching.size === captured.size ? ' (votes cast FROM this device)' : ' — the rest voted from OTHER devices'}.`;
  }

  private async describeMembers(userIds: string[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, createdAt: true },
    });
    const byId = new Map(users.map((u) => [u.userId, u.createdAt]));
    return userIds.map(
      (id) => `- ${id} (created ${byId.get(id)?.toISOString() ?? 'unknown'})`,
    );
  }

  // ---- SQL fetchers (mocked in order by the spec's fake prisma) ----------

  /** DEVICE clusters: multi-account devices whose accounts endorsed the SAME
   *  subject on the SAME poll — the K1 WARN trigger. */
  private fetchDeviceVoteClusters(): Promise<DeviceVoteClusterRow[]> {
    return this.prisma.$queryRaw<DeviceVoteClusterRow[]>`
      SELECT ud.device_key,
             pe.poll_id::text AS poll_id,
             pe.subject_type::text AS subject_type,
             pe.subject_id,
             array_agg(DISTINCT pe.user_id::text) AS user_ids,
             array_agg(pe.created_at ORDER BY pe.created_at) AS voted_ats
      FROM user_devices ud
      JOIN poll_endorsements pe ON pe.user_id = ud.user_id
      WHERE ud.device_key IN (
        SELECT device_key FROM user_devices
        GROUP BY device_key
        HAVING COUNT(DISTINCT user_id) >= ${SAME_DEVICE_SAME_CHOICE_MIN_ACCOUNTS}
      )
      GROUP BY ud.device_key, pe.poll_id, pe.subject_type, pe.subject_id
      HAVING COUNT(DISTINCT pe.user_id) >= ${SAME_DEVICE_SAME_CHOICE_MIN_ACCOUNTS}
    `;
  }

  /** Devices carrying ≥3 accounts, votes or not (K1 WARN regardless). */
  private fetchHeavyDevices(): Promise<HeavyDeviceRow[]> {
    return this.prisma.$queryRaw<HeavyDeviceRow[]>`
      SELECT device_key,
             array_agg(DISTINCT user_id::text) AS user_ids
      FROM user_devices
      GROUP BY device_key
      HAVING COUNT(DISTINCT user_id) >= ${HEAVY_DEVICE_MIN_ACCOUNTS}
    `;
  }

  /** Raw poll_vote audit rows carrying a subnet hmac — the timing/choice
   *  corroboration happens in JS so the K1 "IP alone never triggers" law is
   *  spec-provable (RED-able). */
  private fetchIpVoteRows(): Promise<IpVoteRow[]> {
    return this.prisma.$queryRaw<IpVoteRow[]>`
      SELECT s.meta->>'ipSubnetHmac' AS ip_subnet_hmac,
             s.meta->>'pollId' AS poll_id,
             s.meta->>'endorsedSubjectId' AS endorsed_subject_id,
             s.meta->>'endorsedSubjectType' AS endorsed_subject_type,
             sa.user_id::text AS user_id,
             s.occurred_at
      FROM signals s
      JOIN signal_actors sa ON sa.actor_id = s.actor_id
      WHERE s.kind = 'poll_vote'
        AND s.meta ? 'ipSubnetHmac'
        AND s.meta ? 'pollId'
        AND sa.user_id IS NOT NULL
        AND s.occurred_at >= now() - make_interval(days => ${SWEEP_LOOKBACK_DAYS})
    `;
  }
}
