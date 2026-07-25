/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
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
}) {
  const prisma = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce(options.deviceVoteRows ?? [])
      .mockResolvedValueOnce(options.heavyDeviceRows ?? [])
      .mockResolvedValueOnce(options.ipVoteRows ?? []),
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
        dedupeKey: 'sybil:device-aaaa',
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
          user_id: 'u1',
          occurred_at: new Date('2026-07-20T01:00:00Z'),
        },
        {
          ip_subnet_hmac: 'subnet-x',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-A',
          user_id: 'u2',
          occurred_at: new Date('2026-07-20T09:00:00Z'),
        },
        // Same subnet within minutes but DIFFERENT choices: no cluster.
        {
          ip_subnet_hmac: 'subnet-y',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-A',
          user_id: 'u3',
          occurred_at: T(0),
        },
        {
          ip_subnet_hmac: 'subnet-y',
          poll_id: 'poll-3',
          endorsed_subject_id: 'sub-B',
          user_id: 'u4',
          occurred_at: T(2),
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
          endorsed_subject_id: 'entity:sub-B',
          user_id: 'u1',
          occurred_at: T(0),
        },
        {
          ip_subnet_hmac: 'subnet-z',
          poll_id: 'poll-4',
          endorsed_subject_id: 'entity:sub-B',
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
    expect(call.dedupeKey).toMatch(/^sybil:[0-9a-f]{40}$/);
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
      expect.objectContaining({ dedupeKey: 'sybil:device-heavy' }),
    );
  });
});
