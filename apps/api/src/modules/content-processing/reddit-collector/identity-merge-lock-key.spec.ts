/**
 * H3 identity mutual exclusion — ONE lock-key namespace (red-team lens 1,
 * 2026-08-17).
 *
 * The defect this pins: the merge services free-composed
 * 'entity:food:<key>' / 'entity:restaurant:<key>' while the creator path
 * composed 'entity:<live enum>:<key>' ('item'/'place') — two namespaces,
 * so a creator could adopt a loser mid-merge. Compiles clean; only a
 * key-equality assertion catches it.
 *
 * Two layers, both mutation-capable:
 *  1. BEHAVIORAL — the creator's key derivation and the merge lock
 *     acquisition are driven against a capturing tx and must hash the
 *     IDENTICAL string for both entity types, in the live-enum namespace
 *     (never the dead food/restaurant one).
 *  2. STRUCTURAL — the source scan the lens said would have caught all
 *     four residues: no free-composed 'entity:' lock template exists
 *     outside identityMergeLockKey, and no dead-namespace literal exists
 *     anywhere in src.
 */
import * as fs from 'fs';
import * as path from 'path';
import { EntityType, Prisma } from '@prisma/client';
import {
  acquireIdentityMergeLocks,
  identityMergeLockKey,
} from './extraction-scope.service';
import { entityLockKey } from '../entity-resolver/entity-identity';

type CapturedKeys = string[];

function capturingTx(captured: CapturedKeys): Prisma.TransactionClient {
  return {
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => {
      captured.push(String(values[0]));
      return Promise.resolve(0);
    },
  } as unknown as Prisma.TransactionClient;
}

describe('identity merge lock namespace (H3)', () => {
  it.each([
    ['item', EntityType.item, 'Franklin Brisket'],
    ['place', EntityType.place, 'Franklin Barbecue'],
  ] as const)(
    'creator and merger contend on the SAME advisory-lock key for %s',
    async (_label, entityType, name) => {
      // Creator side (unified-processing.service.ts): the key it hashes.
      const creatorKey = identityMergeLockKey(
        entityType,
        entityLockKey(name, entityType),
      );

      // Merger side (food-dedupe / restaurant-entity-merge): what
      // acquireIdentityMergeLocks actually sends to pg_advisory_xact_lock.
      const captured: CapturedKeys = [];
      await acquireIdentityMergeLocks(capturingTx(captured), entityType, [
        entityLockKey(name, entityType),
      ]);

      expect(captured).toEqual([creatorKey]);
      // Live-enum namespace, never the dead one that split the lock space.
      expect(creatorKey.startsWith(`entity:${entityType}:`)).toBe(true);
      expect(creatorKey.startsWith('entity:food:')).toBe(false);
      expect(creatorKey.startsWith('entity:restaurant:')).toBe(false);
    },
  );

  it('sorts lock keys so overlapping merges cannot deadlock', async () => {
    const captured: CapturedKeys = [];
    await acquireIdentityMergeLocks(capturingTx(captured), EntityType.item, [
      'zzz',
      'aaa',
    ]);
    expect(captured).toEqual([
      identityMergeLockKey(EntityType.item, 'aaa'),
      identityMergeLockKey(EntityType.item, 'zzz'),
    ]);
  });

  describe('structural: no free-composed lock strings survive', () => {
    const SRC_ROOT = path.resolve(__dirname, '../../..');
    const THE_ONE_HOME = path.resolve(__dirname, 'extraction-scope.service.ts');

    function walk(dir: string, out: string[] = []): string[] {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.ts$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name))
          out.push(full);
      }
      return out;
    }

    it('exactly one `entity:${...}` composition exists — inside identityMergeLockKey', () => {
      const offenders: string[] = [];
      for (const file of walk(SRC_ROOT)) {
        const source = fs.readFileSync(file, 'utf8');
        if (source.includes('`entity:${') && file !== THE_ONE_HOME) {
          offenders.push(file);
        }
      }
      expect(offenders).toEqual([]);
      expect(fs.readFileSync(THE_ONE_HOME, 'utf8')).toContain(
        'return `entity:${entityType}:${key}`;',
      );
    });

    it('the dead food/restaurant lock namespaces appear in no code path', () => {
      const deadNamespaces = [
        'entity:food:${',
        "entity:food:'",
        '`entity:food:',
        '`entity:restaurant:',
        "entity:restaurant:'",
      ];
      const offenders: string[] = [];
      for (const file of walk(SRC_ROOT)) {
        const source = fs.readFileSync(file, 'utf8');
        if (deadNamespaces.some((needle) => source.includes(needle))) {
          offenders.push(file);
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});
