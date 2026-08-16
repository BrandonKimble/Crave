import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SpendBudgetClosedError } from '../external-integrations/governance/governance.service';
import {
  classifyEnrichmentError,
  classifyNoMatchReason,
} from './enrichment-failure-taxonomy';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';

/**
 * THREE TIMEOUTS MUST NOT BURY A REAL RESTAURANT.
 *
 * `enrichmentFailureCount` reaching `noMatchAttemptThreshold` (3) makes the
 * janitor archive the entity PERMANENTLY, and an archived entity is excluded
 * from every future enrichment pass. Both writers incremented that counter on
 * EVERY failed outcome, so three Google 429s — or three socket timeouts, or
 * three passes while the Places budget gate was closed — retired a grounded,
 * real business with no way back.
 *
 * The mutation this spec is built to catch: delete the
 * `verdict.failureClass === 'definitive'` gate in front of
 * `countEnrichmentFailure()` (i.e. increment unconditionally, as before) and
 * the transient cases below go RED, because the write again carries
 * `enrichmentFailureCount`. Invert the gate and the definitive cases go RED.
 */
describe('the enrichment failure taxonomy (transient failures do not archive)', () => {
  describe('classification of the shapes that actually arrive', () => {
    it('nobody answered ⇒ TRANSIENT', () => {
      expect(
        classifyEnrichmentError(
          new HttpException('rate limit', HttpStatus.TOO_MANY_REQUESTS),
        ),
      ).toEqual({
        failureClass: 'transient',
        failureReasonCode: 'rate_limited',
      });

      expect(
        classifyEnrichmentError(
          new InternalServerErrorException('Failed to fetch Google Place'),
        ),
      ).toEqual({
        failureClass: 'transient',
        failureReasonCode: 'upstream_server_error',
      });

      expect(
        classifyEnrichmentError(
          new ServiceUnavailableException('API key is not configured'),
        ),
      ).toEqual({
        failureClass: 'transient',
        failureReasonCode: 'service_unavailable',
      });

      expect(
        classifyEnrichmentError(
          new SpendBudgetClosedError('budget exhausted', 'exhausted'),
        ),
      ).toEqual({
        failureClass: 'transient',
        failureReasonCode: 'places_budget_exhausted',
      });

      const timeout = Object.assign(new Error('timeout of 10000ms exceeded'), {
        code: 'ECONNABORTED',
      });
      expect(classifyEnrichmentError(timeout)).toEqual({
        failureClass: 'transient',
        failureReasonCode: 'network_error',
      });
    });

    it('an unrecognized shape defaults to TRANSIENT, never to a permanent verdict', () => {
      expect(classifyEnrichmentError(new Error('who knows'))).toEqual({
        failureClass: 'transient',
        failureReasonCode: 'unclassified',
      });
    });

    it('Google gave a real answer ⇒ DEFINITIVE', () => {
      expect(
        classifyEnrichmentError(new NotFoundException('Place not found')),
      ).toEqual({
        failureClass: 'definitive',
        failureReasonCode: 'place_not_found',
      });

      expect(
        classifyEnrichmentError(new BadRequestException('invalid field mask')),
      ).toEqual({
        failureClass: 'definitive',
        failureReasonCode: 'bad_request',
      });

      expect(
        classifyNoMatchReason('no prediction matched preferred place types'),
      ).toEqual({
        failureClass: 'definitive',
        failureReasonCode: 'no_acceptable_candidate',
      });

      expect(classifyNoMatchReason('place permanently closed')).toEqual({
        failureClass: 'definitive',
        failureReasonCode: 'place_permanently_closed',
      });
    });
  });

  describe('what the writers actually persist', () => {
    type EntityUpdateArgs = { data: Record<string, unknown> };

    function makeService() {
      const update = jest
        .fn<Promise<unknown>, [EntityUpdateArgs]>()
        .mockResolvedValue({});
      const logger = {
        setContext: () => logger,
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      const service = new RestaurantLocationEnrichmentService(
        { entity: { update } } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { get: () => undefined } as never,
        { emit: jest.fn() } as never,
        {
          decidedVerdicts: () => Promise.resolve(new Map()),
          record: () => Promise.resolve(undefined),
          markExecuted: () => Promise.resolve(undefined),
          pendingExecution: () => Promise.resolve([]),
        } as never,
        logger as never,
      );
      const asPrivate = service as unknown as {
        recordEnrichmentFailure(
          entity: unknown,
          reason: string,
          extras: Record<string, unknown>,
          verdict: { failureClass: string; failureReasonCode: string },
        ): Promise<void>;
        recordNoMatchCandidates(
          entity: unknown,
          reason: string,
          metadata: Record<string, unknown>,
        ): Promise<void>;
      };
      return { asPrivate, update };
    }

    const ENTITY = {
      entityId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      restaurantMetadata: {},
    };

    function lastAttempt(
      update: jest.Mock<Promise<unknown>, [EntityUpdateArgs]>,
    ) {
      const metadata = update.mock.calls[0][0].data.restaurantMetadata as {
        lastEnrichmentAttempt: Record<string, unknown>;
      };
      return metadata.lastEnrichmentAttempt;
    }

    it('a 429 leaves the counter untouched — the entity stays retry-eligible', async () => {
      const { asPrivate, update } = makeService();
      const error = new HttpException(
        'rate limit',
        HttpStatus.TOO_MANY_REQUESTS,
      );

      await asPrivate.recordEnrichmentFailure(
        ENTITY,
        error.message,
        {},
        classifyEnrichmentError(error),
      );

      const data = update.mock.calls[0][0].data;
      // THE ASSERTION THE OLD CODE FAILS: the write must not carry the counter
      // at all. A strike here is a step toward a permanent archive.
      expect(data).not.toHaveProperty('enrichmentFailureCount');
      expect(lastAttempt(update)).toMatchObject({
        failureClass: 'transient',
        failureReasonCode: 'rate_limited',
      });
    });

    it('a socket timeout leaves the counter untouched', async () => {
      const { asPrivate, update } = makeService();
      const error = Object.assign(new Error('timeout of 10000ms exceeded'), {
        code: 'ETIMEDOUT',
      });

      await asPrivate.recordEnrichmentFailure(
        ENTITY,
        error.message,
        {},
        classifyEnrichmentError(error),
      );

      expect(update.mock.calls[0][0].data).not.toHaveProperty(
        'enrichmentFailureCount',
      );
      expect(lastAttempt(update)).toMatchObject({
        failureClass: 'transient',
        failureReasonCode: 'network_error',
      });
    });

    it('a definitive no-match DOES spend a strike', async () => {
      const { asPrivate, update } = makeService();

      await asPrivate.recordNoMatchCandidates(
        ENTITY,
        'no prediction matched preferred place types',
        {},
      );

      expect(update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          enrichmentFailureCount: { increment: 1 },
        }),
      );
      expect(lastAttempt(update)).toMatchObject({
        failureClass: 'definitive',
        failureReasonCode: 'no_acceptable_candidate',
      });
    });

    it('a definitive 404 from Google also spends a strike', async () => {
      const { asPrivate, update } = makeService();
      const error = new NotFoundException('Place not found');

      await asPrivate.recordEnrichmentFailure(
        ENTITY,
        error.message,
        {},
        classifyEnrichmentError(error),
      );

      expect(update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          enrichmentFailureCount: { increment: 1 },
        }),
      );
      expect(lastAttempt(update)).toMatchObject({
        failureClass: 'definitive',
        failureReasonCode: 'place_not_found',
      });
    });

    it('the breadcrumb is queryable: class, code and timestamp all land in lastEnrichmentAttempt', async () => {
      const { asPrivate, update } = makeService();

      await asPrivate.recordEnrichmentFailure(
        ENTITY,
        'Place not found',
        {},
        classifyEnrichmentError(new NotFoundException('Place not found')),
      );

      const attempt = lastAttempt(update);
      expect(attempt.failureClass).toBe('definitive');
      expect(attempt.failureReasonCode).toBe('place_not_found');
      expect(typeof attempt.failureAt).toBe('string');
      expect(Number.isNaN(Date.parse(attempt.failureAt as string))).toBe(false);
    });
  });
});
