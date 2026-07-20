/**
 * §22 item 8 score-cut specs over the scorer itself:
 *  - per-source calibration composes INSIDE log1p (§8);
 *  - K6 ballot composition: a poll_surface source's mentions score exactly
 *    like reddit mentions modulo its OWN A (influence default 1.0);
 *  - scoring provenance = dominant calibrated source (§5), never
 *    unattributed mass;
 *  - ONE scoreVersion: epoch pins derive once and are NEVER re-derived
 *    within a version (re-pin requires a bump).
 */
import { PublicCraveScoreService } from './public-crave-score.service';
import {
  CraveScoreCandidates,
  SourceContribution,
} from './public-crave-score.types';
import { buildCalibrationIndex } from './score-calibration';

const logger = {
  setContext: jest.fn().mockReturnThis(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function buildService(prisma: unknown = {}): PublicCraveScoreService {
  return new PublicCraveScoreService(prisma as never, logger as never);
}

const room = (
  sourceId: string | null,
  platform: string | null,
  mentions: number,
  upvotes: number,
): SourceContribution => ({ sourceId, platform, mentions, upvotes });

/** Percentile fillers so the subjects under test sit in a real population. */
function withFillers(candidates: CraveScoreCandidates): CraveScoreCandidates {
  const dishes = [...candidates.dishes];
  const restaurants = [...candidates.restaurants];
  for (let i = 0; i < 10; i += 1) {
    const id = `filler-${i}`;
    restaurants.push({ restaurantId: id, praiseContributions: [] });
    dishes.push({
      connectionId: `${id}-dish`,
      restaurantId: id,
      contributions: [room(null, null, i + 1, i)],
    });
  }
  return { dishes, restaurants };
}

describe('scoreCandidates — §8 per-source calibration', () => {
  const service = buildService();
  const config = service.getConfig();

  it('with no calibration index the math is raw v3: log1p(m + 0.7u)', () => {
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-a',
            restaurantId: 'rest-a',
            contributions: [room(null, null, 3, 10)],
          },
        ],
        restaurants: [{ restaurantId: 'rest-a', praiseContributions: [] }],
      }),
      config,
    );
    const dish = scored.find((row) => row.subjectId === 'dish-a')!;
    expect(dish.endorsementRaw).toBeCloseTo(Math.log1p(3 + 0.7 * 10), 5);
  });

  it('each mention is divided by the g of ITS OWN source, INSIDE log1p', () => {
    // src-big: A=40 vs ref 10 → g=4; src-small: A=5, floor 2 → g=0.5.
    const index = buildCalibrationIndex('stable', { aRef: 10, aFloor: 2 }, [
      {
        sourceId: 'src-big',
        platform: 'reddit',
        anchorPlaceId: null,
        engineId: 'e1',
        activity: { stable: 40, fast: 40 },
      },
      {
        sourceId: 'src-small',
        platform: 'reddit',
        anchorPlaceId: null,
        engineId: 'e2',
        activity: { stable: 5, fast: 5 },
      },
    ]);
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-a',
            restaurantId: 'rest-a',
            contributions: [
              room('src-big', 'reddit', 8, 10),
              room('src-small', 'reddit', 1, 0),
            ],
          },
        ],
        restaurants: [{ restaurantId: 'rest-a', praiseContributions: [] }],
      }),
      config,
      index,
    );
    const dish = scored.find((row) => row.subjectId === 'dish-a')!;
    const expected = Math.log1p((8 + 0.7 * 10) / 4 + (1 + 0.7 * 0) / 0.5);
    expect(dish.endorsementRaw).toBeCloseTo(expected, 5);
  });

  it('K6 ballot composition: a poll_surface mention scores exactly like a reddit mention when the rooms measure the same A (influence default 1.0)', () => {
    const index = buildCalibrationIndex('stable', { aRef: 10, aFloor: 2 }, [
      {
        sourceId: 'src-reddit',
        platform: 'reddit',
        anchorPlaceId: null,
        engineId: 'e1',
        activity: { stable: 10, fast: 10 },
      },
      {
        sourceId: 'src-poll',
        platform: 'poll_surface',
        anchorPlaceId: 'place-1',
        engineId: null,
        activity: { stable: 10, fast: 10 },
      },
    ]);
    // Two distinct-voter ballot mentions (m=1 each, NO upvote term) vs two
    // reddit mentions with zero upvotes: identical calibrated mass.
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-poll',
            restaurantId: 'rest-poll',
            contributions: [room('src-poll', 'poll_surface', 2, 0)],
          },
          {
            connectionId: 'dish-reddit',
            restaurantId: 'rest-reddit',
            contributions: [room('src-reddit', 'reddit', 2, 0)],
          },
        ],
        restaurants: [
          { restaurantId: 'rest-poll', praiseContributions: [] },
          { restaurantId: 'rest-reddit', praiseContributions: [] },
        ],
      }),
      config,
      index,
    );
    const poll = scored.find((row) => row.subjectId === 'dish-poll')!;
    const reddit = scored.find((row) => row.subjectId === 'dish-reddit')!;
    expect(poll.endorsementRaw).toBeCloseTo(reddit.endorsementRaw, 10);
    expect(poll.displayScore).toBe(reddit.displayScore);
  });

  it('K6 ballot in a QUIETER room outweighs the same mentions in a bigger room (modulo its own A)', () => {
    const index = buildCalibrationIndex('stable', { aRef: 10, aFloor: 2 }, [
      {
        sourceId: 'src-reddit',
        platform: 'reddit',
        anchorPlaceId: null,
        engineId: 'e1',
        activity: { stable: 40, fast: 40 },
      },
      {
        sourceId: 'src-poll',
        platform: 'poll_surface',
        anchorPlaceId: 'place-1',
        engineId: null,
        activity: { stable: 10, fast: 10 },
      },
    ]);
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-poll',
            restaurantId: 'rest-poll',
            contributions: [room('src-poll', 'poll_surface', 2, 0)],
          },
          {
            connectionId: 'dish-reddit',
            restaurantId: 'rest-reddit',
            contributions: [room('src-reddit', 'reddit', 2, 0)],
          },
        ],
        restaurants: [
          { restaurantId: 'rest-poll', praiseContributions: [] },
          { restaurantId: 'rest-reddit', praiseContributions: [] },
        ],
      }),
      config,
      index,
    );
    const poll = scored.find((row) => row.subjectId === 'dish-poll')!;
    const reddit = scored.find((row) => row.subjectId === 'dish-reddit')!;
    expect(poll.endorsementRaw).toBeGreaterThan(reddit.endorsementRaw);
  });
});

describe('scoring provenance (§5: keys off SOURCES)', () => {
  const service = buildService();
  const config = service.getConfig();
  const index = buildCalibrationIndex('stable', { aRef: 10, aFloor: 2 }, [
    {
      sourceId: 'src-a',
      platform: 'reddit',
      anchorPlaceId: 'place-a',
      engineId: 'e1',
      activity: { stable: 10, fast: 10 },
    },
    {
      sourceId: 'src-b',
      platform: 'poll_surface',
      anchorPlaceId: 'place-b',
      engineId: null,
      activity: { stable: 10, fast: 10 },
    },
  ]);

  it('a dish carries the source with the dominant CALIBRATED mass', () => {
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-a',
            restaurantId: 'rest-a',
            contributions: [
              room('src-a', 'reddit', 5, 0),
              room('src-b', 'poll_surface', 2, 0),
            ],
          },
        ],
        restaurants: [{ restaurantId: 'rest-a', praiseContributions: [] }],
      }),
      config,
      index,
    );
    const dish = scored.find((row) => row.subjectId === 'dish-a')!;
    expect(dish.provenanceSourceId).toBe('src-a');
  });

  it('a restaurant pools its dishes and praise rooms; unattributed mass is never provenance', () => {
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-a',
            restaurantId: 'rest-a',
            contributions: [room('src-a', 'reddit', 2, 0)],
          },
        ],
        restaurants: [
          {
            restaurantId: 'rest-a',
            praiseContributions: [
              room('src-b', 'poll_surface', 5, 0),
              room(null, null, 100, 100), // legacy hole: huge but unattributed
            ],
          },
        ],
      }),
      config,
      index,
    );
    const restaurant = scored.find(
      (row) => row.subjectType === 'restaurant' && row.subjectId === 'rest-a',
    )!;
    expect(restaurant.provenanceSourceId).toBe('src-b');
  });

  it('fully unattributed subjects carry null provenance', () => {
    const scored = service.scoreCandidates(
      withFillers({
        dishes: [
          {
            connectionId: 'dish-a',
            restaurantId: 'rest-a',
            contributions: [room(null, null, 3, 3)],
          },
        ],
        restaurants: [{ restaurantId: 'rest-a', praiseContributions: [] }],
      }),
      config,
      index,
    );
    const dish = scored.find((row) => row.subjectId === 'dish-a')!;
    expect(dish.provenanceSourceId).toBeNull();
  });
});

describe('ONE scoreVersion — epoch pins (§8: re-pin only with a version bump)', () => {
  function buildPinningPrisma() {
    const pins = new Map<string, { a_ref: number; a_floor: number }>();
    const inserts: string[] = [];
    const prisma = {
      $queryRaw: jest.fn(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.join('?');
          if (sql.includes('FROM crave_score_calibration_epochs')) {
            const key = `${String(values[0])}:${String(values[1])}`;
            const pin = pins.get(key);
            return Promise.resolve(pin ? [pin] : []);
          }
          return Promise.resolve([]);
        },
      ),
      $executeRaw: jest.fn(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.join('?');
          if (sql.includes('INSERT INTO crave_score_calibration_epochs')) {
            const key = `${String(values[0])}:${String(values[1])}`;
            inserts.push(key);
            if (!pins.has(key)) {
              pins.set(key, {
                a_ref: values[2] as number,
                a_floor: values[3] as number,
              });
            }
          }
          return Promise.resolve(1);
        },
      ),
    };
    return { prisma, pins, inserts };
  }

  it('derives + pins on first use, then reuses the pin even when the corpus moves', async () => {
    const { prisma, inserts } = buildPinningPrisma();
    const service = buildService(prisma) as unknown as {
      resolveLaneConstants(
        scoreVersion: string,
        lane: string,
        activities: number[],
      ): Promise<{ aRef: number; aFloor: number }>;
    };
    const first = await service.resolveLaneConstants(
      'crave-score-v4',
      'stable',
      [2, 4, 6],
    );
    expect(first.aRef).toBeCloseTo(4, 6);
    expect(inserts).toHaveLength(1);

    // The corpus doubled — the pinned epoch must NOT move.
    const second = await service.resolveLaneConstants(
      'crave-score-v4',
      'stable',
      [4, 8, 12],
    );
    expect(second).toEqual(first);
    expect(inserts).toHaveLength(1);
  });

  it('a version bump opens a fresh epoch (new pin derived)', async () => {
    const { prisma, inserts } = buildPinningPrisma();
    const service = buildService(prisma) as unknown as {
      resolveLaneConstants(
        scoreVersion: string,
        lane: string,
        activities: number[],
      ): Promise<{ aRef: number; aFloor: number }>;
    };
    await service.resolveLaneConstants('crave-score-v4', 'stable', [2, 4, 6]);
    const bumped = await service.resolveLaneConstants(
      'crave-score-v5',
      'stable',
      [4, 8, 12],
    );
    expect(bumped.aRef).toBeCloseTo(8, 6);
    expect(inserts).toHaveLength(2);
  });

  it('the config carries exactly ONE scoreVersion string', () => {
    const config = buildService().getConfig();
    expect(config.scoreVersion).toBe('crave-score-v4');
  });
});
