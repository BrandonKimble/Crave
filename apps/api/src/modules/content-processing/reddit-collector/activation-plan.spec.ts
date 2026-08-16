/**
 * F9976 mutation proofs: a resumed activation must not re-flip from a
 * recomputed (empty) plan, must not overwrite the recovery artifact, and a
 * completed activation must not leave a stale plan to replay.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  consumeActivationPlan,
  resolveActivationPlan,
} from './activation-plan';

const dir = mkdtempSync(join(tmpdir(), 'activation-plan-'));
const planPath = join(dir, 'plan.json');

const computed = {
  plan: [{ runId: 'run-1', documentIds: ['d1', 'd2'] }],
  placeIds: ['r1'],
};

afterEach(() => {
  consumeActivationPlan(planPath);
});

describe('the activation plan artifact (F9976)', () => {
  it('first run computes, persists, and reports not-resumed', async () => {
    const compute = jest.fn().mockResolvedValue(computed);
    const { plan, resumed } = await resolveActivationPlan({
      planPath,
      promptVersion: 2,
      communities: ['austinfood'],
      compute,
    });
    expect(resumed).toBe(false);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(plan.plan).toEqual(computed.plan);
    expect(existsSync(planPath)).toBe(true);
  });

  it('a resume READS the artifact — never recomputes, never overwrites', async () => {
    writeFileSync(
      planPath,
      JSON.stringify({
        promptVersion: 2,
        communities: ['austinfood'],
        ...computed,
      }),
    );
    // The F9976 failure mode: activation already flipped the pointers, so a
    // recompute returns EMPTY. If resume consulted it, the rebuild would
    // skip every flipped run and the artifact would be clobbered.
    const emptyRecompute = jest
      .fn()
      .mockResolvedValue({ plan: [], placeIds: [] });
    const { plan, resumed } = await resolveActivationPlan({
      planPath,
      promptVersion: 2,
      communities: ['austinfood'],
      compute: emptyRecompute,
    });
    expect(resumed).toBe(true);
    expect(emptyRecompute).not.toHaveBeenCalled();
    expect(plan.plan).toEqual(computed.plan);
    expect(plan.placeIds).toEqual(['r1']);
    // artifact intact, byte-for-byte
    const onDisk = JSON.parse(
      readFileSync(planPath, 'utf-8'),
    ) as import('./activation-plan').ActivationPlan;
    expect(onDisk.plan).toEqual(computed.plan);
  });

  it('refuses to resume a DIFFERENT activation (version or communities mismatch)', async () => {
    writeFileSync(
      planPath,
      JSON.stringify({
        promptVersion: 3,
        communities: ['foodnyc'],
        ...computed,
      }),
    );
    await expect(
      resolveActivationPlan({
        planPath,
        promptVersion: 2,
        communities: ['austinfood'],
        compute: jest.fn(),
      }),
    ).rejects.toThrow(/refusing to mix plans/);
  });

  it('success consumes the artifact so it cannot replay as a stale resume', async () => {
    await resolveActivationPlan({
      planPath,
      promptVersion: 2,
      communities: ['austinfood'],
      compute: jest.fn().mockResolvedValue(computed),
    });
    consumeActivationPlan(planPath);
    expect(existsSync(planPath)).toBe(false);
    // and consuming an absent artifact is a no-op, not a crash
    expect(() => consumeActivationPlan(planPath)).not.toThrow();
  });
});
