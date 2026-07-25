/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { createHmac } from 'crypto';
import { SybilClusterReportService } from './sybil-cluster-report.service';

/**
 * RED-able checks on the K1 escalation sentence (ratified 2026-07-24,
 * plans/vote-integrity-ladder.md):
 * - ≥2 same-device accounts, same choice → WARN;
 * - un-counting the cluster flips the leader → CRITICAL;
 * - shared IP WITHOUT timing corroboration → NOTHING;
 * - a single-account device → NOTHING (even if the SQL misbehaved).
 * The fake prisma queues $queryRaw responses in the service's documented
 * fetch order: device-vote clusters, heavy devices, ip vote rows.
 */

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

type EndorsementRow = {
  pollId: string;
  subjectType: string;
  subjectId: string;
  userId: string;
};

function buildHarness(options: {
  deviceVoteRows?: unknown[];
  heavyDeviceRows?: unknown[];
  ipVoteRows?: unknown[];
  endorsements?: EndorsementRow[];
  /** Rows for the (optional, key-gated) vote-provenance hmac lookup. */
  provenanceRows?: unknown[];
}) {
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce(options.deviceVoteRows ?? [])
      .mockResolvedValueOnce(options.heavyDeviceRows ?? [])
      .mockResolvedValueOnce(options.ipVoteRows ?? [])
      // Any further raw queries (device-cluster provenance lookups).
      .mockResolvedValue(options.provenanceRows ?? []),
    pollEndorsement: {
      findMany: jest.fn(({ where }: { where: { pollId: string } }) =>
        Promise.resolve(
          (options.endorsements ?? []).filter((e) => e.pollId === where.pollId),
        ),
      ),
    },
    user: {
      findMany: jest.fn(({ where }: { where: { userId: { in: string[] } } }) =>
        Promise.resolve(
          where.userId.in.map((userId) => ({
            userId,
            createdAt: new Date('2026-07-01T00:00:00Z'),
          })),
        ),
      ),
    },
  };
  const opsAlerts = { emit: jest.fn() };
  const service = new SybilClusterReportService(
    prisma as never,
    opsAlerts as never,
    stubLogger() as never,
  );
  return { service, prisma, opsAlerts };
}

const T = (minute: number) => new Date(Date.UTC(2026, 6, 20, 12, minute, 0));

describe('SybilClusterReportService (K1 sentence)', () => {
  beforeEach(() => {
    // Provenance comparison is key-gated; specs that exercise it set the
    // env themselves. Default: unset, so device clusters state "unknown".
    delete process.env.SIGNAL_AUDIT_HMAC_KEY;
  });

  it('emits WARN for a 2-account same-device same-choice cluster that does not flip the leader', async () => {
    const { service, opsAlerts } = buildHarness({
      deviceVoteRows: [
        {
          device_key: 'device-aaaa',
          poll_id: 'poll-1',
          subject_type: 'entity',
          subject_id: 'sub-B',
          user_ids: ['u1', 'u2'],
          voted_ats: [T(0), T(3)],
        },
      ],
      // Leader sub-A holds with or without the cluster (4 vs 2-then-0).
      endorsements: [
        ...['a1', 'a2', 'a3', 'a4'].map((userId) => ({
          pollId: 'poll-1',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId,
        })),
        {
          pollId: 'poll-1',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u1',
        },
        {
          pollId: 'poll-1',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u2',
        },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warn');
    expect(opsAlerts.emit).toHaveBeenCalledTimes(1);
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        kind: 'sybil_cluster',
        // Per-poll-set dedupe: clusterKey + hash of the sorted pollIds.
        dedupeKey: expect.stringMatching(/^sybil:device-aaaa:[0-9a-f]{12}$/),
      }),
    );
    // 2-minute review artifact essentials.
    const body = (opsAlerts.emit.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('u1');
    expect(body).toContain('created 2026-07-01');
    expect(body).toContain('leader WITH cluster');
  });

  it('escalates to CRITICAL when un-counting the cluster flips the poll leader', async () => {
    const { service, opsAlerts } = buildHarness({
      deviceVoteRows: [
        {
          device_key: 'device-bbbb',
          poll_id: 'poll-2',
          subject_type: 'entity',
          subject_id: 'sub-B',
          user_ids: ['u1', 'u2', 'u3'],
          voted_ats: [T(0), T(1), T(2)],
        },
      ],
      // WITH cluster: sub-B leads 3-2; WITHOUT: sub-A leads 2-0 → flip.
      endorsements: [
        {
          pollId: 'poll-2',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId: 'h1',
        },
        {
          pollId: 'poll-2',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId: 'h2',
        },
        {
          pollId: 'poll-2',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u1',
        },
        {
          pollId: 'poll-2',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u2',
        },
        {
          pollId: 'poll-2',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u3',
        },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' }),
    );
    const body = (opsAlerts.emit.mock.calls[0][0] as { body: string }).body;
    expect(body).toContain('LEADER FLIPS');
  });

  it('emits NOTHING for an IP-only cluster (shared subnet without timing corroboration)', async () => {
    const { service, opsAlerts } = buildHarness({
      // Same subnet, same poll, same choice — but hours apart: no cluster.
      ipVoteRows: [
        {
          ip_subnet_hmac: 'subnet-x',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-A',
          endorsed_subject_type: 'entity',
          user_id: 'u1',
          occurred_at: new Date('2026-07-20T01:00:00Z'),
        },
        {
          ip_subnet_hmac: 'subnet-x',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-A',
          endorsed_subject_type: 'entity',
          user_id: 'u2',
          occurred_at: new Date('2026-07-20T09:00:00Z'),
        },
        // Same subnet within minutes but DIFFERENT choices: no cluster.
        {
          ip_subnet_hmac: 'subnet-y',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-A',
          endorsed_subject_type: 'entity',
          user_id: 'u3',
          occurred_at: T(0),
        },
        {
          ip_subnet_hmac: 'subnet-y',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'u4',
          occurred_at: T(2),
        },
      ],
      // All four ballots still standing — the timing/choice law alone must
      // reject these (RED-able against a broken stale-filter shortcut).
      endorsements: [
        {
          pollId: 'poll-3',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId: 'u1',
        },
        {
          pollId: 'poll-3',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId: 'u2',
        },
        {
          pollId: 'poll-3',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId: 'u3',
        },
        {
          pollId: 'poll-3',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u4',
        },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(0);
    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('emits WARN for a timing-corroborated IP cluster (same subnet, same choice, minutes apart)', async () => {
    const { service, opsAlerts } = buildHarness({
      ipVoteRows: [
        {
          ip_subnet_hmac: 'subnet-z',
          poll_id: 'poll-4',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'u1',
          occurred_at: T(0),
        },
        {
          ip_subnet_hmac: 'subnet-z',
          poll_id: 'poll-4',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'u2',
          occurred_at: T(4),
        },
      ],
      endorsements: [
        ...['a1', 'a2', 'a3'].map((userId) => ({
          pollId: 'poll-4',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId,
        })),
        {
          pollId: 'poll-4',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u1',
        },
        {
          pollId: 'poll-4',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u2',
        },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].kind).toBe('ip_timing');
    const call = opsAlerts.emit.mock.calls[0][0] as { dedupeKey: string };
    expect(call.dedupeKey).toMatch(/^sybil:[0-9a-f]{40}:[0-9a-f]{12}$/);
  });

  it('emits NOTHING for a single-account device even if a malformed row arrives', async () => {
    const { service, opsAlerts } = buildHarness({
      deviceVoteRows: [
        {
          device_key: 'device-solo',
          poll_id: 'poll-5',
          subject_type: 'entity',
          subject_id: 'sub-A',
          user_ids: ['u1', 'u1'], // one distinct account
          voted_ats: [T(0), T(1)],
        },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(0);
    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('flags a device carrying >=3 accounts even without any votes (WARN)', async () => {
    const { service, opsAlerts } = buildHarness({
      heavyDeviceRows: [
        { device_key: 'device-heavy', user_ids: ['u1', 'u2', 'u3'] },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('device_heavy');
    expect(findings[0].severity).toBe('warn');
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeKey: 'sybil:device:device-heavy' }),
    );
  });

  it('still emits the 2-bot cluster when a delayed honest vote stretches the total span (inner-window scan)', async () => {
    // RED against the old total-span logic: two bots 5 min apart + one
    // honest same-subnet same-choice vote 2 DAYS later. Total span ≫ 30
    // min, so span-logic suppressed the cluster; the inner window must
    // still find the 2-bot burst.
    const { service, opsAlerts } = buildHarness({
      ipVoteRows: [
        {
          ip_subnet_hmac: 'subnet-q',
          poll_id: 'poll-6',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'bot1',
          occurred_at: T(0),
        },
        {
          ip_subnet_hmac: 'subnet-q',
          poll_id: 'poll-6',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'bot2',
          occurred_at: T(5),
        },
        {
          ip_subnet_hmac: 'subnet-q',
          poll_id: 'poll-6',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'honest',
          occurred_at: new Date('2026-07-22T12:00:00Z'), // 2 days later
        },
      ],
      endorsements: [
        ...['a1', 'a2', 'a3', 'a4'].map((userId) => ({
          pollId: 'poll-6',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId,
        })),
        ...['bot1', 'bot2', 'honest'].map((userId) => ({
          pollId: 'poll-6',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId,
        })),
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('ip_timing');
    const body = findings[0].body;
    // Cluster members = the tightest in-window users only.
    expect(body).toContain('- bot1');
    expect(body).toContain('- bot2');
    expect(body).not.toContain('- honest');
    // Artifact notes the additional same-choice vote outside the window.
    expect(body).toContain('OUTSIDE the window');
    expect(opsAlerts.emit).toHaveBeenCalledTimes(1);
  });

  it('mints a different dedupeKey when the same users hit a different poll', async () => {
    const mkRow = (pollId: string, userId: string, at: Date) => ({
      ip_subnet_hmac: 'subnet-r',
      poll_id: pollId,
      endorsed_subject_id: 'sub-B',
      endorsed_subject_type: 'entity',
      user_id: userId,
      occurred_at: at,
    });
    const mkEndorse = (pollId: string, subjectId: string, userId: string) => ({
      pollId,
      subjectType: 'entity',
      subjectId,
      userId,
    });
    const { service } = buildHarness({
      ipVoteRows: [
        mkRow('poll-A', 'u1', T(0)),
        mkRow('poll-A', 'u2', T(2)),
        mkRow('poll-B', 'u1', T(10)),
        mkRow('poll-B', 'u2', T(12)),
      ],
      endorsements: [
        mkEndorse('poll-A', 'sub-B', 'u1'),
        mkEndorse('poll-A', 'sub-B', 'u2'),
        mkEndorse('poll-B', 'sub-B', 'u1'),
        mkEndorse('poll-B', 'sub-B', 'u2'),
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(2);
    // Same ring (same clusterKey) but per-poll dedupe keys — the second
    // poll must NOT collapse into the first (possibly acked) alert.
    expect(findings[0].clusterKey).toBe(findings[1].clusterKey);
    expect(findings[0].dedupeKey).not.toBe(findings[1].dedupeKey);
  });

  it('does not cluster a switched vote under its old choice (standing-ballot filter)', async () => {
    const { service, opsAlerts } = buildHarness({
      // The ledger says u1+u2 both voted sub-B minutes apart — but u2 has
      // since SWITCHED to sub-A (old endorsement row deleted).
      ipVoteRows: [
        {
          ip_subnet_hmac: 'subnet-s',
          poll_id: 'poll-7',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'u1',
          occurred_at: T(0),
        },
        {
          ip_subnet_hmac: 'subnet-s',
          poll_id: 'poll-7',
          endorsed_subject_id: 'sub-B',
          endorsed_subject_type: 'entity',
          user_id: 'u2',
          occurred_at: T(4),
        },
      ],
      endorsements: [
        {
          pollId: 'poll-7',
          subjectType: 'entity',
          subjectId: 'sub-B',
          userId: 'u1',
        },
        {
          pollId: 'poll-7',
          subjectType: 'entity',
          subjectId: 'sub-A',
          userId: 'u2',
        },
      ],
    });
    const findings = await service.runSweep();
    expect(findings).toHaveLength(0);
    expect(opsAlerts.emit).not.toHaveBeenCalled();
  });

  it('reports vote provenance from per-vote deviceKeyHmac when the key is set', async () => {
    process.env.SIGNAL_AUDIT_HMAC_KEY = 'test-audit-key';
    try {
      const expected = createHmac('sha256', 'test-audit-key')
        .update('device-aaaa')
        .digest('hex');
      const { service } = buildHarness({
        deviceVoteRows: [
          {
            device_key: 'device-aaaa',
            poll_id: 'poll-1',
            subject_type: 'entity',
            subject_id: 'sub-B',
            user_ids: ['u1', 'u2'],
            voted_ats: [T(0), T(3)],
          },
        ],
        endorsements: [
          {
            pollId: 'poll-1',
            subjectType: 'entity',
            subjectId: 'sub-B',
            userId: 'u1',
          },
          {
            pollId: 'poll-1',
            subjectType: 'entity',
            subjectId: 'sub-B',
            userId: 'u2',
          },
        ],
        provenanceRows: [
          { user_id: 'u1', device_key_hmac: expected },
          { user_id: 'u2', device_key_hmac: 'some-other-device-hmac' },
        ],
      });
      const findings = await service.runSweep();
      expect(findings).toHaveLength(1);
      // Honesty: sharing ≠ provenance; only u1's vote hmac matches.
      expect(findings[0].body).toContain('Vote provenance: 1/2');
      expect(findings[0].body).toContain('shared-device CLAIMS');
    } finally {
      delete process.env.SIGNAL_AUDIT_HMAC_KEY;
    }
  });
});
